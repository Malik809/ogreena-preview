import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { corsHeaders } from '../_shared/owner.ts';

const json=(body:unknown,status=200,origin:string|null=null)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders(origin),'Content-Type':'application/json'}});
const testPattern=/(^|[+._\s-])(test|demo|sample|example|invalid|validation|playwright|mock)([+._@\s-]|$)/i;
const validEmail=(value:string)=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const escapeHtml=(value:string)=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
const welcomeHtml=(name:string)=>`<h1>Hi${name?` ${escapeHtml(name)}`:''}, Welcome to Ogreena! 🌿</h1><p>Thank you for becoming a member of Ogreena!</p><p>We’re excited to welcome you to our growing community.</p><p>Ogreena is a green home services and facilities maintenance company dedicated to helping homeowners, businesses, and property managers maintain clean, safe, and comfortable spaces.</p><p>Our licensed technicians are committed to providing reliable, professional service while promoting environmentally responsible solutions.</p><h2>We Offer</h2><ul><li>Residential and commercial cleaning</li><li>Carpet cleaning and housekeeping</li><li>Electrical services</li><li>Facilities maintenance</li><li>Landscaping and hauling</li><li>Cleaning products</li></ul><p><strong>FREE ESTIMATES AVAILABLE!</strong></p><p>Whether you need to schedule a service, request an estimate, or order cleaning products, we’re here to help.</p><h2>Contact Ogreena</h2><p>Phone: <a href="tel:+15104729327">(510) 472-9327</a><br>Email: <a href="mailto:office@ogreena.com">office@ogreena.com</a><br>Website: <a href="https://www.ogreena.com">www.ogreena.com</a></p><p>Thank you again for joining Ogreena. We look forward to serving you!</p><p>The Ogreena Team 🌿<br>Green Home Services &amp; Facilities Maintenance</p>`;

Deno.serve(async request=>{
  const origin=request.headers.get('Origin');
  if(request.method==='OPTIONS')return new Response('ok',{headers:corsHeaders(origin)});
  if(request.method!=='POST')return json({error:'Method not allowed'},405,origin);
  const url=Deno.env.get('SUPABASE_URL'),anonKey=Deno.env.get('SUPABASE_ANON_KEY'),serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!url||!anonKey||!serviceKey)return json({error:'Server configuration is incomplete'},500,origin);
  const token=(request.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');
  const authClient=createClient(url,anonKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error:userError}=await authClient.auth.getUser(token);
  if(userError||!user)return json({error:'Authentication required'},401,origin);
  const admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const ownerRole=await admin.from('user_roles').select('user_id').eq('user_id',user.id).eq('role','owner').maybeSingle();
  if(ownerRole.error||!ownerRole.data)return json({error:'Owner access required'},403,origin);
  const body=await request.json().catch(()=>({}));
  const action=String(body.action||'status');

  const allUsers:any[]=[];
  for(let page=1;page<=20;page++){
    const result=await admin.auth.admin.listUsers({page,perPage:1000});
    if(result.error)return json({error:'Customer authentication records could not be loaded'},500,origin);
    allUsers.push(...result.data.users);if(result.data.users.length<1000)break;
  }
  const [rolesResult,profilesResult,jobsResult]=await Promise.all([
    admin.from('user_roles').select('user_id').eq('role','customer'),
    admin.from('profiles').select('id,display_name'),
    admin.from('customer_email_jobs').select('*').order('created_at',{ascending:false}).limit(1000)
  ]);
  if(rolesResult.error||profilesResult.error||jobsResult.error)return json({error:'Email management records could not be loaded'},500,origin);
  const customerIds=new Set((rolesResult.data||[]).map(row=>row.user_id));
  const profiles=Object.fromEntries((profilesResult.data||[]).map(row=>[row.id,row]));
  const jobs=jobsResult.data||[];
  const activeKeys=new Set(jobs.filter(row=>['queued','sending'].includes(row.status)).map(row=>`${row.customer_id}:${row.email_type}`));
  const blockedIds=new Set(jobs.filter(row=>['bounced','suppressed'].includes(row.status)).map(row=>row.customer_id));
  const customers=allUsers.filter(account=>customerIds.has(account.id)).map(account=>({
    id:account.id,email:String(account.email||'').toLowerCase(),name:profiles[account.id]?.display_name||'Account holder',
    verified:Boolean(account.email_confirmed_at),test:[account.email,profiles[account.id]?.display_name].some(value=>testPattern.test(String(value||''))),
    blocked:blockedIds.has(account.id),verificationQueued:activeKeys.has(`${account.id}:verification`),welcomeQueued:activeKeys.has(`${account.id}:welcome`)
  }));
  const eligible=(type:string)=>customers.filter(row=>validEmail(row.email)&&!row.test&&!row.blocked&&(type==='verification'?!row.verified&&!row.verificationQueued:!row.welcomeQueued));
  if(action==='status')return json({counts:{verification:eligible('verification').length,welcome:eligible('welcome').length},jobs},200,origin);

  if(action==='preview'){
    const type=body.emailType==='verification'?'verification':'welcome';
    const ids=Array.isArray(body.customerIds)?new Set(body.customerIds.map(String)):null;
    const rows=eligible(type).filter(row=>!ids||ids.has(row.id));
    return json({emailType:type,recipientCount:rows.length,recipients:rows.map(row=>({id:row.id,email:row.email,name:row.name}))},200,origin);
  }

  if(action==='enqueue'){
    if(body.confirmed!==true)return json({error:'Explicit owner confirmation is required'},400,origin);
    const type=body.emailType==='verification'?'verification':'welcome';
    const ids=Array.isArray(body.customerIds)?new Set(body.customerIds.map(String)):null;
    const rows=eligible(type).filter(row=>!ids||ids.has(row.id));
    if(!rows.length)return json({ok:true,queued:0,jobs},200,origin);
    const batchId=crypto.randomUUID();
    const payload=rows.map(row=>({customer_id:row.id,recipient_email:row.email,email_type:type,requested_by:user.id,batch_id:batchId,status:'queued'}));
    const inserted=await admin.from('customer_email_jobs').insert(payload).select('id,status');
    if(inserted.error)return json({error:'The email queue could not be created'},500,origin);
    if(type==='verification'){
      for(const row of rows){
        const queued=await admin.rpc('enqueue_auth_verification_resend_service',{target_user_id:row.id,target_email:row.email});
        if(queued.error){
          await admin.from('customer_email_jobs').update({status:'failed',last_error:'The existing verification queue could not accept this recipient.',updated_at:new Date().toISOString()}).eq('customer_id',row.id).eq('email_type','verification').eq('status','queued');
          return json({error:'The existing verification queue could not accept every recipient.'},500,origin);
        }
      }
    }
    return json({ok:true,queued:inserted.data.length,batchId},200,origin);
  }

  if(action==='send-one'){
    const jobId=String(body.jobId||'');
    const job=jobs.find(row=>row.id===jobId);
    if(!job||job.status!=='queued'||new Date(job.available_at).getTime()>Date.now())return json({error:'No eligible queued email is available'},409,origin);
    const account=allUsers.find(row=>row.id===job.customer_id);
    if(!account||account.email!==job.recipient_email)return json({error:'Recipient validation failed'},409,origin);
    if(job.email_type==='verification'&&account.email_confirmed_at){await admin.from('customer_email_jobs').update({status:'verified',verified_at:account.email_confirmed_at,updated_at:new Date().toISOString()}).eq('id',job.id);return json({ok:true,status:'verified'},200,origin);}
    const recent=jobs.find(row=>row.customer_id===job.customer_id&&row.email_type===job.email_type&&row.id!==job.id&&row.sent_at&&Date.now()-new Date(row.sent_at).getTime()<60000);
    if(recent)return json({error:'The 60-second resend cooldown is active'},429,origin);
    await admin.from('customer_email_jobs').update({status:'sending',attempt_count:job.attempt_count+1,updated_at:new Date().toISOString()}).eq('id',job.id).eq('status','queued');
    try{
      let providerMessageId:string|null=null;
      if(job.email_type==='verification'){
        const result=await authClient.auth.resend({type:'signup',email:job.recipient_email,options:{emailRedirectTo:'https://ogreena.com/auth/'}});
        if(result.error)throw result.error;
      }else{
        const resendKey=Deno.env.get('RESEND_API_KEY'),fromEmail=Deno.env.get('NOTIFICATION_FROM_EMAIL')||'Ogreena <auth@auth.ogreena.com>';
        if(!resendKey)throw new Error('RESEND_API_KEY is not configured');
        const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${resendKey}`,'Content-Type':'application/json'},body:JSON.stringify({from:fromEmail,to:[job.recipient_email],subject:'Welcome to Ogreena! 🌿',html:welcomeHtml(profiles[job.customer_id]?.display_name||'')})});
        const result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.message||`Email provider returned ${response.status}`);providerMessageId=result.id||null;
      }
      await admin.from('customer_email_jobs').update({status:'sent',provider:job.email_type==='verification'?'supabase-auth':'resend',provider_message_id:providerMessageId,sent_at:new Date().toISOString(),last_error:null,updated_at:new Date().toISOString()}).eq('id',job.id);
      return json({ok:true,status:'sent'},200,origin);
    }catch(error){
      const message=error instanceof Error?error.message:'Email delivery failed';
      await admin.from('customer_email_jobs').update({status:'failed',last_error:message.slice(0,1000),available_at:new Date(Date.now()+15*60*1000).toISOString(),updated_at:new Date().toISOString()}).eq('id',job.id);
      return json({error:message},502,origin);
    }
  }
  return json({error:'Unsupported action'},400,origin);
});
