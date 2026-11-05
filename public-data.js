import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './auth/supabase-config.js';

const restHeaders = { apikey:SUPABASE_PUBLISHABLE_KEY, Authorization:`Bearer ${SUPABASE_PUBLISHABLE_KEY}`, 'Content-Type':'application/json' };
async function publicGet(path) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers:restHeaders });
  if (!response.ok) return { data:null, error:new Error(`Public content request failed (${response.status})`) };
  return { data:await response.json(), error:null };
}
async function publicRpc(name) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, { method:'POST', headers:restHeaders, body:'{}' });
  if (!response.ok) return { data:null, error:new Error(`Public status request failed (${response.status})`) };
  return { data:await response.json(), error:null };
}

function optimizedProductImage(path) {
  const clean = String(path || '').replace(/^\//,'');
  return clean.startsWith('assets/products/') && clean.endsWith('.jpg') ? `/${clean.replace(/\.jpg$/, '-480.webp')}` : `/${clean}`;
}

function applyProducts(products) {
  const carousel = document.querySelector('[data-product-carousel]');
  if (!carousel) return;
  const byId = new Map([...carousel.querySelectorAll('[data-product-card]')].map(card => {
    const button = card.querySelector('[data-view-product]'); return [button?.dataset.viewProduct, card];
  }));
  products.forEach(product => {
    const card = byId.get(product.id); if (!card) return;
    if (!product.visible) { card.remove(); return; }
    const catalogProduct = (window.OgreenaProductCatalog || []).find(item => item.id === product.id);
    if (catalogProduct) { catalogProduct.name = product.name; catalogProduct.size = product.size; catalogProduct.price = product.price_cents / 100; catalogProduct.image = optimizedProductImage(product.image_path); }
    card.dataset.search = `${product.name} ${product.size}`;
    const image = card.querySelector('img'); if (image) { const source=optimizedProductImage(product.image_path); if (image.dataset.src) image.dataset.src=source; else image.src=source; image.alt = `${product.name} — ${product.size}`; }
    const size = card.querySelector('.product-size'); if (size) size.textContent = product.size;
    const name = card.querySelector('h3'); if (name) name.textContent = product.name;
    const price = card.querySelector('strong'); if (price) price.textContent = `$${(product.price_cents / 100).toFixed(2)}`;
    carousel.append(card);
  });
}

function applyServices(services) {
  services.forEach(service => {
    document.querySelectorAll(`a[href*="/services/${CSS.escape(service.id)}/"]`).forEach(card => {
      if (!service.visible) { card.hidden = true; return; }
      const name = card.querySelector('b,h3'); if (name) name.textContent = service.name;
      const summary = card.querySelector('span,p'); if (summary && service.summary) summary.textContent = service.summary;
    });
  });
  const slug = location.pathname.match(/\/services\/([^/]+)/)?.[1];
  const current = services.find(service => service.id === slug);
  if (current) {
    const heading = document.querySelector('h1'); if (heading) heading.textContent = current.name;
    const summary = document.querySelector('.identity p'); if (summary && current.summary) summary.textContent = current.summary;
  }
}

function serviceImageUrl(path) {
  if (!path) return '';
  if (/^https:\/\//.test(path)) return path;
  if (path.startsWith('assets/')) return new URL(path, location.origin + (location.hostname.endsWith('.github.io') ? '/ogreena-preview/' : '/')).href;
  return `${SUPABASE_URL}/storage/v1/object/public/service-images/${path.split('/').map(encodeURIComponent).join('/')}`;
}

function applyServiceMedia(records) {
  const slug = location.pathname.match(/\/services\/([^/]+)/)?.[1];
  const media = records.find(record => record.service_slug === slug);
  const cover = document.querySelector('.service-profile .cover');
  if (!media || !cover) return;
  cover.style.backgroundImage = `url('${serviceImageUrl(media.current_path)}')`;
  cover.style.backgroundPosition = `${media.position_x ?? 50}% ${media.position_y ?? 50}%`;
}

function applyManagedContent(records) {
  records.forEach(record => {
    if (record.visible === false) return;
    const entry = record.content_value || {}; if (!entry.selector || typeof entry.selector !== 'string') return;
    let nodes; try { nodes = document.querySelectorAll(entry.selector); } catch { return; }
    nodes.forEach(node => {
      if (node.hasAttribute('data-static-content')) return;
      if (typeof entry.text === 'string') node.textContent = entry.text;
      if (typeof entry.image === 'string' && node instanceof HTMLImageElement && (/^\/[^/]/.test(entry.image) || entry.image.startsWith('https://ogreena.com/'))) node.src = entry.image;
    });
  });
}

const [products, services, content, serviceMedia, productCheckout] = await Promise.all([
  publicGet('products?select=id,name,size,price_cents,image_path,display_order,visible&order=display_order.asc'),
  publicGet('services?select=id,name,summary,description,display_order,visible&order=display_order.asc'),
  publicGet('website_content?select=content_key,content_value,visible,display_order&published=eq.true&visible=eq.true&order=display_order.asc'),
  publicGet('service_profile_media?select=service_slug,current_path,position_x,position_y'),
  publicRpc('product_checkout_is_enabled'),
]);
if (!products.error) applyProducts(products.data || []);
if (!services.error) applyServices(services.data || []);
if (!content.error) applyManagedContent(content.data || []);
if (!serviceMedia.error) applyServiceMedia(serviceMedia.data || []);
window.OgreenaProducts?.setCheckoutAuthorized(!productCheckout.error && productCheckout.data === true);
