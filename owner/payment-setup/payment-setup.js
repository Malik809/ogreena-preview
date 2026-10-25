import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '../../auth/supabase-config.js';

const supabase=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storage:window.localStorage,storageKey:'ogreena-auth-session'}});
const $=selector=>document.querySelector(selector);
let connectInstance;

function sandboxOnboardingEnabled(){
  return new URLSearchParams(location.search).get('sandbox')==='onboarding';
}

async function openEmbeddedStripe(){
  const panel=$('#embeddedStripe');
  const status=$('#embeddedStripeStatus');
  const openButton=$('#openPayoutForm');
  panel.hidden=false;status.hidden=false;
  document.body.classList.add('payout-modal-open');
  openButton.disabled=true;
  status.textContent='Opening Stripe’s secure payout form…';
  try{
    const functionName=sandboxOnboardingEnabled()?'create-sandbox-onboarding-session':'create-connect-account-session';
    const componentName=sandboxOnboardingEnabled()?'account-onboarding':'account-management';
    if(!connectInstance){
      const {loadConnectAndInitialize}=await import('https://cdn.jsdelivr.net/npm/@stripe/connect-js@3.3.1/+esm');
      const result=await supabase.functions.invoke(functionName);
      if(result.error)throw result.error;
      const sessionData=result.data;
      if(!/^acct_[A-Za-z0-9]+$/.test(sessionData.accountId||''))throw new Error('Stripe returned an invalid connected account.');
      let firstClientSecret=sessionData.clientSecret;
      connectInstance=loadConnectAndInitialize({
        publishableKey:sessionData.publishableKey,
        fetchClientSecret:async()=>{
          if(firstClientSecret){const secret=firstClientSecret;firstClientSecret=undefined;return secret;}
          const refresh=await supabase.functions.invoke(functionName);
          if(refresh.error)throw refresh.error;
          if(refresh.data.accountId!==sessionData.accountId)throw new Error('Stripe connected account ownership changed during this session.');
          return refresh.data.clientSecret;
        },
        appearance:{overlays:'dialog',variables:{colorPrimary:'#0f6943',colorBackground:'#fffdf6',colorText:'#163e2d',borderRadius:'12px'}},
      });
    }
    const banner=connectInstance.create('notification-banner');
    const payoutDetails=connectInstance.create(componentName);
    $('#stripeNotificationBanner').replaceChildren(banner);
    $('#stripePayoutDetails').replaceChildren(payoutDetails);
    $('#connectionStatus').textContent='Stripe Account Connected';
    $('#connectionStatus').className='status-pill good';
    status.hidden=true;
  }catch(error){
    connectInstance=undefined;
    $('#connectionStatus').textContent='Action Required';
    $('#connectionStatus').className='status-pill attention';
    status.hidden=false;
    status.textContent=error?.context?.body?.error||error?.message||'Secure Stripe payout management is not available yet.';
  }finally{
    openButton.disabled=false;
  }
}

function closeEmbeddedStripe(){
  $('#embeddedStripe').hidden=true;
  document.body.classList.remove('payout-modal-open');
  $('#openPayoutForm').focus();
}

async function initialize(){
  const {data:{user},error}=await supabase.auth.getUser();
  if(error||!user){$('#ownerStatus').textContent='Sign in with an authorized owner account to continue.';return;}
  const {data:role,error:roleError}=await supabase.from('user_roles').select('role').eq('user_id',user.id).single();
  if(roleError||role?.role!=='owner'){$('#ownerStatus').textContent='This account is not authorized to manage Ogreena payments.';return;}
  $('#deniedPanel').hidden=true;$('#verificationPage').hidden=false;
  const params=new URLSearchParams(location.search);
  const connectResult=params.get('connect');
  const connectReason=params.get('reason');
  if(connectResult==='error'||connectResult==='cancelled'){
    $('#connectionStatus').textContent='Action Required';
    $('#connectionStatus').className='status-pill attention';
    $('#embeddedStripeStatus').textContent=connectReason||'Stripe authorization was not completed.';
  }
  $('#openPayoutForm').addEventListener('click',openEmbeddedStripe);
  $('#closePayoutForm').addEventListener('click',closeEmbeddedStripe);
}
initialize().catch(error=>{$('#ownerStatus').textContent=error.message||'Payment setup could not load.';});
