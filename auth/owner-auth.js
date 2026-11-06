const { createClient } = window.supabase;
const safariSafeAuthLock = async (_name, _acquireTimeout, callback) => callback();
const SUPABASE_URL = 'https://mhhjzifeaofgskimvuom.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_13onHaeoGy3uEVnezcGZCQ_RtSzNOlM';
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storage: window.localStorage, storageKey: 'ogreena-auth-session', lock: safariSafeAuthLock }
});
const authRedirect = 'https://ogreena.com/auth/';
// This exact production path is already used by Ogreena Auth and is present in
// the project's allowed redirects. Supabase adds the recovery session to it.
const recoveryRedirect = 'https://ogreena.com/auth/';
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
  if (code === 'session_not_found' || /auth session missing|invalid.*token|expired/i.test(error.message || '')) return 'This password-reset link is invalid or expired. Choose Reset Password to request a new email.';
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
const requestedNext = new URLSearchParams(location.search).get('next');
const safeNext = requestedNext && requestedNext.startsWith('/') && !requestedNext.startsWith('//') ? requestedNext : '';
const recoveryHash = new URLSearchParams(location.hash.replace(/^#/, ''));
let recoveryMode = requestedMode === 'password' || recoveryHash.get('type') === 'recovery';
if (['signin', 'signup', 'recovery', 'password'].includes(requestedMode)) switchTab(requestedMode);
if (recoveryMode) switchTab('password');

document.querySelector('#signUpForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form));
  await runFormRequest(form, 'Creating your secure Ogreena account…', () => supabase.auth.signUp({ email: values.email, password: values.password, options: { data: { display_name: values.display_name, requested_account_type: values.account_type }, emailRedirectTo: authRedirect } }), async data => {
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
    if (roleRow?.role === 'employee') {
      setStatus('Signed in. Opening your Employee Profile…', 'success');
      location.replace('../employee/');
      return;
    }
    const [applicationResult, employeeRequestResult] = await Promise.all([
      supabase.from('job_applications').select('status').eq('user_id', user.id).maybeSingle(),
      supabase.from('employee_access_requests').select('status').eq('user_id', user.id).maybeSingle()
    ]);
    if (applicationResult.data) { location.replace('../careers-account/?type=applicant&mode=signin'); return; }
    if (employeeRequestResult.data) { location.replace('../careers-account/?type=employee&mode=signin'); return; }
    if (safeNext) { location.replace(safeNext); return; }
    setStatus('Signed in.', 'success');
  });
});

document.querySelector('#recoveryForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form));
  await runFormRequest(form, 'Requesting a secure recovery email…', () => supabase.auth.resetPasswordForEmail(values.email, { redirectTo: recoveryRedirect }), async () => {
    form.reset(); setStatus('If that account exists, a recovery email has been sent.', 'success');
  });
});

document.querySelector('#newPasswordForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form));
  const password = values.password;
  if (password !== values.password_confirmation) {
    setStatus('The two passwords do not match.', 'error');
    return;
  }
  const { data: { session } } = await supabase.auth.getSession();
  if (!recoveryMode || !session) {
    setStatus('This password-reset link is invalid or expired. Choose Reset Password to request a new email.', 'error');
    return;
  }
  await runFormRequest(form, 'Saving the new password…', () => supabase.auth.updateUser({ password }), async () => {
    form.reset();
    await supabase.auth.signOut({ scope: 'local' });
    recoveryMode = false;
    history.replaceState({}, '', './?mode=signin');
    switchTab('signin');
    setStatus('Password updated successfully. Sign in with your new password.', 'success');
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

let servicePriceItems = window.OgreenaServiceCatalog.items;

function renderServiceOptions() {
  const select = document.querySelector('#requestService');
  const grouped = servicePriceItems.filter(item => item.active).reduce((groups,item) => { (groups[item.category] ||= []).push(item); return groups; }, {});
  select.innerHTML = '<option value="">Choose a service</option>' + Object.entries(window.OgreenaServiceCatalog.categoryNames).map(([category,label]) => `<optgroup label="${escapeHTML(label)}">${(grouped[category] || []).map(item => `<option value="${escapeHTML(item.id)}">${escapeHTML(item.name)} — ${escapeHTML(window.OgreenaServiceCatalog.priceLabel(item))}</option>`).join('')}</optgroup>`).join('');
}

function updateRequestEstimate() {
  const item = servicePriceItems.find(row => row.id === document.querySelector('#requestService').value);
  const quantityLabel = document.querySelector('#requestQuantityLabel');
  const quantityInput = document.querySelector('#requestQuantity');
  if (!item) { quantityLabel.hidden = true; document.querySelector('#requestEstimate').textContent = 'Choose a service to view its published price.'; return; }
  quantityLabel.hidden = item.pricing_type === 'fixed';
  quantityLabel.firstChild.textContent = item.unit_label === 'each' ? 'Quantity' : 'Estimated square feet';
  quantityInput.required = item.pricing_type !== 'fixed';
  const quantity = item.pricing_type !== 'fixed' ? Math.max(Number(quantityInput.value) || 0, 0) : 1;
  const total = item.price_cents * quantity;
  document.querySelector('#requestEstimate').textContent = item.pricing_type !== 'fixed'
    ? `Published rate: ${window.OgreenaServiceCatalog.priceLabel(item)}. Estimated total: ${window.OgreenaServiceCatalog.money(total)}. Owner approval required.`
    : `Published price: ${window.OgreenaServiceCatalog.priceLabel(item)}. Final scope requires owner approval.`;
}

async function loadServiceCatalog() {
  renderServiceOptions();
  const { data, error } = await supabase.from('service_price_items').select('id,category,service_slug,name,price_cents,pricing_type,unit_label,active,display_order').eq('active',true).order('display_order');
  if (!error && data?.length) { servicePriceItems = data; renderServiceOptions(); }
  updateRequestEstimate();
}

document.querySelector('#requestService').addEventListener('change', updateRequestEstimate);
document.querySelector('#requestQuantity').addEventListener('input', updateRequestEstimate);

document.querySelector('#requestForm').addEventListener('submit', async event => {
  event.preventDefault();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const values = Object.fromEntries(new FormData(event.currentTarget));
  const item = servicePriceItems.find(row => row.id === values.service_price_item_id);
  if (!item) return alert('Choose a published service.');
  const requestedQuantity = item.pricing_type !== 'fixed' ? Number(values.requested_quantity) : 1;
  if (!Number.isFinite(requestedQuantity) || requestedQuantity <= 0) return alert('Enter a valid quantity.');
  const { error } = await supabase.from('service_requests').insert({ customer_id:user.id, service_slug:item.service_slug, service_price_item_id:item.id, requested_quantity:requestedQuantity, summary:values.summary.trim() });
  if (error) return alert(friendlyError(error));
  event.currentTarget.reset(); updateRequestEstimate(); await loadRequests(user.id);
});

async function loadRequests(userId) {
  const list = document.querySelector('#requestList');
  const { data, error } = await supabase.from('service_requests').select('id,service_slug,service_price_item_id,requested_quantity,summary,status,created_at').eq('customer_id', userId).order('created_at', { ascending: false });
  if (error) { list.textContent = friendlyError(error); return; }
  const { data: estimates } = await supabase.from('estimates').select('id,request_id,amount_cents,status,tax_treatment,tax_confirmed_at').eq('customer_id', userId).eq('status','accepted');
  const payable = Object.fromEntries((estimates || []).filter(item => item.amount_cents >= 50 && item.tax_treatment === 'service_only_nontaxable' && item.tax_confirmed_at).map(item => [item.request_id,item]));
  list.innerHTML = data.length ? data.map(item => { const catalogItem=servicePriceItems.find(price => price.id === item.service_price_item_id); return `<div class="request-item"><b>${escapeHTML(item.summary)}</b><span>${escapeHTML(catalogItem?.name || item.service_slug)} · ${escapeHTML(item.status)}</span>${payable[item.id]?`<button class="small-btn primary" data-pay-estimate="${escapeHTML(payable[item.id].id)}">Pay approved invoice</button>`:''}</div>`; }).join('') : '<p class="muted">No service requests yet.</p>';
  list.querySelectorAll('[data-pay-estimate]').forEach(button=>button.addEventListener('click',()=>startCheckout({kind:'invoice',estimateId:button.dataset.payEstimate})));
}

async function loadCustomerActivity(userId) {
  const historyResult = await supabase.from('service_requests').select('id,service_slug,summary,status,updated_at').eq('customer_id', userId).in('status', ['completed','cancelled']).order('updated_at', { ascending:false });
  const history = document.querySelector('#customerHistory');
  history.innerHTML = historyResult.error ? `<p class="muted">${escapeHTML(friendlyError(historyResult.error))}</p>` : (historyResult.data?.length ? historyResult.data.map(item => `<div class="request-item"><b>${escapeHTML(item.summary)}</b><span>${escapeHTML(item.service_slug.replaceAll('-',' '))} · ${escapeHTML(item.status)} · ${escapeHTML(new Date(item.updated_at).toLocaleDateString())}</span></div>`).join('') : '<p class="muted">No completed or cancelled service history yet.</p>');
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
  if (recoveryMode) {
    authPanel.hidden = false;
    accountPanel.hidden = true;
    signOutButton.hidden = true;
    if (document.querySelector('#newPasswordForm').hidden) switchTab('password');
    if (!session) setStatus('This password-reset link is invalid or expired. Choose Reset Password to request a new email.', 'error');
    return;
  }
  authPanel.hidden = Boolean(session); accountPanel.hidden = !session; signOutButton.hidden = !session;
  if (!session) return;
  const pendingProduct = sessionStorage.getItem('ogreena-pending-product');
  if (pendingProduct) {
    const pendingShipping = sessionStorage.getItem('ogreena-pending-shipping');
    sessionStorage.removeItem('ogreena-pending-product');
    sessionStorage.removeItem('ogreena-pending-shipping');
    let shippingAddress = null;
    try { shippingAddress = JSON.parse(pendingShipping || 'null'); } catch { shippingAddress = null; }
    if (!shippingAddress) { alert('Enter your shipping address again from the product page.'); location.href='../products/'; return; }
    await startCheckout({ kind:'product', productId:pendingProduct, shippingAddress });
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
  if (role === 'employee') {
    location.replace('../employee/');
    return;
  }
  const [applicationResult, employeeRequestResult] = await Promise.all([
    supabase.from('job_applications').select('status').eq('user_id', user.id).maybeSingle(),
    supabase.from('employee_access_requests').select('status').eq('user_id', user.id).maybeSingle()
  ]);
  if (applicationResult.data) { location.replace('../careers-account/?type=applicant&mode=signin'); return; }
  if (employeeRequestResult.data) { location.replace('../careers-account/?type=employee&mode=signin'); return; }
  document.querySelector('#roleBadge').textContent = role[0].toUpperCase() + role.slice(1);
  document.querySelector('#welcomeName').textContent = profile?.display_name ? `${profile.display_name} · Customer Profile` : 'Customer Profile';
  document.querySelector('#accountEmail').textContent = user.email;
  await loadServiceCatalog();
  await Promise.all([loadProducts(), loadRequests(user.id), loadCustomerActivity(user.id)]);
}

function escapeHTML(value = '') { const node = document.createElement('div'); node.textContent = String(value); return node.innerHTML; }

supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'PASSWORD_RECOVERY') {
    recoveryMode = true;
    authPanel.hidden = false;
    accountPanel.hidden = true;
    signOutButton.hidden = true;
    switchTab('password');
    setStatus('Create a new password for your Ogreena account.', 'success');
  }
  // Run database lookups after the auth callback has returned. Awaiting another
  // Supabase request inside this callback can block session/role restoration.
  setTimeout(() => renderSession(session), 0);
});

supabase.auth.getSession().then(({ data: { session } }) => renderSession(session));
