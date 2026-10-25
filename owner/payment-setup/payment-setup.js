import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '../../auth/supabase-config.js';

const supabase=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const $=selector=>document.querySelector(selector);
const OGREENA_STRIPE_ACCOUNT_ID='acct_1UTpIlI19b4U0AqM';

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
    const manage=$('#manageBankAccount');manage.removeAttribute('href');manage.setAttribute('aria-disabled','true');manage.textContent='Select Ogreena in Stripe';
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
initialize().catch(error=>{$('#ownerStatus').textContent=error.message||'Payment setup could not load.';});
