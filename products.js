(function () {
  const products = window.OgreenaProductCatalog || [];
  const root = location.hostname.endsWith('.github.io') ? '/ogreena-preview/' : '/';
  const path = location.pathname.replace(/\/+/g, '/');
  const isCatalog = path.endsWith('/products/');
  const isBusinessProfile = path === '/' || path === '/ogreena-preview/';
  let productCheckoutAuthorized = false;

  function isSquarePaymentLink(value) {
    try { const url = new URL(value); return url.protocol === 'https:' && url.hostname === 'square.link' && /^\/u\/[A-Za-z0-9]+\/?$/.test(url.pathname); } catch { return false; }
  }

  function buyAction(product) {
    if (productCheckoutAuthorized && isSquarePaymentLink(product.squareUrl)) return `<a class="small-btn primary" data-buy-product="${product.id}" href="${product.squareUrl}" target="_blank" rel="noopener noreferrer external">Buy Now</a>`;
    return `<button class="small-btn primary" type="button" data-buy-product="${product.id}" aria-disabled="true">Buy Now</button>`;
  }

  function card(product) {
    return `<article class="product-card" data-product-card data-search="${product.name} ${product.size}">
      <img src="${product.image}" alt="${product.name} — ${product.size}" loading="lazy">
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

  function openProduct(product) {
    let dialog = document.querySelector('#productDialog');
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.id = 'productDialog';
      dialog.className = 'product-dialog';
      document.body.append(dialog);
    }
    dialog.innerHTML = `<button class="dialog-close" type="button" aria-label="Close product details">×</button><img src="${product.image}" alt="${product.name} — ${product.size}"><div><span class="product-size">${product.size}</span><h2>${product.name}</h2><strong>$${product.price.toFixed(2)}</strong><p>Original Ogreena cleaning product. Online checkout is not active yet.</p>${buyAction(product)}</div>`;
    dialog.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
    const buyButton = dialog.querySelector('button[data-buy-product]');
    if (buyButton) buyButton.addEventListener('click', showCheckoutBlocked);
    dialog.showModal();
  }

  const section = ensureShowcase();
  if (!section) return;
  const carousel = section.querySelector('[data-product-carousel]');
  section.querySelector('.carousel-arrow.prev').addEventListener('click', () => carousel.scrollBy({ left: -Math.max(260, carousel.clientWidth * .72), behavior: 'smooth' }));
  section.querySelector('.carousel-arrow.next').addEventListener('click', () => carousel.scrollBy({ left: Math.max(260, carousel.clientWidth * .72), behavior: 'smooth' }));
  section.querySelectorAll('[data-view-product]').forEach(button => button.addEventListener('click', () => openProduct(products.find(product => product.id === button.dataset.viewProduct))));
  section.querySelectorAll('[data-buy-product]').forEach(button => button.addEventListener('click', showCheckoutBlocked));
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
