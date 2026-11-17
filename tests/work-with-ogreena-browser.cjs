const {chromium}=require('playwright');
const base=process.env.SITE_URL||'http://127.0.0.1:4173';
(async()=>{
  const browser=await chromium.launch({headless:true});
  for(const viewport of [{name:'desktop',width:1280,height:900},{name:'iphone',width:390,height:844}]){
    const page=await browser.newPage({viewport});
    await page.route('**/rest/v1/**',route=>route.fulfill({status:200,contentType:'application/json',body:'[]'}));
    await page.goto(`${base}/`,{waitUntil:'networkidle'});
    const profile=page.getByRole('heading',{name:'Profile details'}).locator('xpath=ancestor::section[1]');
    if(await profile.getByRole('heading',{name:'Work With Ogreena'}).count()!==1)throw new Error(`${viewport.name}: entry is not inside Profile Details`);
    if(!await profile.getByRole('link',{name:'Offer Your Services'}).isVisible())throw new Error(`${viewport.name}: offer button missing`);
    if(!await profile.getByRole('link',{name:'View Available Jobs'}).isVisible())throw new Error(`${viewport.name}: jobs button missing`);
    if(await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1))throw new Error(`${viewport.name}: horizontal overflow`);
    await profile.getByRole('link',{name:'View Available Jobs'}).click();
    await page.waitForLoadState('networkidle');
    if(!await page.getByRole('heading',{name:/HVAC Installer Needed/}).isVisible())throw new Error(`${viewport.name}: first job missing`);
    await page.getByRole('link',{name:'Apply for This Job'}).click();
    await page.waitForLoadState('networkidle');
    if(!page.url().includes('job=hvac-installer'))throw new Error(`${viewport.name}: job context missing`);
    if(await page.locator('#careerServiceChoices input').count()!==14)throw new Error(`${viewport.name}: expected 14 published categories`);
    if(!await page.locator('#careerServiceChoices [value="electrical-services"]').isChecked())throw new Error(`${viewport.name}: electrical category not selected for HVAC job`);
    if(!await page.locator('[name="specialties"][value="hvac-installation"]').isChecked())throw new Error(`${viewport.name}: HVAC specialty not selected for HVAC job`);
    if(await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1))throw new Error(`${viewport.name}: application overflow`);
    console.log(`${viewport.name}: Work With Ogreena placement, job flow and responsive layout PASS`);
    await page.close();
  }
  await browser.close();
})().catch(error=>{console.error(error.stack||error);process.exit(1);});
