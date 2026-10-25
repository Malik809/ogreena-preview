import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '../auth/supabase-config.js';

const safariSafeAuthLock = async (_name, _timeout, callback) => callback();
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession:true, autoRefreshToken:true, detectSessionInUrl:true, storage:window.localStorage, storageKey:'ogreena-auth-session', lock:safariSafeAuthLock },
});
const $ = selector => document.querySelector(selector);
let currentBusiness;
let connectInstance;

function message(target, text, error = false) {
  target.textContent = text;
  target.classList.toggle('error', error);
  target.classList.toggle('success', !error && Boolean(text));
}

async function loadBusinessDashboard(user) {
  const { data: memberships, error } = await supabase
    .from('business_memberships')
    .select('business_id,role,verification_status,businesses!inner(id,display_name,status)')
    .eq('user_id', user.id)
    .eq('role', 'owner')
    .order('created_at', { ascending:true });
  if (error) throw error;
  if (!memberships?.length) {
    $('#accessPanel').hidden = true;
    $('#registrationPanel').hidden = false;
    return;
  }

  const normalizedMemberships = memberships.map(item => ({ ...item, businesses:Array.isArray(item.businesses) ? item.businesses[0] : item.businesses }));
  const requestedBusiness = new URLSearchParams(location.search).get('business');
  const membership = normalizedMemberships.find(item => item.business_id === requestedBusiness) || normalizedMemberships[0];
  const selector = $('#businessSelector');
  selector.replaceChildren(...normalizedMemberships.map(item => {
    const option = document.createElement('option');
    option.value = item.business_id;
    option.textContent = item.businesses.display_name;
    option.selected = item.business_id === membership.business_id;
    return option;
  }));
  $('#businessSelectorWrap').hidden = normalizedMemberships.length < 2;
  selector.addEventListener('change', () => {
    const url = new URL(location.href);
    url.searchParams.set('business', selector.value);
    location.href = url.href;
  }, { once:true });
  const business = Array.isArray(membership.businesses) ? membership.businesses[0] : membership.businesses;
  currentBusiness = { ...business, membershipStatus:membership.verification_status };
  $('#accessPanel').hidden = true;
  $('#dashboardPanel').hidden = false;
  $('#businessName').textContent = business.display_name;
  $('#verificationStatus').textContent = membership.verification_status === 'verified' ? 'Verified owner' : 'Verification pending';
  $('#verificationStatus').classList.toggle('good', membership.verification_status === 'verified');

  if (membership.verification_status !== 'verified' || business.status !== 'verified') return;
  $('#payoutSummary').textContent = 'Your business is verified. Stripe onboarding remains sandbox-only until production registration receives separate approval.';
  const [{ data: accounts }, { data: consents }] = await Promise.all([
    supabase.from('business_connect_accounts').select('environment,onboarding_status').eq('business_id', business.id),
    supabase.from('business_connect_consents').select('environment,consented_at,revoked_at').eq('business_id', business.id),
  ]);
  const testAccount = accounts?.find(account => account.environment === 'test');
  const testConsent = consents?.find(consent => consent.environment === 'test' && !consent.revoked_at);
  $('#connectAccountSummary').textContent = testAccount
    ? `Sandbox payout status: ${testAccount.onboarding_status.replaceAll('_', ' ')}. Stripe account identifiers remain server-managed.`
    : 'No sandbox connected account is assigned. Ogreena will not create one automatically.';
  $('#consentPanel').hidden = Boolean(testConsent);
  $('#startPayoutSetup').hidden = !(testConsent && testAccount);
}

$('#registrationForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form));
  form.querySelector('button').disabled = true;
  message($('#registrationStatus'), 'Submitting the private verification request…');
  const { error } = await supabase.rpc('request_business_registration', {
    requested_name: values.business_name.trim(),
    requested_authority: values.authority_description.trim(),
  });
  form.querySelector('button').disabled = false;
  if (error) return message($('#registrationStatus'), error.message, true);
  message($('#registrationStatus'), 'Business verification requested. No Stripe account was created.');
  setTimeout(() => location.reload(), 900);
});

$('#recordConsent').addEventListener('click', async () => {
  if (!currentBusiness || !$('#connectConsent').checked) return message($('#consentStatus'), 'Check the consent box before continuing.', true);
  const { data:{ user } } = await supabase.auth.getUser();
  const { error } = await supabase.from('business_connect_consents').insert({
    business_id:currentBusiness.id,
    user_id:user.id,
    environment:'test',
    terms_version:'connect-sandbox-v1',
  });
  if (error) return message($('#consentStatus'), error.message, true);
  message($('#consentStatus'), 'Sandbox consent recorded. No live Stripe account was created.');
  setTimeout(() => location.reload(), 900);
});

$('#startPayoutSetup').addEventListener('click', async () => {
  const button = $('#startPayoutSetup');
  button.disabled = true;
  $('#stripePanel').hidden = false;
  $('#stripeStatus').textContent = 'Opening Stripe’s secure sandbox form…';
  try {
    const { data, error } = await supabase.functions.invoke('create-business-connect-session', { body:{ businessId:currentBusiness.id } });
    if (error) throw new Error(data?.error || error.message);
    if (data.livemode !== false) throw new Error('The sandbox route rejected an unsafe Stripe environment.');
    const { loadConnectAndInitialize } = await import('https://cdn.jsdelivr.net/npm/@stripe/connect-js@3.4.6/+esm');
    let initialSecret = data.clientSecret;
    connectInstance = loadConnectAndInitialize({
      publishableKey:data.publishableKey,
      fetchClientSecret:async () => {
        if (initialSecret) { const secret = initialSecret; initialSecret = undefined; return secret; }
        const refreshed = await supabase.functions.invoke('create-business-connect-session', { body:{ businessId:currentBusiness.id } });
        if (refreshed.error || refreshed.data?.livemode !== false) throw new Error('Unable to refresh the secure sandbox session.');
        return refreshed.data.clientSecret;
      },
      appearance:{ overlays:'dialog', variables:{ colorPrimary:'#0f6943', colorBackground:'#fffdf6', colorText:'#163e2d', borderRadius:'12px' } },
    });
    const component = connectInstance.create(data.mode === 'management' ? 'account-management' : 'account-onboarding');
    const banner = connectInstance.create('notification-banner');
    $('#stripeNotification').replaceChildren(banner);
    $('#stripeComponent').replaceChildren(component);
    $('#stripeStatus').textContent = data.mode === 'management' ? 'Secure sandbox payout management' : 'Secure sandbox business verification and payout setup';
  } catch (error) {
    $('#stripeStatus').textContent = error.message || 'The secure sandbox form could not be opened.';
  } finally {
    button.disabled = false;
  }
});

$('#signOut').addEventListener('click', async () => {
  await supabase.auth.signOut({ scope:'local' });
  location.replace('../auth/?mode=signin');
});

async function initialize() {
  const { data:{ user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    $('#accessStatus').innerHTML = 'Sign in to access a private business dashboard. <a href="../auth/?mode=signin">Sign in</a>';
    $('#signOut').hidden = true;
    return;
  }
  await loadBusinessDashboard(user);
}

initialize().catch(error => { $('#accessStatus').textContent = error.message || 'Business access could not be verified.'; });
