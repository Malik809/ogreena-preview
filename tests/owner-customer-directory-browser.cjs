const {chromium}=require('playwright');
const base=process.env.SITE_URL||'http://127.0.0.1:4173';
const owner={id:'00000000-0000-4000-8000-000000000010',email:'owner@example.invalid',role:'authenticated'};
const session={access_token:'mock-owner-access',refresh_token:'mock-owner-refresh',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user:owner};
const realRequest={id:'request-real',customer_id:'customer-verified',customer_name:'Verified Customer',customer_email:'verified@example.com',customer_phone:'5105550101',service_slug:'carpet-cleaning',summary:'Bedroom cleaning',details:'Clean bedroom',service_address:'100 Broadway, Oakland, CA',preferred_date:'2026-11-12',status:'submitted',created_at:'2026-11-07T12:00:00Z',isValidationTest:false,items:[{item_name:'Bedroom Cleaning'}]};
const testRequest={...realRequest,id:'request-test',customer_id:'customer-unverified',customer_name:'Validation Customer',customer_email:'unverified@example.com',service_slug:'live-payment-validation',summary:'Validation',isValidationTest:true};
const directory={metrics:{totalRegistrations:2,verifiedAccounts:1,unverifiedRegistrations:1,actualCustomers:1,testRegistrations:0,realCustomerRequests:1,validationTestRequests:1},customers:[{id:'customer-verified',name:'Verified Customer',email:'verified@example.com',registeredAt:'2026-11-01T12:00:00Z',lastSignInAt:'2026-11-07T12:00:00Z',phone:'5105550101',propertyAddress:'100 Broadway, Oakland, CA 94607',propertyType:'apartment',verified:true,isTestAccount:false,accountSource:'Public email signup',actualCustomer:true,activity:{hasLegitimateRequest:true,hasScheduledJob:false,hasCompletedPurchase:false,requestCount:1,appointmentCount:0,completedPurchaseCount:0},requestHistory:[realRequest]},{id:'customer-unverified',name:'Unverified Customer',email:'unverified@example.com',registeredAt:'2026-11-02T12:00:00Z',lastSignInAt:null,phone:'',propertyAddress:'',propertyType:'',verified:false,isTestAccount:false,accountSource:'Public email signup',actualCustomer:false,activity:{requestCount:1,appointmentCount:0,completedPurchaseCount:0},requestHistory:[testRequest]}],requests:[realRequest,testRequest]};

(async()=>{
  const browser=await chromium.launch({headless:true});
  for(const viewport of [{name:'desktop',width:1440,height:900},{name:'iphone',width:390,height:844}]){
    const page=await browser.newPage({viewport});let directoryAuthorized=false;
    await page.addInitScript(value=>localStorage.setItem('ogreena-auth-session',JSON.stringify(value)),session);
    await page.route('**/auth/v1/user',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(owner)}));
    await page.route('**/functions/v1/owner-customer-directory',route=>{directoryAuthorized=route.request().headers().authorization==='Bearer mock-owner-access';return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(directory)});});
    await page.route('**/rest/v1/**',route=>{const url=new URL(route.request().url());let body=[];if(url.pathname.endsWith('/user_roles'))body=url.search.includes('role=eq.employee')?[]:{role:'owner'};else if(url.pathname.endsWith('/business_settings'))body={id:true,business_name:'Ogreena LLC',phone:'5104729321',service_area:'Bay Area',contact_email:'owner@example.invalid'};else if(url.pathname.endsWith('/service_requests'))body=[realRequest,testRequest];else if(url.pathname.endsWith('/service_request_items'))body=[];else if(url.pathname.endsWith('/profiles'))body=[];else if(url.pathname.endsWith('/service_price_items'))body=[];return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});});
    await page.goto(`${base}/owner/`,{waitUntil:'networkidle'});
    if(!directoryAuthorized)throw new Error(`${viewport.name}: customer directory request did not include the owner session`);
    for(const [label,value] of [['Total Registrations','2'],['Verified Accounts','1'],['Unverified Registrations','1'],['Actual Customers','1'],['New Service Requests','1'],['Test Requests','1']]){const card=page.getByRole('button',{name:new RegExp(label,'i')});if(!await card.count()||!((await card.textContent())||'').includes(value))throw new Error(`${viewport.name}: ${label} metric is incorrect`);}
    await page.getByRole('button',{name:/Total Registrations/i}).click();
    const directoryView=viewport.name==='iphone'?page.locator('.customer-directory-cards'):page.locator('.customer-directory-table');
    const verifiedEmail=viewport.name==='iphone'?directoryView.locator('.customer-registration-email',{hasText:'verified@example.com'}):directoryView.locator('td',{hasText:'verified@example.com'});
    const unverifiedEmail=viewport.name==='iphone'?directoryView.locator('.customer-registration-email',{hasText:'unverified@example.com'}):directoryView.locator('td',{hasText:'unverified@example.com'});
    try{await verifiedEmail.first().waitFor({timeout:5000});}catch(error){throw new Error(`${viewport.name}: registration directory did not open; status=${await page.locator('#globalStatus').textContent()}; operations=${await page.locator('#operationList').innerText()}`);}
    if(!await unverifiedEmail.count())throw new Error(`${viewport.name}: Total Registrations did not include the unverified account`);
    if(await page.getByRole('button',{name:/Make Employee/i}).count())throw new Error(`${viewport.name}: customer directory still exposes employee promotion controls`);
    if(viewport.name==='iphone'&&(!await page.locator('.customer-directory-table').isHidden()||await page.locator('.customer-directory-cards').count()!==1))throw new Error('iphone: wide desktop table is still visible');
    if(viewport.name==='desktop'&&(!await page.locator('.customer-directory-cards').isHidden()||!await page.locator('.customer-directory-table').isVisible()))throw new Error('desktop: table layout was not preserved');
    await page.getByPlaceholder('Name, email, phone, or address').fill('nobody');
    if(!await page.getByText('No records yet.').count())throw new Error(`${viewport.name}: customer search did not filter records`);
    await page.getByRole('button',{name:'Overview'}).click();
    await page.getByRole('button',{name:/Test Requests/i}).click();
    await page.locator('#operationList').getByText('live payment validation',{exact:false}).waitFor();
    if(await page.locator('#operationList').getByText('carpet cleaning',{exact:false}).count())throw new Error(`${viewport.name}: test request filter includes real requests`);
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
    if(overflow>1)throw new Error(`${viewport.name}: owner directory overflows by ${overflow}px`);
    await page.getByRole('button',{name:'Business Operations'}).click();
    await page.getByRole('button',{name:'Employee Access'}).click();
    try{await page.getByRole('button',{name:'Invite Existing Employee'}).waitFor({timeout:5000});}catch(error){throw new Error(`${viewport.name}: employee management is unavailable in Employee Access`);}
    console.log(`${viewport.name}: private customer directory is view-only; employee management, search, request filtering, and responsive layout PASS`);
    await page.close();
  }
  await browser.close();
})().catch(error=>{console.error(error.stack||error);process.exit(1)});
