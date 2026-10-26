const { chromium } = require('playwright');
const base = process.env.SITE_URL || 'http://127.0.0.1:4173';

(async () => {
  const browser = await chromium.launch({ headless:true });
  for (const viewport of [{name:'desktop',width:1280,height:900},{name:'mobile',width:390,height:844}]) {
    const page = await browser.newPage({ viewport });
    const checks = [
      ['carpet-cleaning',['Landing','$30','Living/Dining Room Combo 15x18','$200']],
      ['house-cleaning',['One Team Member Basic Cleaning (2 hrs)','$200','Two Team Members Basic Cleaning (2 hrs)','$400']],
      ['deep-cleaning',['Two Team Members Deep Cleaning (4 hrs)','$800']],
      ['mattress-cleaning',['Twin Size Bed','$150','King Size Bed','$300']],
      ['upholstery-cleaning',['Single Cushion Dining Room Chair','$25','Sectional Couch (6 seats)','$350']],
      ['tile-grout-cleaning',['Tile and Grout','$5 per sq. ft.']],
      ['floor-polishing',['Floor Polishing','$5 per sq. ft.']],
      ['window-cleaning',['Window Cleaning 4x3','$30 each']]
    ];
    for (const [slug,expected] of checks) {
      await page.goto(`${base}/services/${slug}/`, { waitUntil:'networkidle' });
      await page.getByRole('button', { name:'Pricing', exact:true }).click();
      const pricing = await page.locator('#pricingPanel').innerText();
      for (const text of expected) if (!pricing.includes(text)) throw new Error(`${viewport.name}: ${slug} missing ${text}`);
      if (!pricing.includes('does not create a charge')) throw new Error(`${viewport.name}: ${slug} request-only disclosure missing`);
    }
    await page.goto(`${base}/services/electrical-services/`, { waitUntil:'networkidle' });
    await page.getByRole('button', { name:'Pricing', exact:true }).click();
    if (!(await page.locator('#pricingPanel').innerText()).includes('Request an Estimate')) throw new Error(`${viewport.name}: unpriced service estimate action missing`);
    console.log(`${viewport.name}: all matching service Pricing tabs PASS`);
    await page.close();
  }
  await browser.close();
})().catch(error => { console.error(error.stack || error); process.exit(1); });
