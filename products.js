(function () {
  const products = window.OgreenaProductCatalog || [];
  const root = location.hostname.endsWith('.github.io') ? '/ogreena-preview/' : '/';
  const path = location.pathname.replace(/\/+/g, '/');
  const isCatalog = path.endsWith('/products/');
  const isBusinessProfile = path === '/' || path === '/ogreena-preview/';
  let productCheckoutAuthorized = false;

  function buyAction(product) {
    return `<button class="small-btn primary" type="button" data-buy-product="${product.id}"${productCheckoutAuthorized ? '' : ' aria-disabled="true"'}>Buy Now</button>`;
  }

  function card(product, index) {
    const imageSource = index < 2 ? `src="${product.image}" fetchpriority="${index === 0 ? 'high' : 'auto'}"` : `data-src="${product.image}"`;
    return `<article class="product-card" data-product-card data-search="${product.name} ${product.size}">
      <img ${imageSource} alt="${product.name} — ${product.size}" loading="${index < 2 ? 'eager' : 'lazy'}" width="480" height="631">
      <div class="product-card-body"><span class="product-size">${product.size}</span><h3>${product.name}</h3><strong>$${product.price.toFixed(2)}</strong>
      <div class="product-actions"><button class="small-btn" type="button" data-view-product="${product.id}">View Product</button>${buyAction(product)}</div></div>
    </article>`;
  }

  function shell() {
    return `<div class="product-heading"><div><span class="eyebrow">OGREENA PRODUCTS</span><h2>Plant-derived cleaning essentials</h2><p>Five original Ogreena products for everyday cleaning and fresh spaces.</p></div><a class="small-btn" href="${root}products/">View all products</a></div>
      <div class="product-search-wrap"><label for="productSearch">Search products</label><input id="productSearch" type="search" placeholder="Search by product or size…" autocomplete="off"></div>
      <div class="product-carousel-wrap"><button class="carousel-arrow prev" type="button" aria-label="Previous products">‹</button><div class="product-carousel" data-product-carousel>${products.map(card).join('')}</div><button class="carousel-arrow next" type="button" aria-label="Next products">›</button></div>
      <p class="product-empty" hidden>No products match your search.</p>`;
  }

  function ensureShowcase() {
    let section = document.querySelector('[data-ogreena-products]');
    if (!section && !isCatalog) {
      const profile = isBusinessProfile
        ? document.querySelector('.profile-card')
        : document.querySelector('[data-customer-profile]');
      if (!profile) return null;
      section = document.createElement('section');
      section.className = 'card product-showcase';
      section.dataset.ogreenaProducts = '';
      profile.insertAdjacentElement('afterend', section);
    }
    if (section) section.innerHTML = shell();
    return section;
  }

  function showMessage(message) {
    let toast = document.querySelector('#toast');
    if (!toast) { toast = document.createElement('div'); toast.id = 'toast'; document.body.append(toast); }
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(showMessage.timer);
    showMessage.timer = setTimeout(() => toast.classList.remove('show'), 4200);
  }

  function showCheckoutBlocked() {
    showMessage('Checkout is unavailable until final owner activation.');
  }

  function shippingAddressDialog(productId) {
    let dialog = document.querySelector('#productShippingDialog');
    if (!dialog) { dialog = document.createElement('dialog'); dialog.id = 'productShippingDialog'; dialog.className = 'product-dialog shipping-dialog'; document.body.append(dialog); }
    dialog.innerHTML = `<button class="dialog-close" type="button" aria-label="Close shipping address">×</button><form class="shipping-address-form"><div><span class="product-size">SHIPPING CHECK</span><h2>Where should we ship your order?</h2><p>Initial shipping is available to physical street addresses in the 48 contiguous states. P.O. boxes, Alaska, Hawaii, and U.S. territories are excluded.</p></div><label>Full name<input name="name" autocomplete="shipping name" required></label><label>Street address<input name="line1" autocomplete="shipping address-line1" required></label><label>Apartment or suite<input name="line2" autocomplete="shipping address-line2"></label><label>City<input name="city" autocomplete="shipping address-level2" required></label><label>State abbreviation<input name="state" autocomplete="shipping address-level1" minlength="2" maxlength="2" pattern="[A-Za-z]{2}" placeholder="CA" required></label><label>ZIP code<input name="postal_code" autocomplete="shipping postal-code" inputmode="numeric" pattern="[0-9]{5}(-[0-9]{4})?" required></label><button class="small-btn primary" type="submit">Continue to Stripe</button></form>`;
    dialog.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
    dialog.querySelector('form').addEventListener('submit', event => { event.preventDefault(); const values=Object.fromEntries(new FormData(event.currentTarget)); dialog.close(); continueCheckout(productId,{...values,country:'US'}); });
    dialog.showModal();
  }

  async function continueCheckout(productId, shippingAddress) {
    if (!productCheckoutAuthorized) { showCheckoutBlocked(); return; }
    try {
      if (!window.supabase) throw new Error('Secure checkout is still loading. Please try again.');
      const client = window.supabase.createClient('https://mhhjzifeaofgskimvuom.supabase.co','sb_publishable_13onHaeoGy3uEVnezcGZCQ_RtSzNOlM',{auth:{persistSession:true,autoRefreshToken:true,storage:window.localStorage,storageKey:'ogreena-auth-session'}});
      const {data:{session}}=await client.auth.getSession();
      if(!session){sessionStorage.setItem('ogreena-pending-product',productId);sessionStorage.setItem('ogreena-pending-shipping',JSON.stringify(shippingAddress));location.href=`${root}auth/?mode=signin&checkout=product`;return;}
      const {data,error}=await client.functions.invoke('create-checkout-session',{body:{kind:'product',productId,shippingAddress,idempotencyKey:crypto.randomUUID()}});
      if(error||!data?.url)throw new Error(data?.error||'Checkout is unavailable');
      location.href=data.url;
    } catch (error) { showMessage(error.message || 'Checkout is unavailable until final owner approval.'); }
  }

  function startCheckout(productId) {
    if (!productCheckoutAuthorized) { showCheckoutBlocked(); return; }
    shippingAddressDialog(productId);
  }

  function openProduct(product) {
    let dialog = document.querySelector('#productDialog');
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.id = 'productDialog';
      dialog.className = 'product-dialog';
      document.body.append(dialog);
    }
    dialog.innerHTML = `<button class="dialog-close" type="button" aria-label="Close product details">×</button><img src="${product.image}" alt="${product.name} — ${product.size}"><div><span class="product-size">${product.size}</span><h2>${product.name}</h2><strong>$${product.price.toFixed(2)}</strong><p>Original Ogreena cleaning product. Secure card checkout is provided by Stripe after owner activation.</p>${buyAction(product)}</div>`;
    dialog.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
    dialog.querySelector('[data-buy-product]').addEventListener('click', () => startCheckout(product.id));
    dialog.showModal();
  }

  const section = ensureShowcase();
  if (!section) return;
  const carousel = section.querySelector('[data-product-carousel]');
  const deferredImages = [...carousel.querySelectorAll('img[data-src]')];
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => entries.forEach(entry => { if (!entry.isIntersecting) return; const image=entry.target; image.src=image.dataset.src; image.removeAttribute('data-src'); observer.unobserve(image); }), { root:carousel, rootMargin:'160px' });
    deferredImages.forEach(image => observer.observe(image));
  } else deferredImages.forEach(image => { image.src=image.dataset.src; image.removeAttribute('data-src'); });
  section.querySelector('.carousel-arrow.prev').addEventListener('click', () => carousel.scrollBy({ left: -Math.max(260, carousel.clientWidth * .72), behavior: 'smooth' }));
  section.querySelector('.carousel-arrow.next').addEventListener('click', () => carousel.scrollBy({ left: Math.max(260, carousel.clientWidth * .72), behavior: 'smooth' }));
  section.querySelectorAll('[data-view-product]').forEach(button => button.addEventListener('click', () => openProduct(products.find(product => product.id === button.dataset.viewProduct))));
  section.addEventListener('click', event => {
    const button = event.target.closest('[data-buy-product]');
    if (button) startCheckout(button.dataset.buyProduct);
  });
  const search = section.querySelector('#productSearch');
  search.addEventListener('input', () => {
    const query = search.value.trim().toLowerCase();
    let shown = 0;
    section.querySelectorAll('[data-product-card]').forEach(item => { const visible = !query || item.dataset.search.toLowerCase().includes(query); item.hidden = !visible; if (visible) shown += 1; });
    section.querySelector('.product-empty').hidden = shown > 0;
  });
  window.OgreenaProducts = { products, render: ensureShowcase, setCheckoutAuthorized(value) {
    productCheckoutAuthorized = value === true;
    section.querySelectorAll('[data-buy-product]').forEach(control => {
      const product = products.find(item => item.id === control.dataset.buyProduct);
      if (!product) return;
      const wrapper = document.createElement('div'); wrapper.innerHTML = buyAction(product);
      control.replaceWith(wrapper.firstElementChild);
    });
  } };
}());
