import {createClient} from 'npm:@supabase/supabase-js@2.57.4';
import {corsHeaders,requireAuthenticated} from '../_shared/owner.ts';
import {buildCustomerEmail} from './email-template.mjs';

const json=(body:unknown,status:number,origin:string|null)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders(origin,{allowLocalPreview:true}),'Content-Type':'application/json'}});
const validUuid=(value:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

Deno.serve(async request=>{
  const origin=request.headers.get('Origin');
  if(request.method==='OPTIONS')return new Response('ok',{headers:corsHeaders(origin,{allowLocalPreview:true})});
  if(request.method!=='POST')return json({error:'Method not allowed'},405,origin);
  let admin:ReturnType<typeof createClient>|null=null;
  let inquiryId='';
  try{
    const {user,client}=await requireAuthenticated(request);
    if(!user.email)throw new Error('A registered customer email is required');
    const roleResult=await client.from('user_roles').select('role').eq('user_id',user.id).single();
    if(roleResult.error||roleResult.data?.role!=='customer')return json({error:'Customer access required'},403,origin);
    const body=await request.json().catch(()=>({}));
    const subject=String(body.subject||'').trim(),message=String(body.message||'').trim(),submissionId=String(body.submissionId||'');
    if(subject.length<2||subject.length>120)return json({error:'Subject must be between 2 and 120 characters'},400,origin);
    if(message.length<2||message.length>2000)return json({error:'Message must be between 2 and 2000 characters'},400,origin);
    if(!validUuid(submissionId))return json({error:'A valid submission ID is required'},400,origin);

    const url=Deno.env.get('SUPABASE_URL'),serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if(!url||!serviceKey)throw new Error('Supabase server configuration is incomplete');
    admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
    const claim=await admin.rpc('claim_customer_email_inquiry',{p_customer_id:user.id,p_submission_id:submissionId,p_subject:subject});
    if(claim.error){
      if(claim.error.message?.includes('CUSTOMER_EMAIL_RATE_LIMIT'))return json({error:'Too many emails were sent. Please wait before trying again.'},429,origin);
      throw claim.error;
    }
    const inquiry=claim.data?.[0];
    if(!inquiry)throw new Error('Email request could not be recorded');
    if(!inquiry.is_new)return json({ok:true,duplicate:true},200,origin);
    inquiryId=inquiry.inquiry_id;

    const ledger=(await admin.from('customer_email_inquiries').select('message_id').eq('id',inquiryId).single()).data;
    if(!ledger?.message_id){
      let conversation=(await admin.from('service_conversations').select('id').eq('customer_id',user.id).eq('service_slug','general-inquiry').maybeSingle()).data;
      if(!conversation){
        const created=await admin.from('service_conversations').insert({customer_id:user.id,service_slug:'general-inquiry',participant_kind:'customer'}).select('id').single();
        if(created.error?.code==='23505')conversation=(await admin.from('service_conversations').select('id').eq('customer_id',user.id).eq('service_slug','general-inquiry').single()).data;
        else if(created.error)throw created.error;
        else conversation=created.data;
      }
      const saved=await admin.from('messages').insert({conversation_id:conversation.id,sender_id:user.id,recipient_id:null,body:`Email inquiry\nSubject: ${subject}\n\n${message}`,message_type:'email'}).select('id').single();
      if(saved.error)throw saved.error;
      const linked=await admin.from('customer_email_inquiries').update({message_id:saved.data.id,updated_at:new Date().toISOString()}).eq('id',inquiryId);
      if(linked.error)throw linked.error;
    }

    const resendKey=Deno.env.get('RESEND_API_KEY'),fromEmail=Deno.env.get('NOTIFICATION_FROM_EMAIL');
    if(!resendKey||!fromEmail)throw new Error('Email provider is not configured');
    const profile=(await admin.from('profiles').select('display_name').eq('id',user.id).maybeSingle()).data;
    const email=buildCustomerEmail({customerEmail:user.email,customerName:profile?.display_name||'Ogreena customer',subject,message});
    const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${resendKey}`,'Content-Type':'application/json','Idempotency-Key':`customer-inquiry/${inquiryId}`},body:JSON.stringify({from:fromEmail,...email})});
    const provider=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(provider?.message||`Email provider returned ${response.status}`);
    await admin.from('customer_email_inquiries').update({status:'sent',provider_message_id:provider.id||null,sent_at:new Date().toISOString(),last_error:null,updated_at:new Date().toISOString()}).eq('id',inquiryId);
    return json({ok:true,duplicate:false},200,origin);
  }catch(error){
    if(admin&&inquiryId)await admin.from('customer_email_inquiries').update({status:'failed',last_error:(error instanceof Error?error.message:'Email could not be sent').slice(0,1000),updated_at:new Date().toISOString()}).eq('id',inquiryId);
    return json({error:error instanceof Error?error.message:'Email could not be sent'},500,origin);
  }
});
