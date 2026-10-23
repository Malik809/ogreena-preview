import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './supabase-config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});
const authRedirect = 'https://ogreena.com/auth/';

const authPanel = document.querySelector('#authPanel');
const accountPanel = document.querySelector('#accountPanel');
const status = document.querySelector('#authStatus');
const signOutButton = document.querySelector('#signOut');

function setStatus(message, type = '') {
  status.textContent = message;
  status.className = `auth-status ${type}`.trim();
}

function friendlyError(error) {
  if (!error) return 'Something went wrong. Please try again.';
  if (/invalid login/i.test(error.message)) return 'The email or password is incorrect, or the email has not been verified.';
  return error.message;
}

function switchTab(name) {
  document.querySelectorAll('[data-auth-tab]').forEach(button => button.classList.toggle('active', button.dataset.authTab === name));
  document.querySelectorAll('#signInForm,#signUpForm,#recoveryForm,#newPasswordForm').forEach(form => { form.hidden = form.id !== ({signin:'signInForm',signup:'signUpForm',recovery:'recoveryForm',password:'newPasswordForm'}[name]); });
  setStatus('');
}

document.querySelectorAll('[data-auth-tab]').forEach(button => button.addEventListener('click', () => switchTab(button.dataset.authTab)));
const requestedMode = new URLSearchParams(location.search).get('mode');
if (['signin', 'signup', 'recovery'].includes(requestedMode)) switchTab(requestedMode);

document.querySelector('#signUpForm').addEventListener('submit', async event => {
  event.preventDefault(); setStatus('Creating your secure customer account…');
  const values = Object.fromEntries(new FormData(event.currentTarget));
  const { data, error } = await supabase.auth.signUp({ email: values.email, password: values.password, options: { data: { display_name: values.display_name }, emailRedirectTo: authRedirect } });
  if (error) return setStatus(friendlyError(error), 'error');
  event.currentTarget.reset();
  setStatus(data.session ? 'Account created and signed in.' : 'Account created. Check your email to verify your address before signing in.', 'success');
});

document.querySelector('#signInForm').addEventListener('submit', async event => {
  event.preventDefault(); setStatus('Signing in…');
  const values = Object.fromEntries(new FormData(event.currentTarget));
  const { error } = await supabase.auth.signInWithPassword({ email: values.email, password: values.password });
  if (error) return setStatus(friendlyError(error), 'error');
  event.currentTarget.reset(); setStatus('Signed in.', 'success');
});

document.querySelector('#recoveryForm').addEventListener('submit', async event => {
  event.preventDefault(); setStatus('Requesting a secure recovery email…');
  const values = Object.fromEntries(new FormData(event.currentTarget));
  const { error } = await supabase.auth.resetPasswordForEmail(values.email, { redirectTo: authRedirect });
  if (error) return setStatus(friendlyError(error), 'error');
  event.currentTarget.reset(); setStatus('If that account exists, a recovery email has been sent.', 'success');
});

document.querySelector('#newPasswordForm').addEventListener('submit', async event => {
  event.preventDefault(); setStatus('Saving the new password…');
  const password = new FormData(event.currentTarget).get('password');
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return setStatus(friendlyError(error), 'error');
  event.currentTarget.reset(); setStatus('Password updated.', 'success');
});

signOutButton.addEventListener('click', async () => {
  const { error } = await supabase.auth.signOut();
  if (error) setStatus(friendlyError(error), 'error');
});

document.querySelector('#requestForm').addEventListener('submit', async event => {
  event.preventDefault();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const values = Object.fromEntries(new FormData(event.currentTarget));
  const { error } = await supabase.from('service_requests').insert({ customer_id: user.id, service_slug: values.service_slug.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-'), summary: values.summary.trim() });
  if (error) return alert(friendlyError(error));
  event.currentTarget.reset(); await loadRequests(user.id);
});

document.querySelector('#ownerRequestForm').addEventListener('submit', async event => {
  event.preventDefault();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const values = Object.fromEntries(new FormData(event.currentTarget));
  const { error } = await supabase.from('owner_access_requests').insert({ user_id: user.id, business_name: values.business_name.trim(), authority_description: values.authority_description.trim() });
  document.querySelector('#ownerRequestStatus').textContent = error ? friendlyError(error) : 'Owner review requested. Access will remain Customer until identity and business authority are verified by an authorized administrator.';
  if (!error) event.currentTarget.hidden = true;
});

async function loadRequests(userId) {
  const list = document.querySelector('#requestList');
  const { data, error } = await supabase.from('service_requests').select('id,service_slug,summary,status,created_at').eq('customer_id', userId).order('created_at', { ascending: false });
  if (error) { list.textContent = friendlyError(error); return; }
  list.innerHTML = data.length ? data.map(item => `<div class="request-item"><b>${escapeHTML(item.summary)}</b><span>${escapeHTML(item.service_slug)} · ${escapeHTML(item.status)}</span></div>`).join('') : '<p class="muted">No service requests yet.</p>';
}

async function loadProducts() {
  const holder = document.querySelector('#accountProducts');
  const { data, error } = await supabase.from('products').select('id,name,size,price_cents,image_path,display_order').eq('visible', true).order('display_order');
  if (error) { holder.textContent = friendlyError(error); return; }
  holder.innerHTML = data.map(product => `<article class="account-product"><img src="../${escapeHTML(product.image_path)}" alt="${escapeHTML(product.name)} ${escapeHTML(product.size)}"><b>${escapeHTML(product.name)}</b><span>${escapeHTML(product.size)}</span><strong>${new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(product.price_cents / 100)}</strong></article>`).join('');
}

async function renderSession(session) {
  authPanel.hidden = Boolean(session); accountPanel.hidden = !session; signOutButton.hidden = !session;
  if (!session) return;
  const user = session.user;
  const [{ data: profile }, { data: roleRow }] = await Promise.all([
    supabase.from('profiles').select('display_name').eq('id', user.id).single(),
    supabase.from('user_roles').select('role').eq('user_id', user.id).single()
  ]);
  const role = roleRow?.role || 'customer';
  document.querySelector('#roleBadge').textContent = role[0].toUpperCase() + role.slice(1);
  document.querySelector('#welcomeName').textContent = profile?.display_name ? `Welcome, ${profile.display_name}` : 'My Ogreena';
  document.querySelector('#accountEmail').textContent = user.email;
  document.querySelector('#ownerPanel').hidden = role !== 'owner';
  document.querySelector('#ownerRequestPanel').hidden = role === 'owner';
  if (role !== 'owner') {
    const { data: request } = await supabase.from('owner_access_requests').select('status,created_at').eq('user_id', user.id).maybeSingle();
    if (request) {
      document.querySelector('#ownerRequestForm').hidden = true;
      document.querySelector('#ownerRequestStatus').textContent = `Owner review status: ${request.status}. No owner permissions have been granted.`;
    }
  }
  if (role === 'owner') {
    const { data } = await supabase.from('payment_settings').select('provider,payments_enabled,product_payments_enabled,service_payments_enabled').single();
    document.querySelector('#paymentState').textContent = data ? `Provider: ${data.provider}; payments enabled: ${data.payments_enabled ? 'yes' : 'no'}` : 'Payment settings unavailable.';
  }
  await Promise.all([loadProducts(), loadRequests(user.id)]);
  if (role === 'owner' && !document.querySelector('#ownerPanel [data-owner-dashboard]')) {
    const link = document.createElement('a');
    link.className = 'small-btn primary'; link.href = '../owner/'; link.textContent = 'Open Owner Dashboard';
    link.dataset.ownerDashboard = 'true'; document.querySelector('#ownerPanel').append(link);
  }
}

function escapeHTML(value = '') { const node = document.createElement('div'); node.textContent = String(value); return node.innerHTML; }

supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'PASSWORD_RECOVERY') switchTab('password');
  queueMicrotask(() => renderSession(session));
});

const { data: { session } } = await supabase.auth.getSession();
await renderSession(session);
