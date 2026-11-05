const { chromium } = require('playwright');
const base = process.env.SITE_URL || 'http://127.0.0.1:4173';

(async () => {
  const browser = await chromium.launch({ headless:true });
  for (const viewport of [{name:'desktop',width:1280,height:900},{name:'iphone',width:390,height:844}]) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${base}/`, { waitUntil:'networkidle' });
    const featured = page.locator('#featuredServices .service-card');
    if (await featured.count() !== 6) throw new Error(`${viewport.name}: expected six featured services`);
    const names = await featured.locator('h3').allTextContents();
    const expected = ['Carpet Cleaning','House Cleaning','Deep Cleaning','Move-In / Move-Out','Landscaping','Hauling'];
    if (names.join('|') !== expected.join('|')) throw new Error(`${viewport.name}: featured order was ${names.join('|')}`);
    for (const slug of ['landscaping','hauling']) {
      await page.goto(`${base}/services/${slug}/`, { waitUntil:'networkidle' });
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
