import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const cors={
  'Access-Control-Allow-Origin':'https://ogreena.com',
  'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods':'POST, OPTIONS',
  'Content-Type':'application/json'
};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});
const escapeHtml=(value:string)=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));

Deno.serve(async request=>{
  if(request.method==='OPTIONS')return new Response('ok',{headers:cors});
  if(request.method!=='POST')return json({error:'Method not allowed'},405);

  const url=Deno.env.get('SUPABASE_URL');
  const anonKey=Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!url||!anonKey||!serviceKey)return json({error:'Supabase server configuration is incomplete'},500);
  const authorization=request.headers.get('Authorization')||'';
  const token=authorization.replace(/^Bearer\s+/i,'');
  if(!token)return json({error:'Authentication required'},401);
  const authClient=createClient(url,anonKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error:userError}=await authClient.auth.getUser(token);
  if(userError||!user)return json({error:'Authentication required'},401);

  const admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:deliveries,error:claimError}=await admin.rpc('claim_business_notifications',{batch_size:10});
  if(claimError)return json({error:'Notification queue could not be claimed'},500);
  if(!deliveries?.length)return json({ok:true,processed:0});

  const resendKey=Deno.env.get('RESEND_API_KEY');
  const fromEmail=Deno.env.get('NOTIFICATION_FROM_EMAIL');
  if(!resendKey||!fromEmail){
    const missing=[!resendKey?'RESEND_API_KEY':null,!fromEmail?'NOTIFICATION_FROM_EMAIL':null].filter(Boolean).join(', ');
    await Promise.all(deliveries.map((delivery:{id:string})=>admin.from('business_notification_deliveries').update({status:'failed',last_error:`Email provider is not configured. Missing ${missing}.`,available_at:new Date(Date.now()+15*60*1000).toISOString(),updated_at:new Date().toISOString()}).eq('id',delivery.id)));
    return json({error:`Email provider is not configured. Missing ${missing}.`,processed:deliveries.length},503);
  }

  let sent=0,failed=0;
  for(const delivery of deliveries){
    const dashboardUrl=`https://ogreena.com${delivery.dashboard_path}`;
    const subject=delivery.event_type==='service_request'?`New Ogreena service request: ${delivery.request_type}`:`New Ogreena customer message: ${delivery.request_type}`;
    const html=`<h2>${escapeHtml(subject)}</h2><p><strong>Customer:</strong> ${escapeHtml(delivery.customer_name)}</p><p><strong>Request type:</strong> ${escapeHtml(delivery.request_type)}</p><p><strong>Summary:</strong> ${escapeHtml(delivery.summary)}</p><p><a href="${dashboardUrl}">Open the secure Ogreena Business Dashboard</a></p><p>Sign-in is required to view full customer details.</p>`;
    try{
      const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${resendKey}`,'Content-Type':'application/json'},body:JSON.stringify({from:fromEmail,to:[delivery.recipient_email],subject,html})});
      const responseBody=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(responseBody?.message||`Email provider returned ${response.status}`);
      const result=await admin.from('business_notification_deliveries').update({status:'sent',provider:'resend',provider_message_id:responseBody.id||null,last_error:null,sent_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',delivery.id);
      if(result.error)throw result.error;
      sent++;
    }catch(error){
      const message=error instanceof Error?error.message:'Email delivery failed';
      await admin.from('business_notification_deliveries').update({status:'failed',provider:'resend',last_error:message.slice(0,1000),available_at:new Date(Date.now()+15*60*1000).toISOString(),updated_at:new Date().toISOString()}).eq('id',delivery.id);
      failed++;
    }
  }
  return json({ok:failed===0,processed:deliveries.length,sent,failed},failed?502:200);
});
