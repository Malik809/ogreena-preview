const { chromium }=require('playwright');
const base=process.env.SITE_URL||'http://127.0.0.1:4173';
const user={id:'00000000-0000-4000-8000-000000000021',email:'customer@example.invalid',email_confirmed_at:new Date().toISOString(),role:'authenticated'};
const services=[
  {id:'carpet-cleaning',name:'Carpet Cleaning',summary:'',display_order:1,visible:true},
  {id:'house-cleaning',name:'House Cleaning',summary:'',display_order:2,visible:true},
  {id:'landscaping',name:'Landscaping',summary:'',display_order:3,visible:true}
];
const prices=[
  {id:'carpet-cleaning-landing',category:'carpet-cleaning',service_slug:'carpet-cleaning',name:'Landing',price_cents:3000,pricing_type:'fixed',unit_label:'',active:true,display_order:1},
  {id:'housekeeping-one-team-member-basic-cleaning-2-hrs',category:'housekeeping',service_slug:'house-cleaning',name:'One Team Member Basic Cleaning (2 hrs)',price_cents:20000,pricing_type:'fixed',unit_label:'',active:true,display_order:2}
];

async function mockCustomer(page){
  await page.addInitScript(({user})=>localStorage.setItem('ogreena-auth-session',JSON.stringify({access_token:'mock-access',refresh_token:'mock-refresh',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user})),{user});
  await page.route('**/auth/v1/user',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(user)}));
  await page.route('**/rest/v1/rpc/create_multi_service_request',async route=>{
    const body=route.request().postDataJSON();
    if(body.selected_items.length!==2)throw new Error('RPC did not receive both selected services');
    if(!body.property_information||!body.requested_date)throw new Error('RPC missing property information or preferred date');
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify('11111111-2222-4333-8444-555555555555')});
  });
  await page.route('**/rest/v1/**',route=>{
    const url=route.request().url();let body=[];
    if(url.includes('/user_roles'))body={role:'customer'};
    else if(url.includes('/profiles'))body={display_name:'Demo Customer'};
    else if(url.includes('/service_price_items'))body=prices;
    else if(url.includes('/services?'))body=services;
    else if(url.includes('/job_applications')||url.includes('/employee_access_requests'))body=null;
    return route.fulfill({status:200,contentType:'application/json',headers:{'content-range':'0-0/1'},body:JSON.stringify(body)});
  });
}

(async()=>{
  console.log('Starting multi-service browser verification');
  const browser=await chromium.launch({headless:true});
  for(const viewport of [{name:'desktop',width:1280,height:900},{name:'iphone',width:390,height:844}]){
    console.log(`${viewport.name}: opening customer profile`);
    const page=await browser.newPage({viewport});page.setDefaultTimeout(15000);page.on('pageerror',error=>console.error(`${viewport.name} page error:`,error.message));await mockCustomer(page);
    await page.goto(`${base}/auth/`,{waitUntil:'domcontentloaded'});
    await page.getByRole('heading',{name:'Request Ogreena Services'}).waitFor();
    await page.locator('[data-request-category]').first().waitFor();
    await page.getByRole('button',{name:/Carpet Cleaning/}).click();
    await page.getByLabel(/Landing/).check();
    await page.getByRole('button',{name:/Landscaping/}).click();
    await page.getByLabel(/Landscaping estimate request/).check();
    if((await page.locator('#requestSelectionCount').innerText()).trim()!=='2 services selected')throw new Error(`${viewport.name}: multi-category selection failed`);
    await page.getByLabel('Property information').fill('5600 Martin Luther King Jr Way, Oakland, CA');
    await page.getByLabel('Preferred service date').fill('2026-11-20');
    await page.getByRole('button',{name:'Send Request to Ogreena'}).click();
    await page.locator('#requestConfirmation').filter({hasText:'Request sent to Ogreena'}).waitFor();
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth);
    if(overflow)throw new Error(`${viewport.name}: horizontal overflow detected`);
    console.log(`${viewport.name}: category selection, multi-service RPC, confirmation, and responsive layout PASS`);
    await page.close();
  }
  await browser.close();
})().catch(error=>{console.error(error.stack||error);process.exit(1)});
