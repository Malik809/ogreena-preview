const {chromium,webkit}=require('playwright');
const base=process.env.SITE_URL||'http://127.0.0.1:4173';
const user={id:'00000000-0000-4000-8000-000000000212',email:'contact-test@example.invalid',role:'authenticated'};
const session={access_token:'mock-contact-access',refresh_token:'mock-contact-refresh',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user};

(async()=>{
  const viewports=[
    {name:'desktop',width:1440,height:900,engine:chromium},
    {name:'android-chrome',width:412,height:915,engine:chromium},
    {name:'iphone-safari',width:390,height:844,engine:webkit}
  ];
  for(const viewport of viewports){
    const browser=await viewport.engine.launch({headless:true});
    const page=await browser.newPage({viewport:{width:viewport.width,height:viewport.height}});
    await page.addInitScript(value=>localStorage.setItem('ogreena-auth-session',JSON.stringify(value)),session);
    let emailRequests=[];
    await page.route('**/auth/v1/user',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(user)}));
    await page.route('**/functions/v1/send-customer-email',async route=>{
      emailRequests.push(route.request().postDataJSON());
      await new Promise(resolve=>setTimeout(resolve,80));
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,duplicate:false})});
    });
    await page.route('**/rest/v1/**',route=>{
      const url=new URL(route.request().url());let body=[];
      if(url.pathname.endsWith('/profiles'))body={display_name:'Contact Test',phone:'5105550123',property_street_address:'100 Test Street',property_unit:null,property_city:'Oakland',property_state:'CA',property_zip:'94609',property_type:'house'};
      if(url.pathname.endsWith('/user_roles'))body={role:'customer'};
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
    });
    await page.goto(`${base}/auth/`,{waitUntil:'networkidle'});
    await page.locator('#accountPanel').waitFor({state:'visible'});
    const contact=page.locator('[data-ogreena-contact]');
    if(!await contact.getByRole('heading',{name:'Contact Ogreena'}).isVisible())throw new Error(`${viewport.name}: Contact Ogreena is not visible`);
    if(!await contact.getByText('Need assistance with a service? Contact our office.').isVisible())throw new Error(`${viewport.name}: customer contact introduction is wrong`);
    if(await contact.locator('a[href="tel:+15104729327"]').count()!==1)throw new Error(`${viewport.name}: Call link is wrong`);
    if(await contact.locator('a[href^="mailto:"]').count()!==0)throw new Error(`${viewport.name}: customer Email still opens an external mail application`);
    await contact.locator('[data-email-toggle]').click();
    const emailForm=contact.locator('[data-customer-email-form]');
    if(await emailForm.locator('[name="from"]').inputValue()!==user.email)throw new Error(`${viewport.name}: registered From email is wrong`);
    if(await emailForm.locator('[name="from"]').isEditable())throw new Error(`${viewport.name}: From field is editable`);
    if(await emailForm.locator('[name="to"]').inputValue()!=='office@ogreena.com')throw new Error(`${viewport.name}: recipient is wrong`);
    await emailForm.locator('[name="subject"]').fill('Test inquiry');
    await emailForm.locator('[name="message"]').fill('Controlled browser test. No email leaves this mocked request.');
    await emailForm.getByRole('button',{name:'Send Email'}).dblclick();
    await emailForm.getByText('Your email was sent to Ogreena and saved in Messenger.').waitFor();
    if(emailRequests.length!==1)throw new Error(`${viewport.name}: duplicate submit produced ${emailRequests.length} requests`);
    if('email' in emailRequests[0]||'from' in emailRequests[0])throw new Error(`${viewport.name}: client tried to set sender identity`);
    if(!/^[0-9a-f-]{36}$/i.test(emailRequests[0].submissionId))throw new Error(`${viewport.name}: idempotency ID is missing`);
    const messenger=contact.locator('a[href="../messages/?service=general-inquiry"]');
    if(await messenger.count()!==1)throw new Error(`${viewport.name}: Messenger route is wrong`);
    await contact.scrollIntoViewIfNeeded();
    const layout=await page.evaluate(()=>{
      const action=document.querySelector('[data-ogreena-contact] .contact-option:last-child').getBoundingClientRect();
      const fixed=[...document.querySelectorAll('*')].filter(node=>getComputedStyle(node).position==='fixed'&&node.getBoundingClientRect().height>0).map(node=>node.getBoundingClientRect());
      const covered=fixed.some(rect=>!(action.right<=rect.left||action.left>=rect.right||action.bottom<=rect.top||action.top>=rect.bottom));
      return {overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,covered,bottomClearance:document.documentElement.scrollHeight-(scrollY+action.bottom)};
    });
    if(layout.overflow>1)throw new Error(`${viewport.name}: profile overflows by ${layout.overflow}px`);
    if(layout.covered)throw new Error(`${viewport.name}: fixed navigation covers the Messenger action`);
    if(viewport.width<=720&&layout.bottomClearance<80)throw new Error(`${viewport.name}: only ${layout.bottomClearance}px remains below Messenger`);
    await page.goto(new URL(await messenger.getAttribute('href'),page.url()).href,{waitUntil:'domcontentloaded'});
    if(!new URL(page.url()).pathname.endsWith('/messages/'))throw new Error(`${viewport.name}: existing Messenger did not open`);
    console.log(`${viewport.name}: customer Contact Ogreena and mobile clearance PASS`);
    await browser.close();
  }
})().catch(error=>{console.error(error.stack||error);process.exit(1)});
