const { chromium } = require('playwright');
const base = process.env.SITE_URL || 'http://127.0.0.1:4173';

(async () => {
  const browser = await chromium.launch({ headless:true });
  for (const viewport of [{name:'desktop',width:1280,height:900},{name:'iphone',width:390,height:844}]) {
    const page = await browser.newPage({ viewport });
    if (base.includes('127.0.0.1') || base.includes('localhost')) await page.route('**/rest/v1/**', route => route.fulfill({ status:200, contentType:'application/json', body:route.request().url().includes('/rpc/') ? 'false' : '[]' }));
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${base}/`, { waitUntil:'networkidle' });
    const featured = page.locator('#featuredServices .service-card');
    if (await featured.count() !== 6) throw new Error(`${viewport.name}: expected six featured services`);
    const names = await featured.locator('h3').allTextContents();
    const expected = ['Carpet Cleaning','House Cleaning','Deep Cleaning','Move-In / Move-Out','Landscaping','Hauling & Junk Removal'];
    if (names.join('|') !== expected.join('|')) throw new Error(`${viewport.name}: featured order was ${names.join('|')}`);
    const haulingCard = page.locator('#featuredServices .service-card', { hasText:'Hauling & Junk Removal' });
    if (!new URL(await haulingCard.getAttribute('href'), page.url()).pathname.endsWith('/services/hauling/')) throw new Error(`${viewport.name}: hauling card route is incorrect`);
    await haulingCard.evaluate(card => card.setAttribute('href', 'services/move-in-move-out-cleaning/'));
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted:true })));
    if (!new URL(await haulingCard.getAttribute('href'), page.url()).pathname.endsWith('/services/hauling/')) throw new Error(`${viewport.name}: pageshow did not repair stale hauling route`);
    await haulingCard.evaluate(card => card.setAttribute('href', 'services/move-in-move-out-cleaning/'));
    await haulingCard.click();
    await page.waitForLoadState('networkidle');
    if (!page.url().includes('/services/hauling/')) throw new Error(`${viewport.name}: stale hauling click reached ${page.url()}`);
    if ((await page.locator('#serviceTitle').textContent())?.trim() !== 'Hauling & Junk Removal') throw new Error(`${viewport.name}: homepage click loaded the wrong service`);
    if (!(await page.locator('.service-profile .cover').evaluate(node => getComputedStyle(node).backgroundImage)).includes('hauling.jpg')) throw new Error(`${viewport.name}: homepage click loaded the wrong cover`);
    for (const slug of ['landscaping','hauling']) {
      await page.goto(`${base}/services/${slug}/`, { waitUntil:'networkidle' });
      if (slug === 'landscaping') {
        const description = await page.locator('#serviceDesc').textContent();
        if (description?.trim() !== 'Professional landscaping, lawn care, yard maintenance, and property groundskeeping services throughout the Bay Area.') throw new Error(`${viewport.name}: landscaping description is incorrect`);
        const background = await page.locator('.service-profile .cover').evaluate(node => getComputedStyle(node).backgroundImage);
        if (!background.includes('landscaping.jpg')) throw new Error(`${viewport.name}: landscaping cover is incorrect: ${background}`);
      }
      if (slug === 'hauling') {
        const title = await page.locator('#serviceTitle').textContent();
        const description = await page.locator('#serviceDesc').textContent();
        const background = await page.locator('.service-profile .cover').evaluate(node => getComputedStyle(node).backgroundImage);
        if (title?.trim() !== 'Hauling & Junk Removal') throw new Error(`${viewport.name}: hauling title is incorrect`);
        if (description?.trim() !== 'Professional hauling, junk removal, furniture removal, and property cleanout services throughout the Bay Area.') throw new Error(`${viewport.name}: hauling description is incorrect`);
        if (!background.includes('hauling.jpg')) throw new Error(`${viewport.name}: hauling cover is incorrect: ${background}`);
      }
      const request = page.getByRole('button', { name:'Request Estimate', exact:true }).first();
      if (!await request.isVisible()) throw new Error(`${viewport.name}: ${slug} estimate button missing`);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
      if (overflow) throw new Error(`${viewport.name}: ${slug} has horizontal overflow`);
      await request.click();
      if (!page.url().includes(`/messages/?service=${slug}`)) throw new Error(`${viewport.name}: ${slug} did not route to Messenger`);
    }
    if (errors.length) throw new Error(`${viewport.name}: ${errors.join('; ')}`);
    console.log(`${viewport.name}: featured services, profiles, Messenger routing, and responsive layout PASS`);
    await page.close();
  }
  await browser.close();
})().catch(error => { console.error(error.stack || error); process.exit(1); });
