const { createClient } = window.supabase;
const safariSafeAuthLock = async (_name, _acquireTimeout, callback) => callback();
const SUPABASE_URL = 'https://mhhjzifeaofgskimvuom.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_13onHaeoGy3uEVnezcGZCQ_RtSzNOlM';
const OGREENA_LIVE_MERCHANT = 'acct_1UTpIlI19b4U0AqM';
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storage: window.localStorage, storageKey: 'ogreena-auth-session', lock: safariSafeAuthLock } });
const $ = selector => document.querySelector(selector);
const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[char]));
const money = cents => new Intl.NumberFormat('en-US', { style:'currency', currency:'USD' }).format((Number(cents) || 0) / 100);
let operationView = 'requests';
let currentUserId = null;
let paymentView = 'product';
let paymentRows = [];
let paymentSettings = null;
let replacementConnectInstance = null;
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

const serviceProfileOptions = [
  ['carpet-cleaning','Carpet Cleaning'], ['house-cleaning','House Cleaning'],
  ['deep-cleaning','Deep Cleaning'], ['window-cleaning','Window Cleaning'],
  ['mattress-cleaning','Mattress Cleaning'], ['upholstery-cleaning','Upholstery Cleaning'],
  ['tile-grout-cleaning','Tile & Grout Cleaning'], ['floor-polishing','Floor Polishing'],
  ['move-in-move-out-cleaning','Move-In / Move-Out'], ['pressure-washing','Pressure Washing'],
  ['commercial-cleaning','Commercial Cleaning'], ['janitorial-services','Janitorial Services'],
  ['facilities-maintenance','Facilities Maintenance'], ['electrical-services','Electrical Services']
];
const pricePageOptions = serviceProfileOptions.map(([value,label]) => `<option value="${value}">${label}</option>`).join('');
const serviceLabel = slug => serviceProfileOptions.find(([value]) => value === slug)?.[1] || slug.replaceAll('-', ' ');
let selectedWebsiteService = 'carpet-cleaning';
const priceCategoryForSlug = slug => ({
  'carpet-cleaning':'carpet-cleaning', 'house-cleaning':'housekeeping', 'deep-cleaning':'housekeeping',
  'window-cleaning':'housekeeping', 'mattress-cleaning':'mattress-cleaning',
  'upholstery-cleaning':'upholstery-cleaning', 'tile-grout-cleaning':'floor-cleaning',
  'floor-polishing':'floor-cleaning'
}[slug] || 'housekeeping');

function priceRow(item) {
  return `<form class="editor-row price-editor" data-price-item="${escapeHtml(item.id)}"><div class="wide price-assignment"><strong>${escapeHtml(item.name)}</strong><span class="tag">Assigned to ${escapeHtml(serviceLabel(item.service_slug))}</span></div><label>Service name<input name="name" value="${escapeHtml(item.name)}" required maxlength="150"></label><label>Price<input name="price" type="number" min="0" step="0.01" value="${(item.price_cents / 100).toFixed(2)}" required></label><label>Rate type<select name="pricing_type"><option value="fixed" ${item.pricing_type === 'fixed' ? 'selected' : ''}>Fixed price</option><option value="hourly" ${item.pricing_type === 'hourly' ? 'selected' : ''}>Hourly rate</option><option value="per_square_foot" ${item.pricing_type === 'per_square_foot' ? 'selected' : ''}>Per square foot</option><option value="per_unit" ${item.pricing_type === 'per_unit' ? 'selected' : ''}>Per item / unit</option></select></label><label>Unit label<input name="unit_label" value="${escapeHtml(item.unit_label || '')}" placeholder="per hour, per sq. ft., or each"></label><label>Order<input name="display_order" type="number" min="0" value="${Number(item.display_order) || 0}"></label><label>Published<select name="active"><option value="true" ${item.active ? 'selected' : ''}>Yes</option><option value="false" ${!item.active ? 'selected' : ''}>No</option></select></label><label class="wide">Description<textarea name="description" maxlength="500" rows="2">${escapeHtml(item.description || '')}</textarea></label><details class="wide price-advanced"><summary>Move to another service page</summary><label>Public service page<select name="service_slug">${pricePageOptions}</select></label></details><div class="wide editor-actions"><button class="small-btn primary" type="submit">Save Price</button><button class="small-btn danger" type="button" data-delete-price>Delete Price</button></div></form>`;
}

async function loadServicePrices() {
  const result = await supabase.from('service_price_items').select('*').order('display_order');
  if (result.error) {
    $('#servicePriceList').innerHTML = '<p class="empty-state">The residential price catalog migration has not been applied yet.</p>';
    return;
  }
  const selectedItems=(result.data || []).filter(item => item.service_slug === selectedWebsiteService);
  $('#servicePriceList').innerHTML = `<section class="catalog-category"><h3>${escapeHtml(serviceLabel(selectedWebsiteService))} Prices</h3>${selectedItems.map(priceRow).join('') || '<p class="empty-state">No prices assigned to this service. Use Add Price to create one.</p>'}</section>`;
  $('#servicePriceList').querySelectorAll('[data-price-item]').forEach(form => {
    const item = (result.data || []).find(row => row.id === form.dataset.priceItem);
    form.querySelector('[name="service_slug"]').value = item.service_slug;
    form.addEventListener('submit', event => { event.preventDefault(); run('Saving service price', async () => {
      const values = new FormData(form);
      const pricingType=values.get('pricing_type');
      const defaultUnit=pricingType==='hourly'?'per hour':pricingType==='per_square_foot'?'per sq. ft.':'';
      requireOk(await supabase.from('service_price_items').update({ category:priceCategoryForSlug(values.get('service_slug')), service_slug:values.get('service_slug'), name:values.get('name').trim(), description:values.get('description').trim(), price_cents:Math.round(Number(values.get('price')) * 100), pricing_type:pricingType, unit_label:values.get('unit_label').trim() || defaultUnit, display_order:Number(values.get('display_order')) || 0, active:values.get('active') === 'true', updated_at:new Date().toISOString() }).eq('id', form.dataset.priceItem));
      await loadServicePrices();
    }); });
    form.querySelector('[data-delete-price]').addEventListener('click', () => { if (confirm(`Permanently delete “${item.name}”? Existing requests remain, but this price cannot be restored.`)) run('Deleting service price', async () => { requireOk(await supabase.from('service_price_items').delete().eq('id',form.dataset.priceItem)); await loadServicePrices(); }); });
  });
}

$('#newPriceItem').addEventListener('click', () => {
  const name = prompt('Service price name'); if (!name) return;
  const serviceSlug = selectedWebsiteService;
  const price = prompt('Price in dollars', '0'); if (price === null || !Number.isFinite(Number(price)) || Number(price) < 0) return;
  const id = `${serviceSlug}-${name.toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}-${Date.now()}`;
  run('Adding service price', async () => { requireOk(await supabase.from('service_price_items').insert({ id, category:priceCategoryForSlug(serviceSlug), service_slug:serviceSlug, name:name.trim(), description:'', price_cents:Math.round(Number(price) * 100), pricing_type:'fixed', unit_label:'', active:false, display_order:999 })); await loadServicePrices(); });
});

const SERVICE_IMAGE_BUCKET = 'service-images';
const allowedServiceImageTypes = new Set(['image/jpeg','image/png','image/webp']);
function serviceImageUrl(path) {
  if (!path) return '';
  if (/^https:\/\//.test(path)) return path;
  if (path.startsWith('assets/')) return `../${path}`;
  return `${SUPABASE_URL}/storage/v1/object/public/${SERVICE_IMAGE_BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`;
}
function pictureRow(item) {
  const previewPath=item.draft_path || item.current_path;
  const x=item.draft_position_x ?? item.position_x ?? 50;
  const y=item.draft_position_y ?? item.position_y ?? 50;
  return `<article class="picture-editor-card" data-picture-service="${escapeHtml(item.service_slug)}"><div><h3>${escapeHtml(serviceLabel(item.service_slug))}</h3><p class="muted">Large service-page cover picture · ${item.draft_path ? 'Draft not published' : 'Currently published'}</p></div><div class="picture-preview" role="img" aria-label="${escapeHtml(serviceLabel(item.service_slug))} cover preview" style="background-image:url('${escapeHtml(serviceImageUrl(previewPath))}');background-position:${x}% ${y}%"></div><input class="visually-hidden" type="file" data-picture-file accept="image/jpeg,image/png,image/webp"><button class="small-btn picture-change-button" type="button" data-change-picture>Change Cover Picture</button><p class="muted" data-picture-selection>No replacement selected. The current picture will stay unchanged.</p><label>Horizontal position <output data-x-output>${x}%</output><input type="range" data-picture-x min="0" max="100" value="${x}"></label><label>Vertical position <output data-y-output>${y}%</output><input type="range" data-picture-y min="0" max="100" value="${y}"></label><div class="editor-actions"><button class="small-btn" type="button" data-save-picture>Save Draft</button><button class="small-btn primary" type="button" data-publish-picture ${item.draft_path?'':'disabled'}>Publish Picture</button><button class="small-btn" type="button" data-restore-picture ${item.previous_path?'':'disabled'}>Restore Previous</button></div></article>`;
}
async function loadServicePictures() {
  const data=requireOk(await supabase.from('service_profile_media').select('*').order('service_slug')) || [];
  const selected=data.find(item => item.service_slug === selectedWebsiteService);
  $('#servicePictureList').innerHTML=selected ? pictureRow(selected) : '<p class="empty-state">Picture controls are not configured for this service yet.</p>';
  $('#servicePictureList').querySelectorAll('[data-picture-service]').forEach(card => {
    const slug=card.dataset.pictureService;
    const preview=card.querySelector('.picture-preview');
    const x=card.querySelector('[data-picture-x]'), y=card.querySelector('[data-picture-y]');
    const updatePreview=()=>{preview.style.backgroundPosition=`${x.value}% ${y.value}%`;card.querySelector('[data-x-output]').textContent=`${x.value}%`;card.querySelector('[data-y-output]').textContent=`${y.value}%`;};
    x.addEventListener('input',updatePreview); y.addEventListener('input',updatePreview);
    let uploadedDraftPath=null;
    const fileInput=card.querySelector('[data-picture-file]');
    card.querySelector('[data-change-picture]').addEventListener('click',()=>fileInput.click());
    fileInput.addEventListener('change',event=>{
      const file=event.target.files?.[0]; if(!file)return;
      if(!allowedServiceImageTypes.has(file.type)){event.target.value='';return setStatus('Use a JPEG, PNG, or WebP image',true);}
      if(file.size>5*1024*1024){event.target.value='';return setStatus('Service pictures must be 5 MB or smaller',true);}
      URL.revokeObjectURL(card.dataset.previewObjectUrl || '');
      const objectUrl=URL.createObjectURL(file); card.dataset.previewObjectUrl=objectUrl; preview.style.backgroundImage=`url('${objectUrl}')`; card.querySelector('[data-picture-selection]').textContent=`Previewing ${file.name}. Adjust the crop, then Save Draft.`; setStatus('Picture preview ready. Save Draft when the crop looks right.');
    });
    card.querySelector('[data-save-picture]').addEventListener('click',()=>run('Saving picture draft',async()=>{
      const file=card.querySelector('[data-picture-file]').files?.[0];
      if(file){const extension={ 'image/jpeg':'jpg','image/png':'png','image/webp':'webp' }[file.type];uploadedDraftPath=`${slug}/${Date.now()}-${crypto.randomUUID()}.${extension}`;requireOk(await supabase.storage.from(SERVICE_IMAGE_BUCKET).upload(uploadedDraftPath,file,{cacheControl:'3600',contentType:file.type,upsert:false}));}
      const changes={draft_position_x:Number(x.value),draft_position_y:Number(y.value),updated_by:currentUserId,updated_at:new Date().toISOString()};
      if(uploadedDraftPath)changes.draft_path=uploadedDraftPath;
      requireOk(await supabase.from('service_profile_media').update(changes).eq('service_slug',slug));
      await loadServicePictures();
    }));
    card.querySelector('[data-publish-picture]').addEventListener('click',()=>{if(confirm(`Publish this replacement picture for ${serviceLabel(slug)}?`))run('Publishing service picture',async()=>{requireOk(await supabase.rpc('publish_service_picture',{target_slug:slug}));await loadServicePictures();});});
    card.querySelector('[data-restore-picture]').addEventListener('click',()=>{if(confirm(`Restore the previous ${serviceLabel(slug)} picture?`))run('Restoring previous service picture',async()=>{requireOk(await supabase.rpc('restore_service_picture',{target_slug:slug}));await loadServicePictures();});});
  });
}

const websiteServiceSelector=$('#websiteServiceSelector');
websiteServiceSelector.innerHTML=pricePageOptions;
websiteServiceSelector.value=selectedWebsiteService;
websiteServiceSelector.addEventListener('change',()=>{selectedWebsiteService=websiteServiceSelector.value;loadServicePrices();loadServicePictures();});
document.querySelectorAll('[data-website-editor-tab]').forEach(button=>button.addEventListener('click',()=>{
  const view=button.dataset.websiteEditorTab;
  document.querySelectorAll('[data-website-editor-tab]').forEach(tab=>{const active=tab===button;tab.classList.toggle('active',active);tab.setAttribute('aria-selected',String(active));});
  document.querySelectorAll('[data-website-editor-view]').forEach(panel=>{panel.hidden=panel.dataset.websiteEditorView!==view;});
  websiteServiceSelector.closest('label').hidden=view==='content';
}));

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
    const [requestsResult, rolesResult, profilesResult, pricesResult] = await Promise.all([supabase.from('service_requests').select('*').order('created_at', { ascending:false }), supabase.from('user_roles').select('*').eq('role','employee'), supabase.from('profiles').select('*'), supabase.from('service_price_items').select('*')]);
    const data = requireOk(requestsResult) || [], employees = requireOk(rolesResult) || [], profiles = requireOk(profilesResult) || [], prices = requireOk(pricesResult) || []; const names = Object.fromEntries(profiles.map(profile => [profile.id, profile.display_name || 'Employee'])); const priceById=Object.fromEntries(prices.map(item=>[item.id,item]));
    target.innerHTML = table(['Customer','Service / details','Preferred date','Notification','Status / employee','Actions'], data.map(row => { const price=priceById[row.service_price_item_id]; const quantity=Number(row.approved_quantity || row.requested_quantity || 1); const suggested=price ? price.price_cents * quantity : 0; const quantityBased=price && price.pricing_type!=='fixed'; return `<tr><td><b>${escapeHtml(row.customer_name || row.summary)}</b><br>${escapeHtml(row.customer_phone || '—')}<br>${escapeHtml(row.customer_email || 'Account customer')}<br>${escapeHtml(row.service_address || '—')}</td><td><b>${escapeHtml(price?.name || row.service_slug.replaceAll('-',' '))}</b><br>${price ? `${escapeHtml(window.OgreenaServiceCatalog.priceLabel(price))}${quantityBased?` · requested ${escapeHtml(row.requested_quantity || '—')} · approved ${escapeHtml(row.approved_quantity || 'pending')}`:''}<br>`:''}${escapeHtml(row.details || row.summary)}</td><td>${escapeHtml(row.preferred_date || '—')}</td><td><span class="tag">${escapeHtml(row.notification_status || 'not required')}</span>${row.notification_status === 'failed' ? '<br><small>Email queued for retry</small>' : ''}</td><td><select data-status-table="service_requests" data-id="${row.id}">${['submitted','reviewing','estimate_ready','scheduled','in_progress','completed','cancelled'].map(status => `<option ${row.status===status?'selected':''}>${status}</option>`).join('')}</select><select data-request-assignment data-id="${row.id}"><option value="">Unassigned</option>${employees.map(employee => `<option value="${employee.user_id}" ${row.assigned_employee_id===employee.user_id?'selected':''}>${escapeHtml(names[employee.user_id])}</option>`).join('')}</select></td><td>${quantityBased?`<button class="small-btn" data-approve-quantity="${row.id}" data-requested="${row.requested_quantity || 1}">Approve Quantity</button> `:''}<button class="small-btn" data-respond-request="${row.id}">Respond</button> <button class="small-btn" data-create-estimate="${row.id}" data-customer="${row.customer_id || ''}" data-suggested="${(suggested/100).toFixed(2)}">Create Estimate</button> <button class="small-btn" data-schedule-request="${row.id}" data-customer="${row.customer_id || ''}" data-employee="${row.assigned_employee_id || ''}">Schedule</button></td></tr>`; }));
  } else if (operationView === 'businesses') {
    const data = requireOk(await supabase.from('business_registration_requests').select('id,business_id,authority_description,status,created_at,businesses!inner(display_name)').order('created_at', { ascending:false })) || [];
    target.innerHTML = table(['Business','Authority statement','Requested','Status','Action'], data.map(row => `<tr><td><b>${escapeHtml(row.businesses?.display_name || 'Business')}</b></td><td>${escapeHtml(row.authority_description)}</td><td>${escapeHtml(new Date(row.created_at).toLocaleDateString())}</td><td>${escapeHtml(row.status)}</td><td>${row.status === 'pending' ? `<button class="small-btn primary" data-review-business="${row.id}" data-decision="approved">Approve</button> <button class="small-btn danger" data-review-business="${row.id}" data-decision="rejected">Reject</button>` : 'Reviewed'}</td></tr>`));
  } else if (operationView === 'employee-access') {
    const [requestsResult, profilesResult] = await Promise.all([supabase.from('employee_access_requests').select('*').order('created_at',{ascending:false}),supabase.from('profiles').select('id,display_name,phone')]);
    const requests=requireOk(requestsResult)||[],profiles=requireOk(profilesResult)||[],profileMap=Object.fromEntries(profiles.map(row=>[row.id,row]));
    target.innerHTML=`<div class="editor-actions"><button class="small-btn primary" data-invite-employee>Invite Existing Employee</button></div>`+table(['Employee','Phone','Status','Action'],requests.map(row=>`<tr><td>${escapeHtml(profileMap[row.user_id]?.display_name||'Account holder')}</td><td>${escapeHtml(row.contact_phone)}</td><td>${escapeHtml(row.status)}</td><td>${row.status==='pending'?`<button class="small-btn primary" data-review-employee="${row.id}" data-decision="approved">Approve</button> <button class="small-btn danger" data-review-employee="${row.id}" data-decision="rejected">Reject</button>`:'Reviewed'}</td></tr>`));
  } else if (operationView === 'applicants') {
    const data=requireOk(await supabase.from('job_applications').select('*').order('created_at',{ascending:false}))||[];
    target.innerHTML=table(['Applicant','Position','Availability / experience','Status','Action'],data.map(row=>`<tr><td><b>${escapeHtml(row.full_name)}</b><br>${escapeHtml(row.phone)}</td><td>${escapeHtml(row.position_interest)}</td><td>${escapeHtml(row.availability)}<br><small>${escapeHtml(row.experience)}</small></td><td>${escapeHtml(row.status)}</td><td>${['submitted','reviewing'].includes(row.status)?`<button class="small-btn" data-review-applicant="${row.id}" data-decision="reviewing">Reviewing</button> <button class="small-btn primary" data-review-applicant="${row.id}" data-decision="hired">Hire</button> <button class="small-btn danger" data-review-applicant="${row.id}" data-decision="rejected">Reject</button>`:'Reviewed'}</td></tr>`));
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
  target.querySelector('[data-invite-employee]')?.addEventListener('click',()=>{const email=prompt('Existing employee email');if(!email)return;const jobRole=prompt('Employee job role','Employee');if(!jobRole)return;run('Creating employee invitation',async()=>{requireOk(await supabase.rpc('create_employee_invite',{invited_email:email,invited_job_role:jobRole}));setStatus('Invitation recorded. Send the Existing Employee Sign Up link to the employee.');});});
  target.querySelectorAll('[data-review-employee]').forEach(button=>button.addEventListener('click',()=>{const decision=button.dataset.decision;const jobRole=decision==='approved'?prompt('Employee job role','Employee'):'Employee';if(decision==='approved'&&!jobRole)return;if(!confirm(`${decision==='approved'?'Approve':'Reject'} this existing-employee access request?`))return;run('Reviewing employee access',async()=>{requireOk(await supabase.rpc('review_employee_access',{request_id:button.dataset.reviewEmployee,decision,approved_job_role:jobRole}));await loadOperations();});}));
  target.querySelectorAll('[data-review-applicant]').forEach(button=>button.addEventListener('click',()=>{const decision=button.dataset.decision;const jobRole=decision==='hired'?prompt('Employee job role','Employee'):'Employee';if(decision==='hired'&&!jobRole)return;if(!confirm(`${decision==='hired'?'Hire':decision==='rejected'?'Reject':'Mark reviewing'} this applicant?`))return;run('Reviewing applicant',async()=>{requireOk(await supabase.rpc('review_job_application',{application_id:button.dataset.reviewApplicant,decision,approved_job_role:jobRole}));await loadOperations();});}));
  target.querySelectorAll('[data-assignment]').forEach(select => select.addEventListener('change', () => run('Saving employee assignment', async () => { requireOk(await supabase.from('appointments').update({ employee_id:select.value || null }).eq('id', select.dataset.id)); })));
  target.querySelectorAll('[data-request-assignment]').forEach(select => select.addEventListener('change', () => run('Saving request assignment', async () => { requireOk(await supabase.from('service_requests').update({ assigned_employee_id:select.value || null }).eq('id', select.dataset.id)); })));
  target.querySelectorAll('[data-approve-quantity]').forEach(button => button.addEventListener('click', () => { const quantity=prompt('Owner-approved quantity',button.dataset.requested); if(quantity===null)return; if(!Number.isFinite(Number(quantity))||Number(quantity)<=0)return setStatus('Enter a valid approved quantity',true); run('Approving service quantity',async()=>{requireOk(await supabase.from('service_requests').update({approved_quantity:Number(quantity)}).eq('id',button.dataset.approveQuantity));await loadOperations();}); }));
  target.querySelectorAll('[data-create-estimate]').forEach(button => button.addEventListener('click', () => { const amount = prompt('Owner-approved estimate amount in dollars',button.dataset.suggested || ''); if (amount === null) return; const description = prompt('Estimate description') || ''; run('Creating estimate', async () => { requireOk(await supabase.from('estimates').insert({ request_id:button.dataset.createEstimate, customer_id:button.dataset.customer || null, amount_cents:Math.round(Number(amount)*100), description, status:'draft' })); await loadOperations(); }); }));
  target.querySelectorAll('[data-schedule-request]').forEach(button => button.addEventListener('click', () => { const startsAt = prompt('Appointment start (example: 2026-11-02 10:00)'); if (!startsAt) return; const parsed = new Date(startsAt); if (Number.isNaN(parsed.valueOf())) { setStatus('Enter a valid appointment date and time', true); return; } run('Scheduling appointment', async () => { requireOk(await supabase.from('appointments').insert({ request_id:button.dataset.scheduleRequest, customer_id:button.dataset.customer || null, employee_id:button.dataset.employee || null, starts_at:parsed.toISOString(), status:'requested' })); requireOk(await supabase.from('service_requests').update({ status:'scheduled' }).eq('id', button.dataset.scheduleRequest)); await loadOperations(); }); }));
  target.querySelectorAll('[data-respond-request]').forEach(button => button.addEventListener('click', () => { const message = prompt('Response to the customer'); if (!message) return; run('Sending customer response', async () => { const result = await supabase.functions.invoke('respond-service-request', { body:{ requestId:button.dataset.respondRequest, message } }); requireOk(result); await loadOperations(); }); }));
  target.querySelectorAll('[data-reply-to]').forEach(button => button.addEventListener('click', () => { const body = prompt('Reply message'); if (!body) return; run('Sending message', async () => { requireOk(await supabase.from('messages').insert({ request_id:button.dataset.request || null, sender_id:currentUserId, recipient_id:button.dataset.replyTo, body })); await loadOperations(); }); }));
  target.querySelectorAll('[data-save-employee]').forEach(button => button.addEventListener('click', () => run('Saving employee', async () => { const jobRole = target.querySelector(`[data-job-role="${button.dataset.saveEmployee}"]`).value.trim(); requireOk(await supabase.from('employee_profiles').upsert({ user_id:button.dataset.saveEmployee, job_role:jobRole, active:true })); })));
  target.querySelectorAll('[data-make-employee]').forEach(button => button.addEventListener('click', () => { const jobRole = prompt('Employee job role'); if (!jobRole) return; if (!confirm('Change this customer account to an employee account?')) return; run('Authorizing employee', async () => { requireOk(await supabase.from('user_roles').update({ role:'employee', updated_at:new Date().toISOString() }).eq('user_id', button.dataset.makeEmployee)); requireOk(await supabase.from('employee_profiles').upsert({ user_id:button.dataset.makeEmployee, job_role:jobRole, active:true })); await loadOperations(); }); }));
}

async function loadBusiness() { const data = requireOk(await supabase.from('business_settings').select('*').eq('id', true).single()); if (!data) return; for (const key of ['business_name','phone','service_area','contact_email']) $('#businessForm').elements[key].value = data[key] || ''; }
$('#businessForm').addEventListener('submit', event => { event.preventDefault(); run('Saving business settings', async () => { const values = Object.fromEntries(new FormData(event.currentTarget)); requireOk(await supabase.from('business_settings').update({ ...values, updated_at:new Date().toISOString() }).eq('id', true)); }); });

const servicePaymentKinds = new Set(['service_deposit','service_full','invoice']);
const completedPaymentStatuses = new Set(['paid','refunded','partially_refunded']);
function paymentGroup(row) { return row.payment_kind === 'product' ? 'product' : (servicePaymentKinds.has(row.payment_kind) ? 'service' : 'other'); }
function paymentTotal(rows) { return rows.filter(row => completedPaymentStatuses.has(row.status)).reduce((sum,row) => sum + Number(row.amount_cents || 0) - Number(row.refunded_amount_cents || 0), 0); }
function referenceCell(row) {
  const reference = row.stripe_payment_intent_id || row.stripe_checkout_session_id || 'Pending';
  return `<span class="payment-reference" title="${escapeHtml(reference)}">${escapeHtml(reference)}</span>`;
}
function renderPaymentTransactions() {
  const rows = paymentRows.filter(row => paymentGroup(row) === paymentView);
  $('#paymentTransactions').innerHTML = table(['Date','Type','Amount','Refunded','Status','Stripe reference','Action'], rows.map(row => {
    const refundable = paymentSettings?.live_activation_approved && ['paid','partially_refunded'].includes(row.status);
    return `<tr><td>${escapeHtml(new Date(row.created_at).toLocaleString())}</td><td>${escapeHtml(row.payment_kind.replaceAll('_',' '))}</td><td>${money(row.amount_cents)}</td><td>${money(row.refunded_amount_cents)}</td><td><span class="status-pill ${escapeHtml(row.status)}">${escapeHtml(row.status.replaceAll('_',' '))}</span></td><td>${referenceCell(row)}</td><td>${refundable ? `<button class="small-btn" data-refund="${row.id}" data-amount="${Number(row.amount_cents || 0) - Number(row.refunded_amount_cents || 0)}">Refund</button>` : 'Locked pending validation'}</td></tr>`;
  }));
  $('#paymentTransactions').querySelectorAll('[data-refund]').forEach(button => button.addEventListener('click', () => {
    if (!confirm(`Issue a live refund of ${money(button.dataset.amount)}? This moves real money and cannot be undone.`)) return;
    run('Creating authorized refund', async () => { const result = await supabase.functions.invoke('create-refund', { body:{ transactionId:button.dataset.refund } }); requireOk(result); await loadPayments(); });
  }));
}
document.querySelectorAll('[data-payment-view]').forEach(button => button.addEventListener('click', () => {
  paymentView = button.dataset.paymentView;
  document.querySelectorAll('[data-payment-view]').forEach(item => { item.classList.toggle('active', item === button); item.setAttribute('aria-selected', String(item === button)); });
  renderPaymentTransactions();
}));

async function loadPayments() {
  const [settingsResult, transactionResult, statusResult, payoutStatusResult, replacementConsentResult, replacementCandidateResult] = await Promise.all([
    supabase.from('payment_settings').select('provider,payments_enabled,product_payments_enabled,service_payments_enabled,live_activation_approved,stripe_account_id').single(),
    supabase.from('payment_transactions').select('id,payment_kind,amount_cents,refunded_amount_cents,status,currency,stripe_checkout_session_id,stripe_payment_intent_id,order_id,service_request_id,estimate_id,livemode,created_at').order('created_at', { ascending:false }).limit(200),
    supabase.functions.invoke('payment-status'),
    supabase.functions.invoke('create-connect-account-session', { body:{ statusOnly:true } }),
    supabase.from('ogreena_replacement_connect_consents').select('consented_at,revoked_at').eq('id', true).maybeSingle(),
    supabase.from('ogreena_replacement_connect_candidates').select('status').eq('id', true).maybeSingle()
  ]);
  if (settingsResult.error) throw settingsResult.error;
  if (transactionResult.error) throw transactionResult.error;
  paymentSettings = settingsResult.data;
  paymentRows = transactionResult.data || [];
  const productRows = paymentRows.filter(row => paymentGroup(row) === 'product');
  const serviceRows = paymentRows.filter(row => paymentGroup(row) === 'service');
  const refunded = paymentRows.reduce((sum,row) => sum + Number(row.refunded_amount_cents || 0), 0);
  $('#productSales').textContent = money(paymentTotal(productRows));
  $('#serviceSales').textContent = money(paymentTotal(serviceRows));
  $('#refundedTotal').textContent = money(refunded);
  $('#productSalesMeta').textContent = `${productRows.length} transaction${productRows.length === 1 ? '' : 's'} recorded; refunds deducted.`;
  $('#serviceSalesMeta').textContent = `${serviceRows.length} transaction${serviceRows.length === 1 ? '' : 's'} recorded; refunds deducted.`;
  const merchantMatches = paymentSettings?.stripe_account_id === OGREENA_LIVE_MERCHANT;
  const stripePayoutMatches = payoutStatusResult.data?.accountId === OGREENA_LIVE_MERCHANT && payoutStatusResult.data?.livemode === true;
  const payoutStatus = stripePayoutMatches ? payoutStatusResult.data?.payoutStatus : null;
  $('#paymentState').textContent = merchantMatches
    ? 'Ogreena LLC’s existing live Stripe merchant is connected. Bank and identity details remain secured by Stripe.'
    : 'The live Stripe merchant mapping does not match Ogreena LLC. Checkout remains disabled.';
  $('#dashboardPayoutDestination').textContent = payoutStatus?.connected && payoutStatus.destination
    ? [payoutStatus.destination.label, payoutStatus.destination.last4 ? `•••• ${payoutStatus.destination.last4}` : ''].filter(Boolean).join(' ')
    : (payoutStatusResult.error ? 'Check in Stripe' : 'Not connected');
  $('#dashboardPayoutRequirements').textContent = payoutStatus?.pastDue
    ? 'Past due'
    : (payoutStatus?.informationRequired ? 'Information required' : (payoutStatus ? 'Current' : 'Check in Stripe'));
  const allPublicGatesOpen = Boolean(paymentSettings?.payments_enabled && paymentSettings?.product_payments_enabled && paymentSettings?.service_payments_enabled && paymentSettings?.live_activation_approved);
  $('#paymentDetails').innerHTML = `<div><dt>Product checkout</dt><dd>${paymentSettings?.product_payments_enabled ? 'Configured' : 'Disabled'}</dd></div><div><dt>Service checkout</dt><dd>${paymentSettings?.service_payments_enabled ? 'Configured' : 'Disabled'}</dd></div><div><dt>Signed payment backend</dt><dd>${statusResult.data?.configured ? 'Connected' : 'Check required'}</dd></div><div><dt>Public charging</dt><dd>${allPublicGatesOpen ? 'Enabled' : 'Disabled'}</dd></div>`;
  const replacementConsent = replacementConsentResult.data;
  const replacementCandidate = replacementCandidateResult.data;
  const consented = Boolean(replacementConsent?.consented_at && !replacementConsent?.revoked_at);
  const consentCard = document.querySelector('.replacement-consent-card');
  consentCard.dataset.consented = String(consented);
  $('#startReplacementOnboarding').hidden = !consented;
  $('#startReplacementOnboarding').textContent = replacementCandidate ? 'Continue Embedded Onboarding' : 'Create Account & Start Embedded Onboarding';
  $('#replacementConsentStatus').textContent = replacementCandidate
    ? `Owner consent recorded. Replacement candidate status: ${replacementCandidate.status.replaceAll('_',' ')}.`
    : (consented ? 'Owner consent recorded. No replacement Stripe account has been created.' : 'Owner consent has not been recorded. No replacement Stripe account can be created.');
  renderPaymentTransactions();
}
$('#recordReplacementConsent')?.addEventListener('click',()=>run('Recording replacement-account consent',async()=>{
  if (!$('#replacementConsent').checked) throw new Error('Check the consent box before continuing.');
  const { data:{ user }, error:userError } = await supabase.auth.getUser();
  if (userError || !user) throw new Error('Authenticated owner access is required.');
  requireOk(await supabase.from('ogreena_replacement_connect_consents').insert({
    id:true,
    owner_id:user.id,
    existing_merchant_account_id:OGREENA_LIVE_MERCHANT,
    terms_version:'ogreena-replacement-live-v1',
  }));
  await loadPayments();
}));
async function openReplacementOnboarding(){
  const button = $('#startReplacementOnboarding');
  button.disabled = true;
  $('#replacementOnboardingPanel').hidden = false;
  $('#replacementOnboardingStatus').textContent = 'Opening Stripe’s secure live onboarding form…';
  try {
    const { data, error } = await supabase.functions.invoke('create-ogreena-replacement-onboarding', { body:{} });
    if (error) throw new Error(await readFunctionError(error, data, 'The secure onboarding request was rejected.'));
    if (data?.livemode !== true || data?.mode !== 'onboarding') throw new Error('The onboarding session returned an unsafe Stripe environment.');
    const { loadConnectAndInitialize } = await import('https://cdn.jsdelivr.net/npm/@stripe/connect-js@3.3.1/+esm');
    let initialSecret = data.clientSecret;
    replacementConnectInstance = loadConnectAndInitialize({
      publishableKey:data.publishableKey,
      fetchClientSecret:async()=>{
        if (initialSecret) { const secret = initialSecret; initialSecret = undefined; return secret; }
        const refreshed = await supabase.functions.invoke('create-ogreena-replacement-onboarding', { body:{} });
        if (refreshed.error || refreshed.data?.livemode !== true || refreshed.data?.mode !== 'onboarding') {
          throw new Error(await readFunctionError(refreshed.error, refreshed.data, 'Unable to refresh the secure Stripe onboarding session.'));
        }
        return refreshed.data.clientSecret;
      },
      appearance:{ overlays:'dialog', variables:{ colorPrimary:'#0f6943', colorBackground:'#fffdf6', colorText:'#163e2d', borderRadius:'12px' } },
    });
    const banner = replacementConnectInstance.create('notification-banner');
    const onboarding = replacementConnectInstance.create('account-onboarding');
    $('#replacementStripeNotification').replaceChildren(banner);
    $('#replacementStripeOnboarding').replaceChildren(onboarding);
    $('#replacementOnboardingStatus').textContent = 'Stripe-secured business verification and payout setup';
    await loadPayments();
  } catch (error) {
    $('#replacementOnboardingStatus').textContent = error.message || 'The secure Stripe onboarding form could not be opened.';
  } finally {
    button.disabled = false;
  }
}
async function readFunctionError(error, data, fallback){
  if (data?.error) return data.error;
  const response = error?.context;
  if (response?.clone) {
    try {
      const payload = await response.clone().json();
      if (payload?.error) return payload.error;
    } catch {}
  }
  return fallback || error?.message || 'The request could not be completed.';
}
$('#startReplacementOnboarding')?.addEventListener('click',()=>{
  const dialog = $('#replacementReauthDialog');
  $('#replacementReauthPassword').value = '';
  $('#replacementReauthStatus').textContent = '';
  dialog.showModal();
  $('#replacementReauthPassword').focus();
});
$('#cancelReplacementReauth')?.addEventListener('click',()=>$('#replacementReauthDialog').close());
$('#replacementReauthForm')?.addEventListener('submit',async event=>{
  event.preventDefault();
  const password = $('#replacementReauthPassword').value;
  const status = $('#replacementReauthStatus');
  const submit = event.currentTarget.querySelector('[type="submit"]');
  submit.disabled = true;
  status.textContent = 'Verifying your Ogreena account…';
  try {
    const { data:{ user }, error:userError } = await supabase.auth.getUser();
    if (userError || !user?.email) throw new Error('Sign in to your authorized owner account again.');
    const { data, error } = await supabase.auth.signInWithPassword({ email:user.email, password });
    if (error || data.user?.id !== user.id) throw new Error('The password did not verify the authorized owner account.');
    $('#replacementReauthPassword').value = '';
    $('#replacementReauthDialog').close();
    await openReplacementOnboarding();
  } catch (error) {
    status.textContent = error.message || 'Owner reauthentication failed.';
  } finally {
    $('#replacementReauthPassword').value = '';
    submit.disabled = false;
  }
});
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
  await Promise.all([loadBusiness(), loadProducts(), loadServices(), loadServicePrices(), loadServicePictures(), loadContent(), loadOperations(), loadPayments()]);
  setStatus('All owner controls loaded');
}

initialize().catch(error => setStatus(error.message || 'Dashboard failed to load', true));
