const { chromium } = require('playwright');

const base = process.env.SITE_URL || 'http://127.0.0.1:4173';
const services = [
  'carpet-cleaning', 'commercial-cleaning', 'deep-cleaning',
  'electrical-services', 'facilities-maintenance', 'house-cleaning',
  'janitorial-services', 'move-in-move-out-cleaning', 'pressure-washing',
  'tile-grout-cleaning', 'upholstery-cleaning', 'window-cleaning'
];

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
    if (await page.locator('a[href="tel:+15104729327"]').count() < 1) throw new Error(`${viewport.name} phone link missing`);
    if (await page.locator('form').count() !== 0) throw new Error(`${viewport.name} contains an enabled form`);
    if (!(await page.textContent('body')).includes('Online bookings, payments, uploads, and accounts are disabled')) throw new Error(`${viewport.name} disabled-services notice missing`);
    await page.locator('.menu-toggle').click();
    if (!(await page.locator('.site-menu').getAttribute('class')).includes('open')) throw new Error(`${viewport.name} navigation did not open`);
    if (await page.locator('.site-menu a', { hasText: 'Products' }).count() !== 1) throw new Error(`${viewport.name} products navigation missing`);
    await page.locator('.site-menu-head button').click();
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
  }
  results.push(`service profiles: ${services.length}/12 PASS`);

  let response = await page.goto(`${base}/products/`, { waitUntil: 'networkidle' });
  if (!response?.ok()) throw new Error(`products returned ${response?.status()}`);
  if (!(await page.textContent('body')).includes('ONLINE ORDERING DISABLED')) throw new Error('products disabled notice missing');
  results.push('products landing page: PASS');

  for (const path of [
    '/products/ols/products/t-fresche-gallon/',
    '/products/ols/products/floor-32-oz/',
    '/products/ols/products/trinity-gallon/'
  ]) {
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    if (!page.url().includes('/products/')) throw new Error(`${path} compatibility redirect failed`);
  }
  results.push('legacy product routes: PASS');

  await browser.close();
  console.log(results.join('\n'));
})().catch(error => { console.error(error.stack || error); process.exit(1); });
