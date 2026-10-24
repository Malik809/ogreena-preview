import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '../auth/supabase-config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
const $ = selector => document.querySelector(selector);
const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[char]));
const money = cents => new Intl.NumberFormat('en-US', { style:'currency', currency:'USD' }).format((Number(cents) || 0) / 100);
let operationView = 'requests';
let currentUserId = null;

function setStatus(message, error = false) { const node = $('#globalStatus'); node.textContent = message; node.classList.toggle('error', error); }
async function run(label, action) { setStatus(`${label}…`); try { const value = await action(); setStatus(`${label} complete`); return value; } catch (error) { setStatus(error.message || `${label} failed`, true); throw error; } }
function requireOk(result) { if (result.error) throw result.error; return result.data; }
async function count(table) { const result = await supabase.from(table).select('*', { count:'exact', head:true }); return result.error ? 0 : (result.count || 0); }

document.querySelector('#signOut').addEventListener('click', async () => { await supabase.auth.signOut(); location.href = '../auth/?mode=signin'; });
document.querySelectorAll('[data-owner-tab]').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('[data-owner-tab]').forEach(item => item.classList.toggle('active', item === button));
  document.querySelectorAll('.owner-panel').forEach(panel => panel.classList.toggle('active', panel.id === `owner-${button.dataset.ownerTab}`));
}));
document.querySelectorAll('[data-operation]').forEach(button => button.addEventListener('click', () => {
  operationView = button.dataset.operation;
  document.querySelectorAll('[data-operation]').forEach(item => item.classList.toggle('active', item === button));
  loadOperations();
}));

function productRow(product) {
  const draft = product.draft_data || {};
  return `<form class="editor-row" data-product="${escapeHtml(product.id)}"><label>Name<input name="name" value="${escapeHtml(draft.name ?? product.name)}" required></label><label>Size<input name="size" value="${escapeHtml(draft.size ?? product.size)}" required></label><label>Price<input name="price" type="number" min="0" step="0.01" value="${((draft.price_cents ?? product.price_cents) / 100).toFixed(2)}" required></label><label>Available<select name="visible"><option value="true" ${(draft.visible ?? product.visible) ? 'selected':''}>Yes</option><option value="false" ${!(draft.visible ?? product.visible) ? 'selected':''}>No</option></select></label><label class="wide">Description<textarea name="description" rows="2">${escapeHtml(draft.description ?? product.description ?? '')}</textarea></label><div class="wide editor-actions"><button class="small-btn" type="submit">Save Draft</button><button class="small-btn primary" type="button" data-publish-product>Publish</button><span class="muted">${draft.name !== undefined ? 'Draft saved' : 'Published'}</span></div></form>`;
}

async function loadProducts() {
  const data = requireOk(await supabase.from('products').select('*').order('display_order')) || [];
  $('#productList').innerHTML = data.map(productRow).join('') || '<p class="empty-state">No products configured.</p>';
  $('#productCount').textContent = data.length;
  $('#productList').querySelectorAll('[data-product]').forEach(form => {
    form.addEventListener('submit', event => { event.preventDefault(); run('Saving product draft', async () => { const values = new FormData(form); requireOk(await supabase.from('products').update({ draft_data:{ name:values.get('name').trim(), size:values.get('size').trim(), price_cents:Math.round(Number(values.get('price')) * 100), description:values.get('description').trim(), visible:values.get('visible') === 'true' } }).eq('id', form.dataset.product)); await loadProducts(); }); });
    form.querySelector('[data-publish-product]').addEventListener('click', () => run('Publishing product', async () => { requireOk(await supabase.rpc('publish_product', { product_id:form.dataset.product })); await loadProducts(); }));
  });
}

function serviceRow(service) {
  const draft = service.draft_data || {};
  return `<form class="editor-row" data-service="${escapeHtml(service.id)}"><label>Name<input name="name" value="${escapeHtml(draft.name ?? service.name)}" required></label><label>Order<input name="order" type="number" min="0" value="${service.display_order}"></label><label>Available<select name="visible"><option value="true" ${(draft.visible ?? service.visible) ? 'selected':''}>Yes</option><option value="false" ${!(draft.visible ?? service.visible) ? 'selected':''}>No</option></select></label><div></div><label class="wide">Summary<input name="summary" value="${escapeHtml(draft.summary ?? service.summary ?? '')}"></label><label class="wide">Description<textarea name="description" rows="3">${escapeHtml(draft.description ?? service.description ?? '')}</textarea></label><div class="wide editor-actions"><button class="small-btn" type="submit">Save Draft</button><button class="small-btn primary" type="button" data-publish-service>Publish</button><button class="small-btn danger" type="button" data-remove-service>Remove</button><span class="muted">${draft.name !== undefined ? 'Draft saved' : 'Published'}</span></div></form>`;
}

async function loadServices() {
  const data = requireOk(await supabase.from('services').select('*').order('display_order')) || [];
  $('#serviceList').innerHTML = data.map(serviceRow).join('') || '<p class="empty-state">No services configured.</p>';
  $('#serviceList').querySelectorAll('[data-service]').forEach(form => {
    form.addEventListener('submit', event => { event.preventDefault(); run('Saving service draft', async () => { const values = new FormData(form); requireOk(await supabase.from('services').update({ display_order:Number(values.get('order')) || 0, draft_data:{ name:values.get('name').trim(), summary:values.get('summary').trim(), description:values.get('description').trim(), visible:values.get('visible') === 'true' } }).eq('id', form.dataset.service)); await loadServices(); }); });
    form.querySelector('[data-publish-service]').addEventListener('click', () => run('Publishing service', async () => { requireOk(await supabase.rpc('publish_service', { service_id:form.dataset.service })); await loadServices(); }));
    form.querySelector('[data-remove-service]').addEventListener('click', () => { if (confirm('Remove this service from the managed catalog? Existing customer requests are preserved.')) run('Removing service', async () => { requireOk(await supabase.from('services').delete().eq('id', form.dataset.service)); await loadServices(); }); });
  });
}

async function addService() {
  const name = prompt('Service name'); if (!name) return;
  const id = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  await run('Adding service', async () => { requireOk(await supabase.from('services').insert({ id, name, visible:false, display_order:999 })); await loadServices(); });
}
$('#newService').addEventListener('click', addService);

function contentRow(item) {
  const value = item.draft_value ?? item.content_value ?? {};
  return `<form class="editor-row" data-content="${escapeHtml(item.content_key)}"><label>Section key<input name="key" value="${escapeHtml(item.content_key)}" readonly></label><label class="wide">Content (JSON)<textarea name="value" rows="5">${escapeHtml(JSON.stringify(value, null, 2))}</textarea></label><div class="wide editor-actions"><button class="small-btn" type="submit">Save Draft</button><button class="small-btn primary" type="button" data-publish-content>Publish</button><span class="muted">${item.draft_value ? 'Draft saved' : (item.published ? 'Published' : 'Not published')}</span></div></form>`;
}
async function loadContent() {
  const data = requireOk(await supabase.from('website_content').select('*').order('content_key')) || [];
  $('#contentList').innerHTML = data.map(contentRow).join('') || '<p class="empty-state">Add the first managed website section.</p>';
  $('#contentList').querySelectorAll('[data-content]').forEach(form => {
    form.addEventListener('submit', event => { event.preventDefault(); run('Saving website draft', async () => { let parsed; try { parsed = JSON.parse(form.elements.value.value); } catch { throw new Error('Content must be valid JSON'); } requireOk(await supabase.from('website_content').update({ draft_value:parsed }).eq('content_key', form.dataset.content)); await loadContent(); }); });
    form.querySelector('[data-publish-content]').addEventListener('click', () => run('Publishing website section', async () => { requireOk(await supabase.rpc('publish_website_content', { target_key:form.dataset.content })); await loadContent(); }));
  });
}
$('#newContent').addEventListener('click', async () => { const key = prompt('Section key (example: homepage-about)'); if (!key) return; await run('Adding website section', async () => { requireOk(await supabase.from('website_content').insert({ content_key:key.trim(), content_value:{}, draft_value:{}, published:false })); await loadContent(); }); });

function table(headers, rows) { return rows.length ? `<table class="record-table"><thead><tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>` : '<p class="empty-state">No records yet.</p>'; }
async function loadOperations() {
  const target = $('#operationList'); target.innerHTML = '<p class="empty-state">Loading…</p>';
  if (operationView === 'requests') {
    const data = requireOk(await supabase.from('service_requests').select('*').order('created_at', { ascending:false })) || [];
    target.innerHTML = table(['Service','Summary','Preferred date','Status','Actions'], data.map(row => `<tr><td>${escapeHtml(row.service_slug)}</td><td>${escapeHtml(row.summary)}</td><td>${escapeHtml(row.preferred_date || '—')}</td><td><select data-status-table="service_requests" data-id="${row.id}">${['submitted','reviewing','estimate_ready','scheduled','in_progress','completed','cancelled'].map(status => `<option ${row.status===status?'selected':''}>${status}</option>`).join('')}</select></td><td><button class="small-btn" data-create-estimate="${row.id}" data-customer="${row.customer_id}">Create Estimate</button></td></tr>`));
  } else if (operationView === 'appointments') {
    const [appointmentsResult, rolesResult, profilesResult] = await Promise.all([supabase.from('appointments').select('*').order('starts_at', { ascending:false }), supabase.from('user_roles').select('*').eq('role','employee'), supabase.from('profiles').select('*')]);
    const data = requireOk(appointmentsResult) || [], employees = requireOk(rolesResult) || [], profiles = requireOk(profilesResult) || []; const names = Object.fromEntries(profiles.map(profile => [profile.id,profile.display_name || 'Employee']));
    target.innerHTML = table(['Starts','Ends','Employee assignment','Status'], data.map(row => `<tr><td>${escapeHtml(row.starts_at || '—')}</td><td>${escapeHtml(row.ends_at || '—')}</td><td><select data-assignment data-id="${row.id}"><option value="">Unassigned</option>${employees.map(employee => `<option value="${employee.user_id}" ${row.employee_id===employee.user_id?'selected':''}>${escapeHtml(names[employee.user_id])}</option>`).join('')}</select></td><td><select data-status-table="appointments" data-id="${row.id}">${['requested','confirmed','completed','cancelled'].map(status => `<option ${row.status===status?'selected':''}>${status}</option>`).join('')}</select></td></tr>`));
  } else if (operationView === 'estimates') {
    const data = requireOk(await supabase.from('estimates').select('*').order('created_at', { ascending:false })) || [];
    target.innerHTML = table(['Amount','Description','Status','Expires'], data.map(row => `<tr><td>${money(row.amount_cents)}</td><td>${escapeHtml(row.description)}</td><td><select data-status-table="estimates" data-id="${row.id}">${['draft','sent','accepted','declined','expired'].map(status => `<option ${row.status===status?'selected':''}>${status}</option>`).join('')}</select></td><td>${escapeHtml(row.expires_at || '—')}</td></tr>`));
  } else if (operationView === 'messages') {
    const data = requireOk(await supabase.from('messages').select('*').order('created_at', { ascending:false }).limit(100)) || [];
    target.innerHTML = table(['From','To','Message','Sent','Action'], data.map(row => `<tr><td>${escapeHtml(row.sender_id)}</td><td>${escapeHtml(row.recipient_id)}</td><td>${escapeHtml(row.body)}</td><td>${escapeHtml(row.created_at)}</td><td>${row.sender_id !== currentUserId ? `<button class="small-btn" data-reply-to="${row.sender_id}" data-request="${row.request_id || ''}">Reply</button>` : ''}</td></tr>`));
  } else {
    const [rolesResult, profilesResult, employeesResult] = await Promise.all([supabase.from('user_roles').select('*'), supabase.from('profiles').select('*'), supabase.from('employee_profiles').select('*')]);
    const roles = requireOk(rolesResult) || [], profiles = requireOk(profilesResult) || [], employees = requireOk(employeesResult) || [];
    const profileMap = Object.fromEntries(profiles.map(profile => [profile.id, profile])); const employeeMap = Object.fromEntries(employees.map(profile => [profile.user_id, profile]));
    const wanted = roles.filter(row => row.role === (operationView === 'employees' ? 'employee' : 'customer'));
    target.innerHTML = table(['Name','Phone','Role / job','Action'], wanted.map(row => operationView === 'employees'
      ? `<tr><td>${escapeHtml(profileMap[row.user_id]?.display_name || 'Account holder')}</td><td>${escapeHtml(profileMap[row.user_id]?.phone || '—')}</td><td><input data-job-role="${row.user_id}" value="${escapeHtml(employeeMap[row.user_id]?.job_role || 'Employee')}"></td><td><button class="small-btn" data-save-employee="${row.user_id}">Save</button></td></tr>`
      : `<tr><td>${escapeHtml(profileMap[row.user_id]?.display_name || 'Account holder')}</td><td>${escapeHtml(profileMap[row.user_id]?.phone || '—')}</td><td>Customer</td><td><button class="small-btn" data-make-employee="${row.user_id}">Make Employee</button></td></tr>`));
  }
  target.querySelectorAll('[data-status-table]').forEach(select => select.addEventListener('change', () => run('Updating status', async () => { requireOk(await supabase.from(select.dataset.statusTable).update({ status:select.value }).eq('id', select.dataset.id)); })));
  target.querySelectorAll('[data-assignment]').forEach(select => select.addEventListener('change', () => run('Saving employee assignment', async () => { requireOk(await supabase.from('appointments').update({ employee_id:select.value || null }).eq('id', select.dataset.id)); })));
  target.querySelectorAll('[data-create-estimate]').forEach(button => button.addEventListener('click', () => { const amount = prompt('Estimate amount in dollars'); if (amount === null) return; const description = prompt('Estimate description') || ''; run('Creating estimate', async () => { requireOk(await supabase.from('estimates').insert({ request_id:button.dataset.createEstimate, customer_id:button.dataset.customer, amount_cents:Math.round(Number(amount)*100), description, status:'draft' })); await loadOperations(); }); }));
  target.querySelectorAll('[data-reply-to]').forEach(button => button.addEventListener('click', () => { const body = prompt('Reply message'); if (!body) return; run('Sending message', async () => { requireOk(await supabase.from('messages').insert({ request_id:button.dataset.request || null, sender_id:currentUserId, recipient_id:button.dataset.replyTo, body })); await loadOperations(); }); }));
  target.querySelectorAll('[data-save-employee]').forEach(button => button.addEventListener('click', () => run('Saving employee', async () => { const jobRole = target.querySelector(`[data-job-role="${button.dataset.saveEmployee}"]`).value.trim(); requireOk(await supabase.from('employee_profiles').upsert({ user_id:button.dataset.saveEmployee, job_role:jobRole, active:true })); })));
  target.querySelectorAll('[data-make-employee]').forEach(button => button.addEventListener('click', () => { const jobRole = prompt('Employee job role'); if (!jobRole) return; if (!confirm('Change this customer account to an employee account?')) return; run('Authorizing employee', async () => { requireOk(await supabase.from('user_roles').update({ role:'employee', updated_at:new Date().toISOString() }).eq('user_id', button.dataset.makeEmployee)); requireOk(await supabase.from('employee_profiles').upsert({ user_id:button.dataset.makeEmployee, job_role:jobRole, active:true })); await loadOperations(); }); }));
}

async function loadBusiness() { const data = requireOk(await supabase.from('business_settings').select('*').eq('id', true).single()); if (!data) return; for (const key of ['business_name','phone','service_area','contact_email']) $('#businessForm').elements[key].value = data[key] || ''; }
$('#businessForm').addEventListener('submit', event => { event.preventDefault(); run('Saving business settings', async () => { const values = Object.fromEntries(new FormData(event.currentTarget)); requireOk(await supabase.from('business_settings').update({ ...values, updated_at:new Date().toISOString() }).eq('id', true)); }); });

async function loadPayments() {
  const [settingsResult, transactionResult] = await Promise.all([supabase.from('payment_settings').select('*').single(), supabase.from('payment_transactions').select('payment_kind,amount_cents,status')]);
  const settings = settingsResult.data; const transactions = transactionResult.data || [];
  $('#paymentState').textContent = settings ? `Stripe sandbox prepared. Checkout ${settings.payments_enabled ? 'enabled' : 'disabled'}; live mode disabled.` : 'Payment schema is not configured yet.';
  $('#productSales').textContent = money(transactions.filter(row => row.payment_kind === 'product' && row.status === 'paid').reduce((sum,row) => sum + row.amount_cents, 0));
  $('#serviceSales').textContent = money(transactions.filter(row => row.payment_kind === 'service' && row.status === 'paid').reduce((sum,row) => sum + row.amount_cents, 0));
}
document.querySelectorAll('[data-stripe-path]').forEach(button => button.addEventListener('click', () => window.open(`https://dashboard.stripe.com/acct_1UTnEDIMECjQAhGK/${button.dataset.stripePath}`, '_blank', 'noopener')));

async function initialize() {
  const denied = $('#deniedPanel'), dashboard = $('#ownerDashboard'), authStatus = $('#ownerStatus');
  const { data:{ user }, error } = await supabase.auth.getUser();
  if (error || !user) { authStatus.textContent = 'Sign in with an authorized owner account to continue.'; return; }
  const role = requireOk(await supabase.from('user_roles').select('role').eq('user_id', user.id).single());
  if (role?.role !== 'owner') { authStatus.textContent = 'This account is not authorized as an owner. Owner access is never granted from an email address alone.'; return; }
  currentUserId = user.id;
  denied.hidden = true; dashboard.hidden = false;
  const [roles, requests, appointments, messages] = await Promise.all([supabase.from('user_roles').select('role'), count('service_requests'), count('appointments'), count('messages')]);
  const roleRows = roles.data || []; $('#customerCount').textContent = roleRows.filter(row => row.role === 'customer').length; $('#employeeCount').textContent = roleRows.filter(row => row.role === 'employee').length; $('#requestCount').textContent = requests; $('#appointmentCount').textContent = appointments; $('#messageCount').textContent = messages;
  await Promise.all([loadBusiness(), loadProducts(), loadServices(), loadContent(), loadOperations(), loadPayments()]);
  setStatus('All owner controls loaded');
}

initialize().catch(error => setStatus(error.message || 'Dashboard failed to load', true));
