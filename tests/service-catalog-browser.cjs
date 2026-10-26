const { chromium } = require('playwright');
const base = process.env.SITE_URL || 'http://127.0.0.1:4173';

(async () => {
  const browser = await chromium.launch({ headless:true });
  for (const viewport of [{name:'desktop',width:1280,height:900},{name:'mobile',width:390,height:844}]) {
    const page = await browser.newPage({ viewport });
    await page.goto(`${base}/services/carpet-cleaning/`, { waitUntil:'networkidle' });
    await page.getByRole('button', { name:'Pricing', exact:true }).click();
    const pricing = await page.locator('#pricingPanel').innerText();
    if (!pricing.includes('Landing') || !pricing.includes('$30') || !pricing.includes('Living/Dining Room Combo 15x18') || !pricing.includes('$200')) throw new Error(`${viewport.name}: carpet prices missing`);
    if (!pricing.includes('does not create a charge')) throw new Error(`${viewport.name}: request-only disclosure missing`);
    await page.goto(`${base}/services/tile-grout-cleaning/`, { waitUntil:'networkidle' });
    await page.getByRole('button', { name:'Pricing', exact:true }).click();
    const floorPricing = await page.locator('#pricingPanel').innerText();
    if (!floorPricing.includes('Tile and Grout') || !floorPricing.includes('$5 per sq. ft.')) throw new Error(`${viewport.name}: per-square-foot price missing`);
    console.log(`${viewport.name}: public residential pricing PASS`);
    await page.close();
  }
  await browser.close();
})().catch(error => { console.error(error.stack || error); process.exit(1); });
