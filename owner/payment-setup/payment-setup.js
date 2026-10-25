import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '../../auth/supabase-config.js';

const supabase=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storage:window.localStorage,storageKey:'ogreena-auth-session'}});
const $=selector=>document.querySelector(selector);
const OGREENA_STRIPE_ACCOUNT_ID='acct_1UTpIlI19b4U0AqM';
let connectInstance;

function showStripePanel(panelName){
  const onboarding=panelName==='onboarding';
  $('#stripeOnboardingPanel').hidden=!onboarding;
  $('#stripeAccountManagementPanel').hidden=onboarding;
  $('#showStripeOnboarding').classList.toggle('active',onboarding);
  $('#showStripeAccountManagement').classList.toggle('active',!onboarding);
  $('#showStripeOnboarding').setAttribute('aria-selected',String(onboarding));
  $('#showStripeAccountManagement').setAttribute('aria-selected',String(!onboarding));
}

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

async function authorizeOgreenaMerchant(){
  const button=$('#authorizeOgreenaMerchant');button.disabled=true;
  try{
    const result=await supabase.functions.invoke('start-stripe-connect-oauth');
    if(result.error)throw result.error;
    const target=new URL(result.data.url);
    if(target.origin!=='https://connect.stripe.com')throw new Error('Unexpected Stripe authorization URL.');
    window.location.assign(target.toString());
  }catch(error){button.disabled=false;$('#embeddedStripe').hidden=false;$('#embeddedStripeStatus').textContent=error?.context?.body?.error||error?.message||'Unable to start Stripe authorization.';}
}

async function openEmbeddedStripe(shouldScroll=true){
  const panel=$('#embeddedStripe');
  const status=$('#embeddedStripeStatus');
  const manage=$('#manageBankAccount');
  panel.hidden=false;manage.disabled=true;status.hidden=false;
  status.textContent='Opening Stripe’s secure account-management component…';
  if(shouldScroll)panel.scrollIntoView({behavior:'smooth',block:'start'});
  try{
    if(!connectInstance){
      const stripeConnect=await loadStripeConnect();
      const result=await supabase.functions.invoke('create-connect-account-session');
      if(result.error)throw result.error;
      const sessionData=result.data;
      if(sessionData.accountId!==OGREENA_STRIPE_ACCOUNT_ID)throw new Error('Stripe returned the wrong Ogreena merchant account.');
      $('#authorizeOgreenaMerchant').hidden=true;
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
    const accountOnboarding=connectInstance.create('account-onboarding');
    const accountManagement=connectInstance.create('account-management');
    $('#stripeNotificationBanner').replaceChildren(banner);
    $('#stripeAccountOnboarding').replaceChildren(accountOnboarding);
    $('#stripeAccountManagement').replaceChildren(accountManagement);
    showStripePanel('onboarding');
    status.hidden=true;
  }catch(error){
    connectInstance=undefined;
    status.hidden=false;
    status.textContent=error?.context?.body?.error||error?.message||'Secure Stripe account management is not available yet.';
  }finally{manage.disabled=false;}
}

async function loadStatus(){
  $('#connectionStatus').textContent='Checking status…';
  const result=await supabase.functions.invoke('payment-status');
  if(result.error)throw result.error;
  const account=result.data?.accountStatus;
  const rows=$('#setupStatus').querySelectorAll('strong');
  rows[2].textContent='Disabled pending final approval';
  if(!account?.available){
    $('#connectionStatus').textContent=result.data?.configured?'Stripe connected':'Setup required';
    rows[0].textContent='Review securely in Stripe';
    rows[1].textContent='Review securely in Stripe';
    return;
  }
  if(account.accountId!==OGREENA_STRIPE_ACCOUNT_ID){
    $('#connectionStatus').textContent='Account Mismatch';
    $('#connectionStatus').className='status-pill attention';
    rows[0].textContent='Do not continue';rows[1].textContent='Account selection required';
    $('#bankDestination').textContent='Ogreena payment management is blocked because Stripe returned a different account.';
    const manage=$('#manageBankAccount');manage.disabled=true;manage.textContent='Stripe Account Mismatch';
    return;
  }
  const actionRequired=Boolean(account.disabledReason)||(account.currentlyDue||0)>0;
  const pending=(account.pendingVerification||0)>0;
  $('#accountTypeStatus').textContent=account.businessType==='company'?'Registered Business / LLC':account.businessType==='individual'?'Individual / Independent':'Account type already verified and managed by Stripe.';
  $('#connectionStatus').textContent=actionRequired?'Action Required':pending?'Pending Verification':account.payoutsEnabled?'Bank Connected':'Setup Required';
  $('#connectionStatus').className=`status-pill ${account.payoutsEnabled?'good':actionRequired?'attention':''}`;
  rows[0].textContent=actionRequired?'Action Required':pending?'Pending Verification':account.detailsSubmitted?'Submitted':'Not Submitted';
  rows[1].textContent=account.payoutsEnabled?'Bank Connected':pending?'Pending Verification':'Action Required';
  const destination=$('#bankDestination');
  destination.textContent=account.payoutDestination?.connected
    ? `${account.payoutDestination.display} · managed securely by Stripe`
    : pending?'Stripe is reviewing the payout destination.':'No verified payout destination is available.';
  $('#setupPrompt').hidden=account.detailsSubmitted&&account.payoutsEnabled&&!actionRequired&&!pending;
  $('#connectedPrompt').hidden=!$('#setupPrompt').hidden;
}

async function initialize(){
  const {data:{user},error}=await supabase.auth.getUser();
  if(error||!user){$('#ownerStatus').textContent='Sign in with an authorized owner account to continue.';return;}
  const {data:role,error:roleError}=await supabase.from('user_roles').select('role').eq('user_id',user.id).single();
  if(roleError||role?.role!=='owner'){$('#ownerStatus').textContent='This account is not authorized to manage Ogreena payments.';return;}
  $('#deniedPanel').hidden=true;$('#verificationPage').hidden=false;
  await loadStatus();
  const params=new URLSearchParams(location.search);
  const connectResult=params.get('connect');
  const connectReason=params.get('reason');
  if(connectResult==='error'||connectResult==='cancelled'){
    $('#embeddedStripe').hidden=false;
    $('#embeddedStripeStatus').textContent=connectReason||'Stripe authorization was not completed.';
  }else{
    await openEmbeddedStripe(false);
  }
}

$('#refreshStatus').addEventListener('click',()=>loadStatus().catch(error=>{$('#connectionStatus').textContent=error.message||'Status unavailable';$('#connectionStatus').className='status-pill attention';}));
$('#authorizeOgreenaMerchant').addEventListener('click',authorizeOgreenaMerchant);
$('#manageBankAccount').addEventListener('click',openEmbeddedStripe);
$('#showStripeOnboarding').addEventListener('click',()=>showStripePanel('onboarding'));
$('#showStripeAccountManagement').addEventListener('click',()=>showStripePanel('management'));
$('#closeEmbeddedStripe').addEventListener('click',()=>{$('#embeddedStripe').hidden=true;});
$('#closeStripeGuard').addEventListener('click',()=>{$('#stripeAccountGuard').hidden=true;});
initialize().catch(error=>{$('#ownerStatus').textContent=error.message||'Payment setup could not load.';});
