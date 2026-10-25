import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '../../auth/supabase-config.js';

const supabase=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storage:window.localStorage,storageKey:'ogreena-auth-session'}});
const $=selector=>document.querySelector(selector);
const OGREENA_STRIPE_ACCOUNT_ID='acct_1UTpIlI19b4U0AqM';
let connectInstance;

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

async function openEmbeddedStripe(){
  const panel=$('#embeddedStripe');
  const status=$('#embeddedStripeStatus');
  const manage=$('#manageBankAccount');
  panel.hidden=false;manage.disabled=true;status.hidden=false;
  status.textContent='Opening Stripe’s secure account-management component…';
  panel.scrollIntoView({behavior:'smooth',block:'start'});
  try{
    if(!connectInstance){
      const {loadConnectAndInitialize}=await import('https://cdn.jsdelivr.net/npm/@stripe/connect-js@3.3.1/+esm');
      const result=await supabase.functions.invoke('create-connect-account-session');
      if(result.error)throw result.error;
      const sessionData=result.data;
      if(sessionData.accountId!==OGREENA_STRIPE_ACCOUNT_ID)throw new Error('Stripe returned the wrong Ogreena merchant account.');
      let firstClientSecret=sessionData.clientSecret;
      connectInstance=loadConnectAndInitialize({
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
    }
    const banner=connectInstance.create('notification-banner');
    const accountManagement=connectInstance.create('account-management');
    $('#stripeNotificationBanner').replaceChildren(banner);
    $('#stripeAccountManagement').replaceChildren(accountManagement);
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
}

$('#refreshStatus').addEventListener('click',()=>loadStatus().catch(error=>{$('#connectionStatus').textContent=error.message||'Status unavailable';$('#connectionStatus').className='status-pill attention';}));
$('#authorizeOgreenaMerchant').addEventListener('click',authorizeOgreenaMerchant);
$('#manageBankAccount').addEventListener('click',openEmbeddedStripe);
$('#closeEmbeddedStripe').addEventListener('click',()=>{$('#embeddedStripe').hidden=true;});
$('#closeStripeGuard').addEventListener('click',()=>{$('#stripeAccountGuard').hidden=true;});
initialize().catch(error=>{$('#ownerStatus').textContent=error.message||'Payment setup could not load.';});
