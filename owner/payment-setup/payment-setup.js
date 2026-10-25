import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '../../auth/supabase-config.js';
const safariSafeAuthLock=async(_name,_acquireTimeout,callback)=>callback();

const supabase=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storage:window.localStorage,storageKey:'ogreena-auth-session',lock:safariSafeAuthLock}});
const $=selector=>document.querySelector(selector);
let connectInstance;
let stripeLoadTimer;
const LIVE_MERCHANT_ACCOUNT='acct_1UTpIlI19b4U0AqM';
const CONNECT_PLATFORM_ACCOUNT='acct_1UUSC7IBe0SKV30I';
const SESSION_FUNCTION='create-connect-account-session';

function renderPayoutStatus(data){
  const payoutStatus=data?.payoutStatus;
  const destination=$('#payoutDestinationStatus');
  const requirements=$('#payoutRequirementsStatus');
  if(!payoutStatus){destination.textContent='Available in Stripe';requirements.textContent='Stripe verification required';return;}
  if(payoutStatus.connected&&payoutStatus.destination){
    const details=[payoutStatus.destination.label,payoutStatus.destination.last4?`ending in ${payoutStatus.destination.last4}`:''].filter(Boolean).join(' · ');
    destination.textContent=details||payoutStatus.destination.type;
  }else destination.textContent='Not connected';
  requirements.textContent=payoutStatus.pastDue?'Past-due information required':payoutStatus.informationRequired?'Additional information required':'No current requirements';
}

async function loadPayoutStatus(){
  const result=await supabase.functions.invoke(SESSION_FUNCTION,{body:{statusOnly:true}});
  if(result.error)throw result.error;
  if(result.data.accountId!==LIVE_MERCHANT_ACCOUNT||result.data.platformAccountId!==CONNECT_PLATFORM_ACCOUNT||result.data.livemode!==true)throw new Error('Stripe payout account verification failed.');
  renderPayoutStatus(result.data);
}

function showStripeFallback(message){
  const status=$('#embeddedStripeStatus');
  status.hidden=false;
  status.textContent=message;
  $('#stripeFallback').hidden=false;
  $('#connectionStatus').textContent='Secure Stripe Access Available';
  $('#connectionStatus').className='status-pill attention';
}

async function openEmbeddedStripe(){
  const panel=$('#embeddedStripe');
  const status=$('#embeddedStripeStatus');
  const openButton=$('#openPayoutForm');
  panel.hidden=false;status.hidden=false;
  $('#stripeFallback').hidden=true;
  clearTimeout(stripeLoadTimer);
  document.body.classList.add('payout-modal-open');
  openButton.disabled=true;
  status.textContent='Opening Stripe’s secure payout form…';
  try{
    if(!connectInstance){
      const {loadConnectAndInitialize}=await import('https://cdn.jsdelivr.net/npm/@stripe/connect-js@3.4.6/+esm');
      const result=await supabase.functions.invoke(SESSION_FUNCTION);
      if(result.error)throw result.error;
      const sessionData=result.data;
      if(!/^acct_[A-Za-z0-9]+$/.test(sessionData.accountId||''))throw new Error('Stripe returned an invalid connected account.');
      if(sessionData.livemode!==true)throw new Error('Live Stripe account management is not available.');
      if(sessionData.payoutsEnabled!==true)throw new Error('Stripe did not enable payout management for this account.');
      if(sessionData.platformAccountId!==CONNECT_PLATFORM_ACCOUNT)throw new Error('Stripe Connect platform mismatch.');
      if(sessionData.accountId!==LIVE_MERCHANT_ACCOUNT)throw new Error('Ogreena merchant account mismatch.');
      renderPayoutStatus(sessionData);
      let firstClientSecret=sessionData.clientSecret;
      connectInstance=loadConnectAndInitialize({
        publishableKey:sessionData.publishableKey,
        fetchClientSecret:async()=>{
          if(firstClientSecret){const secret=firstClientSecret;firstClientSecret=undefined;return secret;}
          const refresh=await supabase.functions.invoke(SESSION_FUNCTION);
          if(refresh.error)throw refresh.error;
          if(refresh.data.accountId!==sessionData.accountId)throw new Error('Stripe connected account ownership changed during this session.');
          if(refresh.data.livemode!==true||refresh.data.payoutsEnabled!==true||refresh.data.platformAccountId!==CONNECT_PLATFORM_ACCOUNT)throw new Error('Stripe live session validation failed.');
          return refresh.data.clientSecret;
        },
        appearance:{overlays:'dialog',variables:{colorPrimary:'#0f6943',colorBackground:'#fffdf6',colorText:'#163e2d',borderRadius:'12px'}},
      });
    }
    const banner=connectInstance.create('notification-banner');
    const payoutDetails=connectInstance.create('payouts');
    payoutDetails.setOnLoadError(({error})=>{
      clearTimeout(stripeLoadTimer);
      showStripeFallback(error?.type==='authentication_error'
        ? 'Stripe authentication could not finish in this browser.'
        : 'Stripe’s embedded payout controls could not load.');
    });
    $('#stripeNotificationBanner').replaceChildren(banner);
    $('#stripePayoutDetails').replaceChildren(payoutDetails);
    $('#connectionStatus').textContent='Stripe Account Connected';
    $('#connectionStatus').className='status-pill good';
    status.hidden=true;
    stripeLoadTimer=setTimeout(()=>showStripeFallback('Stripe authentication is taking longer than expected in this browser.'),20000);
  }catch(error){
    clearTimeout(stripeLoadTimer);
    connectInstance=undefined;
    $('#connectionStatus').textContent='Action Required';
    $('#connectionStatus').className='status-pill attention';
    status.hidden=false;
    status.textContent=error?.context?.body?.error||error?.message||'Secure Stripe payout management is not available yet.';
    $('#stripeFallback').hidden=false;
  }finally{
    openButton.disabled=false;
  }
}

function closeEmbeddedStripe(){
  clearTimeout(stripeLoadTimer);
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
  loadPayoutStatus().catch(()=>{renderPayoutStatus(null);});
}
initialize().catch(error=>{$('#ownerStatus').textContent=error.message||'Payment setup could not load.';});
