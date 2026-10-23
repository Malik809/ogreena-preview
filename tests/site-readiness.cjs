const { chromium } = require('playwright');

const base = process.env.SITE_URL || 'http://127.0.0.1:4173';
const services = [
  'carpet-cleaning', 'commercial-cleaning', 'deep-cleaning',
  'electrical-services', 'facilities-maintenance', 'house-cleaning',
  'janitorial-services', 'move-in-move-out-cleaning', 'pressure-washing',
  'tile-grout-cleaning', 'upholstery-cleaning', 'window-cleaning'
];
const expectedProducts = [
  ['Trinity All Purpose Cleaner', '32 oz', '$15.00'],
  ['Floor Cleaner', '32 oz', '$15.00'],
  ['T-Fresche Deodorizer', '32 oz', '$15.00'],
  ['Trinity All Purpose Cleaner', 'Gallon', '$30.00'],
  ['Floor Cleaner', 'Gallon', '$30.00']
];

async function assertProducts(page, label) {
  const cards = page.locator('.product-card');
  if (await cards.count() !== 5) throw new Error(`${label} expected 5 products`);
  const text = await page.locator('[data-ogreena-products]').innerText();
  for (const [name, size, price] of expectedProducts) {
    if (!text.includes(name) || !text.includes(size) || !text.includes(price)) {
      throw new Error(`${label} missing ${name} ${size} ${price}`);
    }
  }
  if (/T-Fresche[^\n]*Gallon|T-Fresche Gallon/i.test(text)) throw new Error(`${label} includes incorrect T-Fresche gallon`);
  const ids = await cards.evaluateAll(elements => elements.map(element => element.querySelector('[data-view-product]').dataset.viewProduct));
  const expectedIds = ['og-trinity-32oz', 'og-floor-32oz', 'og-t-fresche-32oz', 'og-trinity-gallon', 'og-floor-gallon'];
  if (ids.join(',') !== expectedIds.join(',')) throw new Error(`${label} product order is incorrect: ${ids.join(',')}`);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const results = [];
  for (const viewport of [{ name: 'desktop', width: 1440, height: 1000 }, { name: 'mobile', width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('pageerror', error => errors.push(error.message));
    const response = await page.goto(`${base}/`, { waitUntil: 'networkidle' });
    if (!response?.ok()) throw new Error(`${viewport.name} homepage returned ${response?.status()}`);
    const body = await page.textContent('body');
    if (body.includes('ONLINE SERVICES LIMITED')) throw new Error(`${viewport.name} still shows announcement banner`);
    if (await page.locator('a[href="tel:+15104729327"]').count() < 1) throw new Error(`${viewport.name} phone link missing`);
    await assertProducts(page, `${viewport.name} homepage`);
    const showcaseHeight = await page.locator('.product-showcase:not(.catalog-page)').evaluate(element => element.getBoundingClientRect().height);
    const heightLimit = viewport.name === 'desktop' ? 390 : 430;
    if (showcaseHeight > heightLimit) throw new Error(`${viewport.name} product preview is too tall: ${showcaseHeight}px`);

    await page.locator('.menu-toggle').click();
    if (!(await page.locator('.site-menu').getAttribute('class')).includes('open')) throw new Error(`${viewport.name} navigation did not open`);
    if (await page.locator('.site-menu a', { hasText: 'Products' }).count() !== 1) throw new Error(`${viewport.name} products navigation missing`);
    await page.locator('.site-menu-head button').click();

    if (await page.locator('.topbar .search').isVisible()) {
      await page.locator('.topbar .search').click();
      if (!(await page.locator('.site-menu').getAttribute('class')).includes('open')) throw new Error(`${viewport.name} top search did not open search panel`);
      await page.locator('.site-menu-head button').click();
    }

    await page.locator('#productSearch').fill('T-Fresche');
    if (await page.locator('.product-card:not([hidden])').count() !== 1) throw new Error(`${viewport.name} product search failed`);
    await page.locator('#productSearch').fill('');
    await page.locator('.product-card').first().getByRole('button', { name: 'View Product' }).click();
    if (!await page.locator('.product-dialog').isVisible()) throw new Error(`${viewport.name} product details did not open`);
    await page.locator('.dialog-close').click();
    await page.locator('.product-card').first().getByRole('button', { name: 'Buy Now' }).click();
    if (!(await page.textContent('body')).includes('Checkout is unavailable')) throw new Error(`${viewport.name} checkout message missing`);

    for (const tab of ['About', 'Services', 'Reviews', 'Contact']) {
      await page.getByRole('button', { name: tab, exact: true }).click();
      if (!await page.locator(`#panel-${tab.toLowerCase()}`).isVisible()) throw new Error(`${viewport.name} ${tab} tab failed`);
    }
    await page.getByRole('button', { name: 'About', exact: true }).click();
    const toggle = page.getByRole('button', { name: 'View All', exact: true });
    await toggle.click();
    if (await page.locator('#serviceToggle').getAttribute('aria-expanded') !== 'true') throw new Error(`${viewport.name} View All failed`);
    if (viewport.name === 'desktop') {
      const before = await page.locator('[data-product-carousel]').evaluate(element => element.scrollLeft);
      await page.getByRole('button', { name: 'Next products' }).click();
      await page.waitForTimeout(500);
      const after = await page.locator('[data-product-carousel]').evaluate(element => element.scrollLeft);
      if (after <= before) throw new Error('desktop product carousel arrow failed');
    }

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    if (overflow) throw new Error(`${viewport.name} has horizontal overflow`);
    await page.screenshot({ path: `/tmp/ogreena-${viewport.name}.png`, fullPage: true });
    if (errors.length) throw new Error(`${viewport.name} console errors: ${errors.join('; ')}`);
    results.push(`${viewport.name}: PASS`);
    await page.close();
  }

  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  for (const slug of services) {
    const response = await page.goto(`${base}/services/${slug}/`, { waitUntil: 'networkidle' });
    if (!response?.ok()) throw new Error(`${slug} returned ${response?.status()}`);
    if (await page.locator('a[href="tel:+15104729327"]').count() < 1) throw new Error(`${slug} phone link missing`);
    const cover = await page.locator('.cover').evaluate(element => getComputedStyle(element).backgroundImage);
    if (!cover || cover === 'none') throw new Error(`${slug} cover image missing`);
    if (await page.locator('[data-ogreena-products], .product-card').count() !== 0) throw new Error(`${slug} still shows products`);
  }
  results.push(`service profiles without products: ${services.length}/12 PASS`);

  await page.setContent('<main><section class="profile-card" data-customer-profile><h1>Future customer profile</h1></section></main>');
  await page.addScriptTag({ url: `${base}/product-catalog.js` });
  await page.addScriptTag({ url: `${base}/products.js` });
  await assertProducts(page, 'future customer profile');
  results.push('future customer profile product component: PASS');

  const response = await page.goto(`${base}/products/`, { waitUntil: 'networkidle' });
  if (!response?.ok()) throw new Error(`products returned ${response?.status()}`);
  await assertProducts(page, 'catalog');
  const catalogImageHeight = await page.locator('.catalog-page .product-card>img').first().evaluate(element => element.getBoundingClientRect().height);
  if (catalogImageHeight < 200) throw new Error(`catalog was incorrectly compacted: ${catalogImageHeight}px images`);
  if (!await page.getByRole('link', { name: 'Back to Ogreena' }).isVisible()) throw new Error('catalog back link missing');
  await page.screenshot({ path: '/tmp/ogreena-products-mobile.png', fullPage: true });
  results.push('products catalog: 5/5 PASS');

  for (const path of ['/products/ols/products/t-fresche-gallon/', '/products/ols/products/floor-32-oz/', '/products/ols/products/trinity-gallon/']) {
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    if (!page.url().includes('/products/')) throw new Error(`${path} compatibility redirect failed`);
  }
  results.push('legacy product routes: PASS');

  await browser.close();
  console.log(results.join('\n'));
})().catch(error => { console.error(error.stack || error); process.exit(1); });
