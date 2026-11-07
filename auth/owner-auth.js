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
  document.querySelectorAll('#signInForm,#signUpForm,#confirmationForm,#recoveryForm,#newPasswordForm').forEach(form => { form.hidden = form.id !== ({signin:'signInForm',signup:'signUpForm',confirmation:'confirmationForm',recovery:'recoveryForm',password:'newPasswordForm'}[name]); });
  setStatus('');
}

document.querySelectorAll('[data-auth-tab]').forEach(button => button.addEventListener('click', () => switchTab(button.dataset.authTab)));
const requestedMode = new URLSearchParams(location.search).get('mode');
const requestedNext = new URLSearchParams(location.search).get('next');
const safeNext = requestedNext && requestedNext.startsWith('/') && !requestedNext.startsWith('//') ? requestedNext : '';
const recoveryHash = new URLSearchParams(location.hash.replace(/^#/, ''));
let recoveryMode = requestedMode === 'password' || recoveryHash.get('type') === 'recovery';
if (['signin', 'signup', 'confirmation', 'recovery', 'password'].includes(requestedMode)) switchTab(requestedMode);
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

document.querySelector('#confirmationForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form));
  await runFormRequest(form, 'Requesting a new confirmation email…', () => supabase.auth.resend({ type:'signup', email:values.email, options:{ emailRedirectTo:authRedirect } }), async () => {
    form.reset();
    setStatus('If an unverified account exists for that email, a new confirmation link has been sent. Check the inbox and spam folder.', 'success');
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
let publishedServices = [];
let activeRequestCategory = '';
const selectedRequestItems = new Map();
let currentCustomerProfile = null;

function contactPropertyValues(form) {
  const values = Object.fromEntries(new FormData(form));
  return {
    display_name:values.display_name.trim(), phone:values.phone.trim(),
    property_street_address:values.property_street_address.trim(), property_unit:values.property_unit.trim() || null,
    property_city:values.property_city.trim(), property_state:values.property_state.trim().toUpperCase(),
    property_zip:values.property_zip.trim(), property_type:values.property_type
  };
}

function fillContactPropertyForms(profile) {
  currentCustomerProfile = profile;
  const profileForm = document.querySelector('#contactPropertyForm');
  for (const [name,value] of Object.entries(profile || {})) if (profileForm.elements[name]) profileForm.elements[name].value = value || '';
  const requestForm = document.querySelector('#requestForm');
  const requestDefaults = {
    customer_name:profile?.display_name, customer_phone:profile?.phone,
    service_address_street:profile?.property_street_address, service_address_unit:profile?.property_unit,
    service_address_city:profile?.property_city, service_address_state:profile?.property_state,
    service_address_zip:profile?.property_zip, property_type:profile?.property_type
  };
  for (const [name,value] of Object.entries(requestDefaults)) if (requestForm.elements[name]) requestForm.elements[name].value = value || '';
}

document.querySelector('#contactPropertyForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const profileStatus = document.querySelector('#profileStatus');
  const { data:{ user } } = await supabase.auth.getUser();
  if (!user) return;
  const values = contactPropertyValues(form);
  form.querySelector('button').disabled = true;
  profileStatus.textContent = 'Saving private contact and property information…';
  profileStatus.className = 'auth-status wide';
  const { data, error } = await supabase.from('profiles').update(values).eq('id', user.id).select('display_name,phone,property_street_address,property_unit,property_city,property_state,property_zip,property_type').single();
  form.querySelector('button').disabled = false;
  if (error) { profileStatus.textContent = friendlyError(error); profileStatus.className = 'auth-status wide error'; return; }
  fillContactPropertyForms(data);
  document.querySelector('#welcomeName').textContent = `${data.display_name} · Customer Profile`;
  profileStatus.textContent = 'Contact and property information saved.';
  profileStatus.className = 'auth-status wide success';
});

function requestItemKey(serviceSlug, priceItemId = '') { return priceItemId || `general:${serviceSlug}`; }
function pricesForService(serviceSlug) { return servicePriceItems.filter(item => item.active && item.service_slug === serviceSlug); }

function renderRequestCategories() {
  const holder = document.querySelector('#requestCategories');
  holder.innerHTML = publishedServices.map(service => `<button class="service-category-card ${service.id===activeRequestCategory?'active':''}" type="button" data-request-category="${escapeHTML(service.id)}"><span>${escapeHTML(service.name)}</span><small>${pricesForService(service.id).length ? `${pricesForService(service.id).length} published option${pricesForService(service.id).length===1?'':'s'}` : 'Request an estimate'}</small></button>`).join('');
  holder.querySelectorAll('[data-request-category]').forEach(button => button.addEventListener('click', () => {
    activeRequestCategory = button.dataset.requestCategory;
    renderRequestCategories(); renderRequestChoices();
  }));
}

function renderRequestChoices() {
  const service = publishedServices.find(item => item.id === activeRequestCategory);
  const holder = document.querySelector('#requestChoices');
  document.querySelector('#requestCategoryTitle').textContent = service ? service.name : 'Select a category';
  if (!service) { holder.innerHTML = '<p class="muted">Tap a service category to see its available services.</p>'; return; }
  const prices = pricesForService(service.id);
  const choices = prices.length ? prices : [{ id:'', service_slug:service.id, name:`${service.name} estimate request`, price_cents:null, pricing_type:'fixed', unit_label:'' }];
  holder.innerHTML = choices.map(item => {
    const key=requestItemKey(service.id,item.id),selected=selectedRequestItems.get(key),isQuantity=item.pricing_type!=='fixed';
    return `<label class="service-choice"><span><input type="checkbox" data-request-choice="${escapeHTML(key)}" ${selected?'checked':''}> <b>${escapeHTML(item.name)}</b><small>${item.price_cents===null?'Price provided after review':escapeHTML(window.OgreenaServiceCatalog.priceLabel(item))}</small></span>${isQuantity?`<input class="choice-quantity" data-request-quantity="${escapeHTML(key)}" type="number" min="0.01" step="0.01" value="${escapeHTML(selected?.quantity||1)}" aria-label="${escapeHTML(item.name)} quantity" ${selected?'':'disabled'}>`:''}</label>`;
  }).join('');
  holder.querySelectorAll('[data-request-choice]').forEach(input => input.addEventListener('change', () => {
    const key=input.dataset.requestChoice;
    const item=choices.find(candidate=>requestItemKey(service.id,candidate.id)===key);
    if(input.checked) selectedRequestItems.set(key,{service_slug:service.id,service_price_item_id:item.id||null,service_name:service.name,item_name:item.name,price_cents:item.price_cents,pricing_type:item.pricing_type,unit_label:item.unit_label,quantity:1});
    else selectedRequestItems.delete(key);
    renderRequestChoices(); updateRequestPreview();
  }));
  holder.querySelectorAll('[data-request-quantity]').forEach(input => input.addEventListener('input',()=>{
    const selected=selectedRequestItems.get(input.dataset.requestQuantity); if(!selected)return;
    selected.quantity=Math.max(Number(input.value)||0,0); updateRequestPreview();
  }));
}

function requestPreviewText() {
  const lines=[...selectedRequestItems.values()].map(item=>{
    const price=item.price_cents===null?'Estimate requested':window.OgreenaServiceCatalog.priceLabel(item);
    const quantity=item.pricing_type==='fixed'?'':` × ${item.quantity} ${item.unit_label}`;
    return `${item.service_name}: ${item.item_name} — ${price}${quantity}`;
  });
  return lines.length ? `Ogreena service request\n${lines.join('\n')}` : '';
}

function updateRequestPreview() {
  const count=selectedRequestItems.size;
  document.querySelector('#requestSelectionCount').textContent=`${count} service${count===1?'':'s'} selected`;
  document.querySelector('#requestPreview').innerHTML=count?`<ul>${[...selectedRequestItems.values()].map(item=>`<li><b>${escapeHTML(item.service_name)}</b>: ${escapeHTML(item.item_name)}${item.price_cents===null?' · estimate requested':` · ${escapeHTML(window.OgreenaServiceCatalog.priceLabel(item))}`}</li>`).join('')}</ul>`:'';
}

async function loadServiceCatalog() {
  const [pricesResult,servicesResult]=await Promise.all([
    supabase.from('service_price_items').select('id,category,service_slug,name,price_cents,pricing_type,unit_label,active,display_order').eq('active',true).order('display_order'),
    supabase.from('services').select('id,name,summary,display_order,visible').eq('visible',true).order('display_order')
  ]);
  if (!pricesResult.error && pricesResult.data?.length) servicePriceItems=pricesResult.data;
  if (!servicesResult.error && servicesResult.data?.length) publishedServices=servicesResult.data;
  if (!publishedServices.length) publishedServices=[...new Map(servicePriceItems.map(item=>[item.service_slug,{id:item.service_slug,name:item.service_slug.replaceAll('-',' '),display_order:item.display_order}])).values()];
  activeRequestCategory=publishedServices[0]?.id||'';
  renderRequestCategories(); renderRequestChoices(); updateRequestPreview();
}

document.querySelector('#copyRequestPreview').addEventListener('click', async () => {
  const text=requestPreviewText(); if(!text)return;
  try { await navigator.clipboard.writeText(text); document.querySelector('#requestConfirmation').textContent='Request preview copied.'; }
  catch { document.querySelector('#requestConfirmation').textContent='Copy is unavailable in this browser. Your selections are still saved on this page.'; }
});

document.querySelector('#requestForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form=event.currentTarget;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const selections=[...selectedRequestItems.values()];
  if(!selections.length)return alert('Select at least one Ogreena service.');
  if(selections.some(item=>!Number.isFinite(Number(item.quantity))||Number(item.quantity)<=0))return alert('Enter a valid quantity for each selected service.');
  const values=Object.fromEntries(new FormData(form));
  const state=values.service_address_state.trim().toUpperCase();
  const submit=form.querySelector('button[type="submit"]');submit.disabled=true;
  document.querySelector('#requestConfirmation').textContent='Sending your request securely…';
  const { data,error }=await supabase.rpc('create_multi_service_request',{
    selected_items:selections.map(item=>({service_slug:item.service_slug,service_price_item_id:item.service_price_item_id,quantity:Number(item.quantity)})),
    request_details:values.details.trim(),requested_date:values.preferred_date||null,
    request_customer_name:values.customer_name.trim(),request_customer_phone:values.customer_phone.trim(),
    request_address_street:values.service_address_street.trim(),request_address_unit:values.service_address_unit.trim()||null,
    request_address_city:values.service_address_city.trim(),request_address_state:state,
    request_address_zip:values.service_address_zip.trim(),request_property_type:values.property_type
  });
  submit.disabled=false;
  if(error){document.querySelector('#requestConfirmation').textContent=friendlyError(error);return;}
  supabase.functions.invoke('send-business-notifications',{body:{source:'service_request'}}).catch(()=>{});
  form.reset();fillContactPropertyForms(currentCustomerProfile);selectedRequestItems.clear();renderRequestChoices();updateRequestPreview();
  document.querySelector('#requestConfirmation').textContent=`Request sent to Ogreena. Status: submitted. Reference ${String(data).slice(0,8)}.`;
  await loadRequests(user.id);
});

async function loadRequests(userId) {
  const list = document.querySelector('#requestList');
  const [{ data, error },appointmentsResult] = await Promise.all([
    supabase.from('service_requests').select('id,service_slug,service_price_item_id,requested_quantity,summary,details,service_address,preferred_date,status,created_at').eq('customer_id', userId).order('created_at', { ascending: false }),
    supabase.from('appointments').select('request_id,starts_at,ends_at,status').eq('customer_id',userId).neq('status','cancelled').order('starts_at')
  ]);
  if (error) { list.textContent = friendlyError(error); return; }
  const requestIds=data.map(item=>item.id);
  const [{ data: estimates },itemsResult] = await Promise.all([
    supabase.from('estimates').select('id,request_id,amount_cents,status,tax_treatment,tax_confirmed_at').eq('customer_id', userId).eq('status','accepted'),
    requestIds.length?supabase.from('service_request_items').select('request_id,service_name,item_name,price_cents,pricing_type,unit_label,requested_quantity').in('request_id',requestIds).order('created_at'):Promise.resolve({data:[]})
  ]);
  const payable = Object.fromEntries((estimates || []).filter(item => item.amount_cents >= 50 && item.tax_treatment === 'service_only_nontaxable' && item.tax_confirmed_at).map(item => [item.request_id,item]));
  const appointmentsByRequest=Object.fromEntries((appointmentsResult.data||[]).map(item=>[item.request_id,item]));
  const grouped=(itemsResult.data||[]).reduce((groups,row)=>{(groups[row.request_id]||=[]).push(row);return groups;},{});
  list.innerHTML = data.length ? data.map(item => { const catalogItem=servicePriceItems.find(price => price.id === item.service_price_item_id),lines=grouped[item.id]||[],appointment=appointmentsByRequest[item.id]; return `<div class="request-item"><b>${escapeHTML(item.summary)}</b><span>${escapeHTML(item.status)}${item.preferred_date?` · preferred ${escapeHTML(item.preferred_date)}`:''}</span>${appointment?`<strong class="appointment-time">Scheduled: ${escapeHTML(new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',dateStyle:'medium',timeStyle:'short'}).format(new Date(appointment.starts_at)))} PT</strong>`:''}${lines.length?`<ul>${lines.map(line=>`<li>${escapeHTML(line.service_name)} — ${escapeHTML(line.item_name)}</li>`).join('')}</ul>`:`<span>${escapeHTML(catalogItem?.name || item.service_slug)}</span>`}${item.details?`<small>${escapeHTML(item.details)}</small>`:''}${payable[item.id]?`<button class="small-btn primary" data-pay-estimate="${escapeHTML(payable[item.id].id)}">Pay approved invoice</button>`:''}</div>`; }).join('') : '<p class="muted">No service requests yet.</p>';
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
    supabase.from('profiles').select('display_name,phone,property_street_address,property_unit,property_city,property_state,property_zip,property_type').eq('id', user.id).single(),
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
  fillContactPropertyForms(profile);
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
