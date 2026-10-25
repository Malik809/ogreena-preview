const { createClient } = window.supabase;
const safariSafeAuthLock = async (_name, _acquireTimeout, callback) => callback();
const SUPABASE_URL = 'https://mhhjzifeaofgskimvuom.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_13onHaeoGy3uEVnezcGZCQ_RtSzNOlM';
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storage: window.localStorage, storageKey: 'ogreena-auth-session', lock: safariSafeAuthLock } });
const $ = selector => document.querySelector(selector);
const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[char]));
const money = cents => new Intl.NumberFormat('en-US', { style:'currency', currency:'USD' }).format((Number(cents) || 0) / 100);
let operationView = 'requests';
let currentUserId = null;
const OWNER_SESSION_HANDOFF_KEY = 'ogreena-owner-session-handoff';

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
  return `<form class="editor-row" data-product="${escapeHtml(product.id)}"><label>Name<input name="name" value="${escapeHtml(draft.name ?? product.name)}" required></label><label>Size<input name="size" value="${escapeHtml(draft.size ?? product.size)}" required></label><label>Price<input name="price" type="number" min="0" step="0.01" value="${((draft.price_cents ?? product.price_cents) / 100).toFixed(2)}" required></label><label>Order<input name="order" type="number" min="1" value="${Number(product.display_order) || 1}" required></label><label class="wide">Photo path<input name="image_path" value="${escapeHtml(draft.image_path ?? product.image_path)}" required></label><label>Available<select name="visible"><option value="true" ${(draft.visible ?? product.visible) ? 'selected':''}>Yes</option><option value="false" ${!(draft.visible ?? product.visible) ? 'selected':''}>No</option></select></label><label class="wide">Description<textarea name="description" rows="2">${escapeHtml(draft.description ?? product.description ?? '')}</textarea></label><div class="wide editor-actions"><button class="small-btn" type="submit">Save Draft</button><button class="small-btn primary" type="button" data-publish-product>Publish</button><button class="small-btn danger" type="button" data-remove-product>Remove</button><span class="muted">${draft.name !== undefined ? 'Draft saved' : 'Published'}</span></div></form>`;
}

async function loadProducts() {
  const data = requireOk(await supabase.from('products').select('*').order('display_order')) || [];
  $('#productList').innerHTML = data.map(productRow).join('') || '<p class="empty-state">No products configured.</p>';
  $('#productCount').textContent = data.length;
  $('#productList').querySelectorAll('[data-product]').forEach(form => {
    form.addEventListener('submit', event => { event.preventDefault(); run('Saving product draft', async () => { const values = new FormData(form); const requestedOrder=Number(values.get('order')) || 1; const current=requireOk(await supabase.from('products').select('display_order').eq('id',form.dataset.product).single()); if(current.display_order!==requestedOrder){const occupant=requireOk(await supabase.from('products').select('id').eq('display_order',requestedOrder).maybeSingle());requireOk(await supabase.from('products').update({display_order:-current.display_order}).eq('id',form.dataset.product));if(occupant)requireOk(await supabase.from('products').update({display_order:current.display_order}).eq('id',occupant.id));requireOk(await supabase.from('products').update({display_order:requestedOrder}).eq('id',form.dataset.product));} requireOk(await supabase.from('products').update({ draft_data:{ name:values.get('name').trim(), size:values.get('size').trim(), price_cents:Math.round(Number(values.get('price')) * 100), image_path:values.get('image_path').trim(), description:values.get('description').trim(), visible:values.get('visible') === 'true' } }).eq('id', form.dataset.product)); await loadProducts(); }); });
    form.querySelector('[data-publish-product]').addEventListener('click', () => run('Publishing product', async () => { requireOk(await supabase.rpc('publish_product', { product_id:form.dataset.product })); await loadProducts(); }));
    form.querySelector('[data-remove-product]').addEventListener('click', () => { if (confirm('Remove this product from the public catalog? Existing orders are preserved.')) run('Removing product', async () => { requireOk(await supabase.from('products').update({ visible:false, draft_data:null }).eq('id', form.dataset.product)); await loadProducts(); }); });
  });
}

$('#newProduct').addEventListener('click', async () => {
  const name = prompt('Product name'); if (!name) return;
  const id = `og-${name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${Date.now()}`;
  await run('Adding product', async () => {
    const existing = requireOk(await supabase.from('products').select('display_order').order('display_order', { ascending:false }).limit(1)) || [];
    requireOk(await supabase.from('products').insert({ id, name, size:'', price_cents:0, image_path:'assets/products/', display_order:(existing[0]?.display_order || 0) + 1, visible:false }));
    await loadProducts();
  });
});

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
  return `<form class="editor-row" data-content="${escapeHtml(item.content_key)}"><div class="wide content-fields"><label>Section name<input name="label" value="${escapeHtml(value.label || item.content_key)}" required></label><label>Page selector<input name="selector" value="${escapeHtml(value.selector || '')}" placeholder="#panel-about p" required></label><label class="wide">Text<textarea name="text" rows="4">${escapeHtml(value.text || '')}</textarea></label><label>Image path (optional)<input name="image" value="${escapeHtml(value.image || '')}" placeholder="/assets/image.jpg"></label><label>Display order<input name="order" type="number" value="${Number(item.display_order) || 0}"></label><label>Visible<select name="visible"><option value="true" ${(item.draft_visible ?? item.visible) !== false ? 'selected':''}>Yes</option><option value="false" ${(item.draft_visible ?? item.visible) === false ? 'selected':''}>No</option></select></label></div><div class="wide editor-actions"><button class="small-btn" type="submit">Save Draft</button><button class="small-btn" type="button" data-preview-content>Preview</button><button class="small-btn primary" type="button" data-publish-content>Publish</button><button class="small-btn" type="button" data-undo-content>Undo</button><button class="small-btn danger" type="button" data-hide-content>Hide</button><span class="muted">${item.draft_value ? 'Draft saved' : (item.published ? 'Published' : 'Not published')}</span></div></form>`;
}
function contentPayload(form) { const values=new FormData(form); return { label:values.get('label').trim(), selector:values.get('selector').trim(), text:values.get('text').trim(), ...(values.get('image').trim()?{image:values.get('image').trim()}:{}) }; }
function previewContent(form) { const value=contentPayload(form); $('#contentPreview').innerHTML=`<article class="site-preview-card">${value.image?`<img src="${escapeHtml(value.image)}" alt="">`:''}<h3>${escapeHtml(value.label)}</h3><p>${escapeHtml(value.text)}</p><small class="muted">${escapeHtml(value.selector)}</small></article>`; }
async function loadContent() {
  const data = requireOk(await supabase.from('website_content').select('*').is('archived_at', null).order('display_order')) || [];
  $('#contentList').innerHTML = data.map(contentRow).join('') || '<p class="empty-state">The managed content migration has not been applied yet.</p>';
  $('#contentList').querySelectorAll('[data-content]').forEach(form => {
    form.addEventListener('input', () => previewContent(form));
    form.addEventListener('submit', event => { event.preventDefault(); run('Saving website draft', async () => { const values=new FormData(form); requireOk(await supabase.from('website_content').update({ draft_value:contentPayload(form), draft_visible:values.get('visible')==='true', display_order:Number(values.get('order'))||0 }).eq('content_key', form.dataset.content)); await loadContent(); }); });
    form.querySelector('[data-preview-content]').addEventListener('click', () => previewContent(form));
    form.querySelector('[data-publish-content]').addEventListener('click', () => run('Publishing website section', async () => { requireOk(await supabase.rpc('publish_website_content', { target_key:form.dataset.content })); await loadContent(); }));
    form.querySelector('[data-undo-content]').addEventListener('click', () => loadContent());
    form.querySelector('[data-hide-content]').addEventListener('click', () => run('Hiding website section', async () => { requireOk(await supabase.from('website_content').update({ draft_visible:false }).eq('content_key',form.dataset.content)); requireOk(await supabase.rpc('publish_website_content',{target_key:form.dataset.content})); await loadContent(); }));
  });
}
$('#newContent').addEventListener('click', async () => { const label=prompt('Section name'); if(!label)return; const key=`custom-${Date.now()}`; await run('Adding website section',async()=>{requireOk(await supabase.from('website_content').insert({content_key:key,content_value:{label,selector:`[data-managed-section="${key}"]`,text:''},draft_value:{label,selector:`[data-managed-section="${key}"]`,text:''},published:false,display_order:999,visible:false}));await loadContent();});});
document.querySelectorAll('[data-preview-size]').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('[data-preview-size]').forEach(item=>item.classList.toggle('active',item===button));document.querySelector('[data-preview-frame]').classList.toggle('mobile',button.dataset.previewSize==='mobile');}));
$('#restoreContent').addEventListener('click',()=>run('Restoring previous website version',async()=>{const versions=requireOk(await supabase.from('website_content_versions').select('id,content_key,created_at').order('created_at',{ascending:false}).limit(20))||[];if(!versions.length)throw new Error('No previous published version is available yet');const choices=versions.map((v,i)=>`${i+1}. ${v.content_key} — ${new Date(v.created_at).toLocaleString()}`).join('\n');const selected=Number(prompt(`Choose a version to restore as a draft:\n${choices}`));if(!selected||!versions[selected-1])throw new Error('Restore cancelled');requireOk(await supabase.rpc('restore_website_content',{version_id:versions[selected-1].id}));await loadContent();}));

function table(headers, rows) { return rows.length ? `<table class="record-table"><thead><tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>` : '<p class="empty-state">No records yet.</p>'; }
async function loadOperations() {
  const target = $('#operationList'); target.innerHTML = '<p class="empty-state">Loading…</p>';
  if (operationView === 'requests') {
    const [requestsResult, rolesResult, profilesResult] = await Promise.all([supabase.from('service_requests').select('*').order('created_at', { ascending:false }), supabase.from('user_roles').select('*').eq('role','employee'), supabase.from('profiles').select('*')]);
    const data = requireOk(requestsResult) || [], employees = requireOk(rolesResult) || [], profiles = requireOk(profilesResult) || []; const names = Object.fromEntries(profiles.map(profile => [profile.id, profile.display_name || 'Employee']));
    target.innerHTML = table(['Customer','Service / details','Preferred date','Notification','Status / employee','Actions'], data.map(row => `<tr><td><b>${escapeHtml(row.customer_name || row.summary)}</b><br>${escapeHtml(row.customer_phone || '—')}<br>${escapeHtml(row.customer_email || 'Account customer')}<br>${escapeHtml(row.service_address || '—')}</td><td><b>${escapeHtml(row.service_slug.replaceAll('-',' '))}</b><br>${escapeHtml(row.details || row.summary)}</td><td>${escapeHtml(row.preferred_date || '—')}</td><td><span class="tag">${escapeHtml(row.notification_status || 'not required')}</span>${row.notification_status === 'failed' ? '<br><small>Email queued for retry</small>' : ''}</td><td><select data-status-table="service_requests" data-id="${row.id}">${['submitted','reviewing','estimate_ready','scheduled','in_progress','completed','cancelled'].map(status => `<option ${row.status===status?'selected':''}>${status}</option>`).join('')}</select><select data-request-assignment data-id="${row.id}"><option value="">Unassigned</option>${employees.map(employee => `<option value="${employee.user_id}" ${row.assigned_employee_id===employee.user_id?'selected':''}>${escapeHtml(names[employee.user_id])}</option>`).join('')}</select></td><td><button class="small-btn" data-respond-request="${row.id}">Respond</button> <button class="small-btn" data-create-estimate="${row.id}" data-customer="${row.customer_id || ''}">Create Estimate</button> <button class="small-btn" data-schedule-request="${row.id}" data-customer="${row.customer_id || ''}" data-employee="${row.assigned_employee_id || ''}">Schedule</button></td></tr>`));
  } else if (operationView === 'businesses') {
    const data = requireOk(await supabase.from('business_registration_requests').select('id,business_id,authority_description,status,created_at,businesses!inner(display_name)').order('created_at', { ascending:false })) || [];
    target.innerHTML = table(['Business','Authority statement','Requested','Status','Action'], data.map(row => `<tr><td><b>${escapeHtml(row.businesses?.display_name || 'Business')}</b></td><td>${escapeHtml(row.authority_description)}</td><td>${escapeHtml(new Date(row.created_at).toLocaleDateString())}</td><td>${escapeHtml(row.status)}</td><td>${row.status === 'pending' ? `<button class="small-btn primary" data-review-business="${row.id}" data-decision="approved">Approve</button> <button class="small-btn danger" data-review-business="${row.id}" data-decision="rejected">Reject</button>` : 'Reviewed'}</td></tr>`));
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
  target.querySelectorAll('[data-review-business]').forEach(button => button.addEventListener('click', () => {
    const decision = button.dataset.decision;
    if (!confirm(`${decision === 'approved' ? 'Approve' : 'Reject'} this business ownership request? This does not create a Stripe account.`)) return;
    run(`${decision === 'approved' ? 'Approving' : 'Rejecting'} business ownership`, async () => {
      requireOk(await supabase.rpc('review_business_registration', { request_id:button.dataset.reviewBusiness, decision }));
      await loadOperations();
    });
  }));
  target.querySelectorAll('[data-assignment]').forEach(select => select.addEventListener('change', () => run('Saving employee assignment', async () => { requireOk(await supabase.from('appointments').update({ employee_id:select.value || null }).eq('id', select.dataset.id)); })));
  target.querySelectorAll('[data-request-assignment]').forEach(select => select.addEventListener('change', () => run('Saving request assignment', async () => { requireOk(await supabase.from('service_requests').update({ assigned_employee_id:select.value || null }).eq('id', select.dataset.id)); })));
  target.querySelectorAll('[data-create-estimate]').forEach(button => button.addEventListener('click', () => { const amount = prompt('Estimate amount in dollars'); if (amount === null) return; const description = prompt('Estimate description') || ''; run('Creating estimate', async () => { requireOk(await supabase.from('estimates').insert({ request_id:button.dataset.createEstimate, customer_id:button.dataset.customer || null, amount_cents:Math.round(Number(amount)*100), description, status:'draft' })); await loadOperations(); }); }));
  target.querySelectorAll('[data-schedule-request]').forEach(button => button.addEventListener('click', () => { const startsAt = prompt('Appointment start (example: 2026-11-02 10:00)'); if (!startsAt) return; const parsed = new Date(startsAt); if (Number.isNaN(parsed.valueOf())) { setStatus('Enter a valid appointment date and time', true); return; } run('Scheduling appointment', async () => { requireOk(await supabase.from('appointments').insert({ request_id:button.dataset.scheduleRequest, customer_id:button.dataset.customer || null, employee_id:button.dataset.employee || null, starts_at:parsed.toISOString(), status:'requested' })); requireOk(await supabase.from('service_requests').update({ status:'scheduled' }).eq('id', button.dataset.scheduleRequest)); await loadOperations(); }); }));
  target.querySelectorAll('[data-respond-request]').forEach(button => button.addEventListener('click', () => { const message = prompt('Response to the customer'); if (!message) return; run('Sending customer response', async () => { const result = await supabase.functions.invoke('respond-service-request', { body:{ requestId:button.dataset.respondRequest, message } }); requireOk(result); await loadOperations(); }); }));
  target.querySelectorAll('[data-reply-to]').forEach(button => button.addEventListener('click', () => { const body = prompt('Reply message'); if (!body) return; run('Sending message', async () => { requireOk(await supabase.from('messages').insert({ request_id:button.dataset.request || null, sender_id:currentUserId, recipient_id:button.dataset.replyTo, body })); await loadOperations(); }); }));
  target.querySelectorAll('[data-save-employee]').forEach(button => button.addEventListener('click', () => run('Saving employee', async () => { const jobRole = target.querySelector(`[data-job-role="${button.dataset.saveEmployee}"]`).value.trim(); requireOk(await supabase.from('employee_profiles').upsert({ user_id:button.dataset.saveEmployee, job_role:jobRole, active:true })); })));
  target.querySelectorAll('[data-make-employee]').forEach(button => button.addEventListener('click', () => { const jobRole = prompt('Employee job role'); if (!jobRole) return; if (!confirm('Change this customer account to an employee account?')) return; run('Authorizing employee', async () => { requireOk(await supabase.from('user_roles').update({ role:'employee', updated_at:new Date().toISOString() }).eq('user_id', button.dataset.makeEmployee)); requireOk(await supabase.from('employee_profiles').upsert({ user_id:button.dataset.makeEmployee, job_role:jobRole, active:true })); await loadOperations(); }); }));
}

async function loadBusiness() { const data = requireOk(await supabase.from('business_settings').select('*').eq('id', true).single()); if (!data) return; for (const key of ['business_name','phone','service_area','contact_email']) $('#businessForm').elements[key].value = data[key] || ''; }
$('#businessForm').addEventListener('submit', event => { event.preventDefault(); run('Saving business settings', async () => { const values = Object.fromEntries(new FormData(event.currentTarget)); requireOk(await supabase.from('business_settings').update({ ...values, updated_at:new Date().toISOString() }).eq('id', true)); }); });

async function loadPayments() {
  const [settingsResult, transactionResult] = await Promise.all([supabase.from('payment_settings').select('*').single(), supabase.from('payment_transactions').select('id,payment_kind,amount_cents,refunded_amount_cents,status,created_at').order('created_at', { ascending:false }).limit(100)]);
  const settings = settingsResult.data; const transactions = transactionResult.data || [];
  $('#paymentState').textContent = settings ? `Existing Ogreena Stripe account found. Checkout ${settings.payments_enabled ? 'enabled' : 'disabled'}; live charges remain disabled pending Stripe verification and final owner approval.` : 'Payment schema is not configured yet.';
  $('#productSales').textContent = money(transactions.filter(row => row.payment_kind === 'product' && row.status === 'paid').reduce((sum,row) => sum + row.amount_cents, 0));
  $('#serviceSales').textContent = money(transactions.filter(row => ['service_deposit','service_full','invoice'].includes(row.payment_kind) && row.status === 'paid').reduce((sum,row) => sum + row.amount_cents, 0));
  const statusResult = await supabase.functions.invoke('payment-status');
  const state = statusResult.data;
  $('#paymentDetails').innerHTML = `<div><dt>Mode</dt><dd>Live preparation</dd></div><div><dt>Sandbox backend</dt><dd>${state?.configured ? 'Connected' : 'Deployment required'}</dd></div><div><dt>Checkout</dt><dd>${settings?.payments_enabled ? 'Sandbox enabled' : 'Disabled'}</dd></div><div><dt>Live payments</dt><dd>Awaiting final approval</dd></div>`;
  $('#paymentTransactions').innerHTML = table(['Date','Type','Amount','Refunded','Status','Action'], transactions.map(row => `<tr><td>${escapeHtml(new Date(row.created_at).toLocaleDateString())}</td><td>${escapeHtml(row.payment_kind.replaceAll('_',' '))}</td><td>${money(row.amount_cents)}</td><td>${money(row.refunded_amount_cents)}</td><td>${escapeHtml(row.status)}</td><td>${row.status === 'paid' ? `<button class="small-btn" data-refund="${row.id}">Refund in sandbox</button>` : '—'}</td></tr>`));
  $('#paymentTransactions').querySelectorAll('[data-refund]').forEach(button => button.addEventListener('click', () => {
    if (!confirm('Issue a full sandbox refund? No live money will move.')) return;
    run('Creating sandbox refund', async () => { const result = await supabase.functions.invoke('create-refund', { body:{ transactionId:button.dataset.refund } }); requireOk(result); await loadPayments(); });
  }));
}
document.querySelectorAll('[data-stripe-path]').forEach(button => button.addEventListener('click', () => {
  // Stripe Dashboard is the secure hosted interface for the business's direct account.
  // Do not hardcode an account ID: Stripe selects the authenticated Ogreena account.
  window.open(`https://dashboard.stripe.com/${button.dataset.stripePath}`, '_blank', 'noopener');
}));
document.querySelector('[data-payment-setup]')?.addEventListener('click',()=>{
  sessionStorage.removeItem('ogreena-stripe-mode');
  location.href='payment-setup/';
});
document.querySelector('[data-live-validation-checkout]')?.addEventListener('click',()=>run('Opening the owner-only $0.50 live checkout',async()=>{
  const result=await supabase.functions.invoke('create-live-validation-checkout',{body:{}});
  const data=requireOk(result);
  if(!data?.url)throw new Error('The controlled live checkout URL was not returned');
  location.href=data.url;
}));

async function initialize() {
  const denied = $('#deniedPanel'), dashboard = $('#ownerDashboard'), authStatus = $('#ownerStatus');
  let sessionResult = await Promise.race([
    supabase.auth.getSession(),
    new Promise(resolve => setTimeout(() => resolve({ data:{ session:null }, error:new Error('Session check timed out') }), 8000))
  ]);
  let session = sessionResult.data?.session;
  if (!session?.user) {
    const handoff = JSON.parse(window.sessionStorage.getItem(OWNER_SESSION_HANDOFF_KEY) || 'null');
    if (handoff?.access_token && handoff?.refresh_token) {
      sessionResult = await Promise.race([
        supabase.auth.setSession(handoff),
        new Promise(resolve => setTimeout(() => resolve({ data:{ session:null }, error:new Error('Session restore timed out') }), 8000))
      ]);
      session = sessionResult.data?.session;
    }
  }
  if (sessionResult.error || !session?.user) { authStatus.innerHTML = 'Your owner session is not active in this browser. <a href="../auth/?mode=signin">Sign in to continue</a>.'; return; }
  window.sessionStorage.removeItem(OWNER_SESSION_HANDOFF_KEY);
  const role = requireOk(await supabase.from('user_roles').select('role').eq('user_id', session.user.id).single());
  if (role?.role !== 'owner') { authStatus.textContent = 'This account is not authorized as an owner. Owner access is never granted from an email address alone.'; return; }
  currentUserId = session.user.id;
  denied.hidden = true; dashboard.hidden = false;
  const [roles, requests, appointments, messages] = await Promise.all([supabase.from('user_roles').select('role'), count('service_requests'), count('appointments'), count('messages')]);
  const roleRows = roles.data || []; $('#customerCount').textContent = roleRows.filter(row => row.role === 'customer').length; $('#employeeCount').textContent = roleRows.filter(row => row.role === 'employee').length; $('#requestCount').textContent = requests; $('#appointmentCount').textContent = appointments; $('#messageCount').textContent = messages;
  await Promise.all([loadBusiness(), loadProducts(), loadServices(), loadContent(), loadOperations(), loadPayments()]);
  setStatus('All owner controls loaded');
}

initialize().catch(error => setStatus(error.message || 'Dashboard failed to load', true));
