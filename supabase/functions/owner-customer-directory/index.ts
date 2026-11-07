import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const cors={
  'Access-Control-Allow-Origin':'https://ogreena.com',
  'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods':'POST, OPTIONS',
  'Content-Type':'application/json'
};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});
const testPattern=/(^|[+._\s-])(test|demo|sample|example|invalid|validation|playwright|mock)([+._@\s-]|$)/i;
const isTestText=(value:unknown)=>testPattern.test(String(value||''))||String(value||'').toLowerCase().endsWith('.invalid');

Deno.serve(async request=>{
  if(request.method==='OPTIONS')return new Response('ok',{headers:cors});
  if(request.method!=='POST')return json({error:'Method not allowed'},405);
  const url=Deno.env.get('SUPABASE_URL'),anonKey=Deno.env.get('SUPABASE_ANON_KEY'),serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!url||!anonKey||!serviceKey)return json({error:'Server configuration is incomplete'},500);
  const token=(request.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');
  if(!token)return json({error:'Authentication required'},401);
  const authClient=createClient(url,anonKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error:userError}=await authClient.auth.getUser(token);
  if(userError||!user)return json({error:'Authentication required'},401);
  const admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const ownerRole=await admin.from('user_roles').select('user_id').eq('user_id',user.id).eq('role','owner').maybeSingle();
  if(ownerRole.error||!ownerRole.data)return json({error:'Owner access required'},403);

  const allUsers:any[]=[];
  for(let page=1;page<=20;page++){
    const result=await admin.auth.admin.listUsers({page,perPage:1000});
    if(result.error)return json({error:'Customer authentication records could not be loaded'},500);
    allUsers.push(...result.data.users);
    if(result.data.users.length<1000)break;
  }
  const [rolesResult,profilesResult,requestsResult,itemsResult,appointmentsResult,paymentsResult]=await Promise.all([
    admin.from('user_roles').select('user_id').eq('role','customer'),
    admin.from('profiles').select('id,display_name,phone,property_street_address,property_unit,property_city,property_state,property_zip,property_type'),
    admin.from('service_requests').select('id,customer_id,customer_name,customer_email,customer_phone,service_slug,summary,details,service_address,preferred_date,status,created_at').order('created_at',{ascending:false}),
    admin.from('service_request_items').select('request_id,service_name,item_name,requested_quantity,unit_label').order('created_at'),
    admin.from('appointments').select('id,request_id,customer_id,starts_at,status').order('starts_at',{ascending:false}),
    admin.from('payment_transactions').select('id,customer_id,order_id,payment_kind,status,livemode,created_at').eq('status','paid').order('created_at',{ascending:false})
  ]);
  const queryError=rolesResult.error||profilesResult.error||requestsResult.error||itemsResult.error||appointmentsResult.error||paymentsResult.error;
  if(queryError)return json({error:'Customer directory records could not be loaded'},500);

  const customerIds=new Set((rolesResult.data||[]).map(row=>row.user_id));
  const profileMap:Record<string,any>=Object.fromEntries((profilesResult.data||[]).map(row=>[row.id,row]));
  const itemsByRequest=(itemsResult.data||[]).reduce((groups:Record<string,unknown[]>,row)=>{(groups[row.request_id]||=[]).push(row);return groups;},{});
  const requestRows=(requestsResult.data||[]).map(row=>{
    const isValidationTest=String(row.service_slug||'').toLowerCase().includes('validation')||[row.customer_name,row.customer_email,row.summary,row.details].some(isTestText);
    return {...row,isValidationTest,items:itemsByRequest[row.id]||[]};
  });
  const requestMap:Record<string,any>=Object.fromEntries(requestRows.map(row=>[row.id,row]));
  const requestsByCustomer=requestRows.reduce((groups:Record<string,unknown[]>,row)=>{if(row.customer_id)(groups[row.customer_id]||=[]).push(row);return groups;},{});
  const appointmentsByCustomer=(appointmentsResult.data||[]).reduce((groups:Record<string,unknown[]>,row)=>{if(row.customer_id)(groups[row.customer_id]||=[]).push(row);return groups;},{});
  const purchasesByCustomer=(paymentsResult.data||[]).filter(row=>row.customer_id&&row.order_id&&row.payment_kind==='product'&&row.livemode).reduce((groups:Record<string,unknown[]>,row)=>{(groups[row.customer_id]||=[]).push(row);return groups;},{});
  const customers=allUsers.filter(account=>customerIds.has(account.id)).map(account=>{
    const profile=profileMap[account.id]||{};
    const isTestAccount=[account.email,profile.display_name].some(isTestText);
    const verified=Boolean(account.email_confirmed_at&&account.last_sign_in_at)&&!isTestAccount;
    const address=[profile.property_street_address,profile.property_unit,profile.property_city,profile.property_state,profile.property_zip].filter(Boolean).join(', ');
    const requestHistory:any[]=requestsByCustomer[account.id]||[];
    const appointmentHistory:any[]=appointmentsByCustomer[account.id]||[];
    const purchaseHistory:any[]=purchasesByCustomer[account.id]||[];
    const hasLegitimateRequest=requestHistory.some(row=>!row.isValidationTest);
    const hasScheduledJob=appointmentHistory.some(row=>['confirmed','completed'].includes(row.status)&&row.request_id&&!requestMap[row.request_id]?.isValidationTest);
    const hasCompletedPurchase=purchaseHistory.length>0;
    const actualCustomer=hasLegitimateRequest||hasScheduledJob||hasCompletedPurchase;
    return {id:account.id,name:profile.display_name||'Account holder',email:account.email||'',registeredAt:account.created_at,lastSignInAt:account.last_sign_in_at||null,phone:profile.phone||'',propertyAddress:address,propertyType:profile.property_type||'',verified,isTestAccount,accountSource:account.app_metadata?.provider==='email'?'Public email signup':'Registered account',actualCustomer,activity:{hasLegitimateRequest,hasScheduledJob,hasCompletedPurchase,requestCount:requestHistory.length,appointmentCount:appointmentHistory.length,completedPurchaseCount:purchaseHistory.length},requestHistory,appointmentHistory,purchaseHistory};
  }).sort((a,b)=>new Date(b.registeredAt).getTime()-new Date(a.registeredAt).getTime());
  const realRequests=requestRows.filter(row=>!row.isValidationTest),validationTestRequests=requestRows.filter(row=>row.isValidationTest);
  return json({
    metrics:{totalRegistrations:customers.length,verifiedAccounts:customers.filter(row=>row.verified).length,unverifiedRegistrations:customers.filter(row=>!row.verified).length,actualCustomers:customers.filter(row=>row.actualCustomer).length,testRegistrations:customers.filter(row=>row.isTestAccount).length,realCustomerRequests:realRequests.length,validationTestRequests:validationTestRequests.length},
    customers,
    requests:requestRows
  });
});
