import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '../../auth/supabase-config.js';

const supabase=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storage:window.localStorage,storageKey:'ogreena-auth-session'}});
const $=selector=>document.querySelector(selector);
const OGREENA_STRIPE_ACCOUNT_ID='acct_1UTpIlI19b4U0AqM';
let connectInstance;

function loadStripeConnect(){
  if(window.StripeConnect?.init)return Promise.resolve(window.StripeConnect);
  return new Promise((resolve,reject)=>{
    const existing=document.querySelector('script[data-ogreena-stripe-connect]');
    if(existing){existing.addEventListener('load',()=>resolve(window.StripeConnect),{once:true});existing.addEventListener('error',()=>reject(new Error('Stripe Connect could not load.')),{once:true});return;}
    const script=document.createElement('script');
    script.src='https://connect-js.stripe.com/v0.1/connect.js';
    script.async=true;script.dataset.ogreenaStripeConnect='true';
    script.addEventListener('load',()=>window.StripeConnect?.init?resolve(window.StripeConnect):reject(new Error('Stripe Connect did not initialize.')),{once:true});
    script.addEventListener('error',()=>reject(new Error('Stripe Connect could not load.')),{once:true});
    document.head.appendChild(script);
  });
}

async function openEmbeddedStripe(){
  const panel=$('#embeddedStripe');
  const status=$('#embeddedStripeStatus');
  panel.hidden=false;status.hidden=false;
  status.textContent='Opening Stripe’s secure payout form…';
  try{
    if(!connectInstance){
      const stripeConnect=await loadStripeConnect();
      const result=await supabase.functions.invoke('create-connect-account-session');
      if(result.error)throw result.error;
      const sessionData=result.data;
      if(sessionData.accountId!==OGREENA_STRIPE_ACCOUNT_ID)throw new Error('Stripe returned the wrong Ogreena merchant account.');
      let firstClientSecret=sessionData.clientSecret;
      const connector=await stripeConnect.init({
        publishableKey:sessionData.publishableKey,
        fetchClientSecret:async()=>{
          if(firstClientSecret){const secret=firstClientSecret;firstClientSecret=undefined;return secret;}
          const refresh=await supabase.functions.invoke('create-connect-account-session');
          if(refresh.error)throw refresh.error;
          if(refresh.data.accountId!==OGREENA_STRIPE_ACCOUNT_ID)throw new Error('Stripe returned the wrong Ogreena merchant account.');
          return refresh.data.clientSecret;
        },
        appearance:{overlays:'dialog',variables:{colorPrimary:'#0f6943',colorBackground:'#fffdf6',colorText:'#163e2d',borderRadius:'12px'}},
      });
      connectInstance={create(name){const element=document.createElement(`stripe-connect-${name}`);element.setConnector(connector.connect);return element;}};
    }
    const banner=connectInstance.create('notification-banner');
    const payouts=connectInstance.create('payouts');
    $('#stripeNotificationBanner').replaceChildren(banner);
    $('#stripePayouts').replaceChildren(payouts);
    $('#connectionStatus').textContent='Stripe Account Connected';
    $('#connectionStatus').className='status-pill good';
    status.hidden=true;
  }catch(error){
    connectInstance=undefined;
    $('#connectionStatus').textContent='Action Required';
    $('#connectionStatus').className='status-pill attention';
    status.hidden=false;
    status.textContent=error?.context?.body?.error||error?.message||'Secure Stripe payout management is not available yet.';
  }
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
    $('#embeddedStripe').hidden=false;
    $('#embeddedStripeStatus').textContent=connectReason||'Stripe authorization was not completed.';
  }else{
    await openEmbeddedStripe();
  }
}
initialize().catch(error=>{$('#ownerStatus').textContent=error.message||'Payment setup could not load.';});
