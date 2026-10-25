const { createClient } = window.supabase;
const safariSafeAuthLock = async (_name, _acquireTimeout, callback) => callback();
const SUPABASE_URL = 'https://mhhjzifeaofgskimvuom.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_13onHaeoGy3uEVnezcGZCQ_RtSzNOlM';
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storage: window.localStorage, storageKey: 'ogreena-auth-session', lock: safariSafeAuthLock }
});
const authRedirect = 'https://ogreena.com/auth/';
const OWNER_SESSION_HANDOFF_KEY = 'ogreena-owner-session-handoff';

const authPanel = document.querySelector('#authPanel');
const accountPanel = document.querySelector('#accountPanel');
const status = document.querySelector('#authStatus');
const signOutButton = document.querySelector('#signOut');
const REQUEST_TIMEOUT_MS = 20000;

function setStatus(message, type = '') {
  status.textContent = message;
  status.className = `auth-status ${type}`.trim();
}

function friendlyError(error) {
  if (!error) return 'Something went wrong. Please try again.';
  const code = error.code || '';
  if (code === 'request_timeout') return 'The secure account service took too long to respond. Your account may already exist. Check your email, then use Sign In or Reset Password before trying again.';
  if (['email_exists', 'user_already_exists', 'identity_already_exists'].includes(code)) return 'An account already exists for this email. Please sign in or use Reset Password.';
  if (code === 'email_not_confirmed') return 'Please confirm your email before signing in. Check your inbox and spam folder for the Ogreena confirmation email.';
  if (code === 'over_email_send_rate_limit') return 'Too many confirmation emails were requested. Please wait a few minutes, then try again.';
  if (code === 'over_request_rate_limit') return 'Too many account requests were made. Please wait a few minutes, then try again.';
  if (code === 'weak_password') return 'Please choose a stronger password with at least 8 characters.';
  if (code === 'email_address_invalid') return 'Please enter a valid email address.';
  if (code === 'invalid_credentials' || /invalid login/i.test(error.message || '')) return 'The email or password is incorrect. If you already confirmed this account, use the same password or choose Reset Password.';
  if (error instanceof TypeError || /failed to fetch|network/i.test(error.message || '')) return 'Ogreena could not reach the secure account service. Check your connection and try again.';
  return 'The secure account request could not be completed. Please try again, or use Sign In or Reset Password if you already registered.';
}

function withTimeout(request) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      const error = new Error('Account request timed out');
      error.code = 'request_timeout';
      reject(error);
    }, REQUEST_TIMEOUT_MS);
  });
  return Promise.race([request, timeout]).finally(() => clearTimeout(timeoutId));
}

function setFormBusy(form, busy) {
  form.dataset.submitting = busy ? 'true' : 'false';
  form.setAttribute('aria-busy', String(busy));
  form.querySelectorAll('button,input').forEach(control => { control.disabled = busy; });
}

async function runFormRequest(form, pendingMessage, request, onSuccess) {
  if (form.dataset.submitting === 'true') return;
  setStatus(pendingMessage);
  setFormBusy(form, true);
  try {
    const result = await withTimeout(request());
    if (result.error) throw result.error;
    await onSuccess(result.data);
  } catch (error) {
    setStatus(friendlyError(error), 'error');
  } finally {
    setFormBusy(form, false);
  }
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
  event.preventDefault();
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form));
  await runFormRequest(form, 'Creating your secure customer account…', () => supabase.auth.signUp({ email: values.email, password: values.password, options: { data: { display_name: values.display_name }, emailRedirectTo: authRedirect } }), async data => {
    form.reset();
    if (!data.session && Array.isArray(data.user?.identities) && data.user.identities.length === 0) {
      switchTab('signin');
      document.querySelector('#signInForm input[name="email"]').value = values.email;
      setStatus('This account already exists and may already be verified. Sign in with the existing password instead of creating another account.', 'success');
      return;
    }
    setStatus(data.session ? 'Account created and signed in.' : 'Account created. Check your email for the Ogreena confirmation link before signing in.', 'success');
  });
});

document.querySelector('#signInForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form));
  await runFormRequest(form, 'Signing in…', () => supabase.auth.signInWithPassword({ email: values.email, password: values.password }), async data => {
    form.reset();
    const signedInSession = data?.session;
    const user = signedInSession?.user || data?.user;
    if (!signedInSession?.access_token || !signedInSession?.refresh_token || !user) throw new Error('The signed-in session was not returned.');
    // Safari can return a valid Supabase session without retaining it before
    // the next page loads. Persist the exact session returned by Auth using
    // the same storage key configured on every Ogreena Supabase client.
    window.localStorage.setItem('ogreena-auth-session', JSON.stringify(signedInSession));
    const persistedSession = JSON.parse(window.localStorage.getItem('ogreena-auth-session') || 'null');
    if (persistedSession?.user?.id !== user.id) throw new Error('The owner session could not be saved in this browser.');
    if (!user.email_confirmed_at) {
      const error = new Error('Email is not confirmed');
      error.code = 'email_not_confirmed';
      throw error;
    }
    const { data: roleRow, error: roleError } = await supabase.from('user_roles').select('role').eq('user_id', user.id).single();
    if (roleError) throw roleError;
    if (roleRow?.role === 'owner') {
      window.sessionStorage.setItem(OWNER_SESSION_HANDOFF_KEY, JSON.stringify({ access_token:signedInSession.access_token, refresh_token:signedInSession.refresh_token }));
      setStatus('Signed in. Opening the Owner Dashboard…', 'success');
      location.replace('../owner/');
      return;
    }
    setStatus('Signed in.', 'success');
  });
});

document.querySelector('#recoveryForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form));
  await runFormRequest(form, 'Requesting a secure recovery email…', () => supabase.auth.resetPasswordForEmail(values.email, { redirectTo: authRedirect }), async () => {
    form.reset(); setStatus('If that account exists, a recovery email has been sent.', 'success');
  });
});

document.querySelector('#newPasswordForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const password = new FormData(form).get('password');
  await runFormRequest(form, 'Saving the new password…', () => supabase.auth.updateUser({ password }), async () => {
    form.reset(); setStatus('Password updated. You can now sign in.', 'success');
  });
});

signOutButton.addEventListener('click', async () => {
  if (signOutButton.disabled) return;
  signOutButton.disabled = true;
  try {
    const { error } = await withTimeout(supabase.auth.signOut({ scope: 'local' }));
    if (error) throw error;
    setStatus('Signed out.', 'success');
    location.replace('./?mode=signin');
  } catch (error) {
    setStatus(friendlyError(error), 'error');
  } finally {
    signOutButton.disabled = false;
  }
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
  const { data: estimates } = await supabase.from('estimates').select('id,request_id,amount_cents,status').eq('customer_id', userId).eq('status','accepted');
  const payable = Object.fromEntries((estimates || []).filter(item => item.amount_cents >= 50).map(item => [item.request_id,item]));
  list.innerHTML = data.length ? data.map(item => `<div class="request-item"><b>${escapeHTML(item.summary)}</b><span>${escapeHTML(item.service_slug)} · ${escapeHTML(item.status)}</span>${payable[item.id]?`<button class="small-btn primary" data-pay-estimate="${escapeHTML(payable[item.id].id)}">Pay approved invoice</button>`:''}</div>`).join('') : '<p class="muted">No service requests yet.</p>';
  list.querySelectorAll('[data-pay-estimate]').forEach(button=>button.addEventListener('click',()=>startCheckout({kind:'invoice',estimateId:button.dataset.payEstimate})));
}

async function startCheckout(body) {
  const idempotencyKey = crypto.randomUUID();
  const { data, error } = await supabase.functions.invoke('create-checkout-session', { body:{...body,idempotencyKey} });
  if (error || !data?.url) return alert(data?.error || friendlyError(error));
  location.href = data.url;
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
  const pendingProduct = sessionStorage.getItem('ogreena-pending-product');
  if (pendingProduct) {
    sessionStorage.removeItem('ogreena-pending-product');
    await startCheckout({ kind:'product', productId:pendingProduct });
    return;
  }
  const user = session.user;
  const [profileResult, roleResult] = await Promise.all([
    supabase.from('profiles').select('display_name').eq('id', user.id).single(),
    supabase.from('user_roles').select('role').eq('user_id', user.id).single()
  ]);
  if (roleResult.error || !roleResult.data?.role) {
    authPanel.hidden = false;
    accountPanel.hidden = true;
    setStatus('Your account is signed in, but Ogreena could not verify its access role. Please refresh once. Owner access will not be downgraded to Customer.', 'error');
    return;
  }
  const profile = profileResult.data;
  const role = roleResult.data.role;
  if (role === 'owner') {
    window.sessionStorage.setItem(OWNER_SESSION_HANDOFF_KEY, JSON.stringify({ access_token:session.access_token, refresh_token:session.refresh_token }));
    location.replace('../owner/');
    return;
  }
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
  // Run database lookups after the auth callback has returned. Awaiting another
  // Supabase request inside this callback can block session/role restoration.
  setTimeout(() => renderSession(session), 0);
});

supabase.auth.getSession().then(({ data: { session } }) => renderSession(session));
