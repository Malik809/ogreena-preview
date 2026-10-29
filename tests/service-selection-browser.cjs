const { chromium } = require('playwright');

(async()=>{
  const browser=await chromium.launch({headless:true});
  for(const viewport of [{name:'desktop',width:1280,height:900},{name:'iphone',width:390,height:844}]){
    const page=await browser.newPage({viewport:{width:viewport.width,height:viewport.height}});
    await page.goto('http://127.0.0.1:4173/services/carpet-cleaning/',{waitUntil:'networkidle'});
    await page.getByRole('button',{name:'Pricing'}).click();
    const bedroom=page.getByLabel(/Bedroom 10x10 or 12x12/),hallway=page.getByLabel(/Hallway 3x8/);
    await bedroom.check();await hallway.check();
    if((await page.locator('[data-selection-total]').textContent()).trim()!=='$175')throw new Error(`${viewport.name}: expected $175 subtotal`);
    await page.getByLabel('Service address').fill('123 Test Street, Oakland, CA');
    await page.getByLabel('Preferred appointment date').fill('2026-11-15');
    await page.getByRole('button',{name:'Continue to Payment'}).click();
    await page.waitForURL(/\/messages\/\?service=carpet-cleaning/);
    const draft=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('ogreena-service-selection')));
    if(draft.lines.length!==2||draft.serviceSlug!=='carpet-cleaning')throw new Error(`${viewport.name}: selection handoff failed`);
    await page.close();
  }
  await browser.close();console.log('Desktop and iPhone service selection flow passed without checkout or charge.');
})().catch(error=>{console.error(error);process.exit(1);});
