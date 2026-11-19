const { chromium }=require('playwright');
const base=process.env.SITE_URL||'http://127.0.0.1:4173';
const user={id:'00000000-0000-4000-8000-000000000909',email:'new-customer@example.invalid',role:'authenticated'};
const session={access_token:'mock-new-customer-access',refresh_token:'mock-new-customer-refresh',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user};

(async()=>{
  const browser=await chromium.launch({headless:true});
  for(const viewport of [{name:'desktop',width:1440,height:900},{name:'iphone',width:390,height:844}]){
    const page=await browser.newPage({viewport});
    await page.addInitScript(({session})=>{localStorage.setItem('ogreena-auth-session',JSON.stringify(session));sessionStorage.setItem('ogreena-show-signup-welcome','true');},{session});
    await page.route('**/auth/v1/user',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(user)}));
    await page.route('**/rest/v1/**',route=>{
      const url=new URL(route.request().url());let body=[];
      if(url.pathname.endsWith('/profiles'))body={display_name:'New Customer',phone:'5105550101',property_street_address:'',property_unit:null,property_city:'',property_state:'',property_zip:'',property_type:''};
      if(url.pathname.endsWith('/user_roles'))body={role:'customer'};
      if(url.pathname.endsWith('/services'))body=[{id:'water-restoration',name:'Water Restoration',summary:'',display_order:15,visible:true}];
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
    });
    await page.goto(`${base}/auth/`,{waitUntil:'networkidle'});
    await page.locator('#signupWelcome').waitFor({state:'visible'});
    if((await page.locator('#welcomeName').textContent())?.trim()!=='New Customer · Customer Profile')throw new Error(`${viewport.name}: customer name not shown`);
    const call=page.getByRole('link',{name:/Call Ogreena/});
    if(await call.getAttribute('href')!=='tel:+15104729327')throw new Error(`${viewport.name}: signup call link is wrong`);
    if(!await page.getByRole('link',{name:/Message Ogreena/}).isVisible())throw new Error(`${viewport.name}: message action missing`);
    await page.getByRole('button',{name:/Request Service/}).click();
    if(!await page.locator('#requestServices').isVisible())throw new Error(`${viewport.name}: request panel unavailable`);
    let overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
    if(overflow>1)throw new Error(`${viewport.name}: signup profile overflows by ${overflow}px`);

    await page.goto(`${base}/services/water-restoration/`,{waitUntil:'networkidle'});
    if((await page.locator('#serviceTitle').textContent())?.trim()!=='Water Restoration')throw new Error(`${viewport.name}: Water Restoration title missing`);
    if(!await page.getByRole('button',{name:'Message Ogreena',exact:true}).first().isVisible())throw new Error(`${viewport.name}: service message button missing`);
    if(!await page.getByRole('link',{name:/Call \(510\) 472-9327/}).first().isVisible())throw new Error(`${viewport.name}: service call button missing`);
    if(await page.getByText(/24\/7 emergency response available/i).count())throw new Error(`${viewport.name}: unsupported emergency claim shown`);
    overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
    if(overflow>1)throw new Error(`${viewport.name}: service page overflows by ${overflow}px`);
    await page.goto(`${base}/`,{waitUntil:'networkidle'});
    const featuredWater=page.locator('#featuredServices a[data-service-slug="water-restoration"]');
    if(await featuredWater.count()!==1)throw new Error(`${viewport.name}: Water Restoration is missing from Featured Services`);
    if(!new URL(await featuredWater.getAttribute('href'),page.url()).pathname.endsWith('/services/water-restoration/'))throw new Error(`${viewport.name}: featured Water Restoration route is wrong`);
    await page.getByRole('button',{name:'Services',exact:true}).click();
    const directoryWater=page.locator('#allServices a[data-service-slug="water-restoration"]');
    if(await directoryWater.count()!==1)throw new Error(`${viewport.name}: Water Restoration is missing from Services directory`);
    await directoryWater.click();
    if(!page.url().includes('/services/water-restoration/'))throw new Error(`${viewport.name}: Services directory did not open Water Restoration`);
    const phoneAuditPaths=['/','/products/','/services/carpet-cleaning/','/services/commercial-cleaning/','/services/deep-cleaning/','/services/electrical-services/','/services/facilities-maintenance/','/services/floor-polishing/','/services/hauling/','/services/house-cleaning/','/services/janitorial-services/','/services/landscaping/','/services/mattress-cleaning/','/services/move-in-move-out-cleaning/','/services/pressure-washing/','/services/tile-grout-cleaning/','/services/upholstery-cleaning/','/services/water-restoration/','/services/window-cleaning/'];
    for(const path of phoneAuditPaths){
      await page.goto(`${base}${path}`,{waitUntil:'networkidle'});
      const phoneLinks=await page.locator('a[href^="tel:"]').evaluateAll(links=>links.map(link=>link.getAttribute('href')));
      if(!phoneLinks.length)throw new Error(`${viewport.name}: ${path} has no Call link`);
      if(phoneLinks.some(href=>href!=='tel:+15104729327'))throw new Error(`${viewport.name}: ${path} has an incorrect Call link: ${phoneLinks.join(',')}`);
    }
    console.log(`${viewport.name}: signup actions, customer name, Water Restoration and responsive layout PASS`);
    await page.close();
  }
  await browser.close();
})().catch(error=>{console.error(error.stack||error);process.exit(1);});
