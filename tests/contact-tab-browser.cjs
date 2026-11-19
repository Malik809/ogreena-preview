const { chromium,webkit }=require('playwright');
const base=process.env.SITE_URL||'http://127.0.0.1:4173';

(async()=>{
  const viewports=[
    {name:'desktop',width:1440,height:900,engine:chromium},
    {name:'android-chrome',width:412,height:915,engine:chromium},
    {name:'iphone-safari',width:390,height:844,engine:webkit}
  ];
  for(const viewport of viewports){
    const browser=await viewport.engine.launch({headless:true});
    const page=await browser.newPage({viewport:{width:viewport.width,height:viewport.height}});
    await page.route('**/rest/v1/**',route=>route.fulfill({status:200,contentType:'application/json',body:'[]'}));
    await page.route('**/auth/v1/user',route=>route.fulfill({status:401,contentType:'application/json',body:'{}'}));
    await page.goto(`${base}/`,{waitUntil:'networkidle'});
    const profileDetails=await page.locator('.left-col .card').first().innerHTML();
    for(const name of ['about','services','reviews','contact']){
      await page.getByRole('tab',{name:new RegExp(`^${name}$`,'i')}).click();
      if(!await page.locator(`#panel-${name}`).isVisible())throw new Error(`${viewport.name}: ${name} panel did not open`);
      if(new URL(page.url()).hash!==`#${name}`)throw new Error(`${viewport.name}: ${name} hash was not set`);
      const active=await page.locator('.tab-panel.active').count();
      if(active!==1)throw new Error(`${viewport.name}: ${active} tab panels are active`);
    }
    const contact=page.locator('#panel-contact');
    if(!await contact.getByText('Have a question or need service? Contact our office directly.').isVisible())throw new Error(`${viewport.name}: contact introduction missing`);
    if(await contact.locator('a[href="tel:+15104729327"]').count()!==1)throw new Error(`${viewport.name}: phone link is wrong`);
    if(await contact.locator('a[href="mailto:office@ogreena.com"]').count()!==1)throw new Error(`${viewport.name}: email link is wrong`);
    const messenger=contact.locator('a[href="messages/?service=general-inquiry"]');
    if(await messenger.count()!==1)throw new Error(`${viewport.name}: existing Messenger route is missing`);
    if(await page.locator('.left-col .card').first().innerHTML()!==profileDetails)throw new Error(`${viewport.name}: Profile Details changed during tab navigation`);
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
    if(overflow>1)throw new Error(`${viewport.name}: page overflows horizontally by ${overflow}px`);
    await page.goto(`${base}/#contact`,{waitUntil:'networkidle'});
    if(!await page.locator('#panel-contact').isVisible())throw new Error(`${viewport.name}: direct Contact link did not open the panel`);
    if(await page.getByRole('tab',{name:'Contact'}).getAttribute('aria-selected')!=='true')throw new Error(`${viewport.name}: Contact tab state is not exposed to assistive technology`);
    await page.goto(new URL(await messenger.getAttribute('href'),page.url()).href,{waitUntil:'domcontentloaded'});
    if(!new URL(page.url()).pathname.endsWith('/messages/'))throw new Error(`${viewport.name}: Messenger did not open the existing messaging system`);
    console.log(`${viewport.name}: Contact navigation, phone, email, Messenger and responsive layout PASS`);
    await page.close();
    await browser.close();
  }
})().catch(error=>{console.error(error.stack||error);process.exit(1)});
