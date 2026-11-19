const { chromium } = require('playwright');

const base = process.env.SITE_URL || 'http://127.0.0.1:4173';
const services = [
  'carpet-cleaning', 'commercial-cleaning', 'deep-cleaning',
  'electrical-services', 'facilities-maintenance', 'floor-polishing',
  'hauling', 'house-cleaning', 'janitorial-services', 'landscaping',
  'mattress-cleaning', 'move-in-move-out-cleaning', 'pressure-washing',
  'tile-grout-cleaning', 'upholstery-cleaning', 'water-restoration',
  'window-cleaning'
];

const user = { id:'00000000-0000-4000-8000-000000000017', email:'service-test@example.invalid', role:'authenticated' };
const session = { access_token:'mock-service-access', refresh_token:'mock-service-refresh', expires_in:3600, expires_at:Math.floor(Date.now()/1000)+3600, token_type:'bearer', user };

(async()=>{
  const browser = await chromium.launch({headless:true});
  try {
    for (const viewport of [
      {name:'desktop',width:1440,height:1000},
      {name:'android',width:412,height:915},
      {name:'iphone',width:390,height:844}
    ]) {
      const page = await browser.newPage({viewport});
      for (const slug of services) {
        await page.goto(`${base}/services/${slug}/`, {waitUntil:'load'});
        const quick = page.locator('.service-quick-actions');
        if (await quick.getByRole('link',{name:/Call Ogreena/}).getAttribute('href') !== 'tel:+15104729327') throw new Error(`${viewport.name} ${slug}: Call link is wrong`);
        if (!await quick.getByRole('button',{name:'Message',exact:true}).isVisible()) throw new Error(`${viewport.name} ${slug}: Message is missing`);
        const email = quick.getByRole('link',{name:'Email',exact:true});
        const emailUrl = new URL(await email.getAttribute('href'), page.url());
        if (emailUrl.pathname !== '/auth/' || emailUrl.searchParams.get('contact') !== 'email' || emailUrl.searchParams.get('service') !== slug || emailUrl.searchParams.get('return') !== `/services/${slug}/`) throw new Error(`${viewport.name} ${slug}: Email context is wrong`);
        if (await page.getByRole('heading',{name:'Ready to discuss the work?'}).count() !== 0) throw new Error(`${viewport.name} ${slug}: bottom contact section still exists`);
        if (await page.locator('.action-card, .service-contact-actions').count() !== 0) throw new Error(`${viewport.name} ${slug}: bottom contact markup left empty space`);
        await page.getByRole('button',{name:'Pricing',exact:true}).click();
        if (!await page.locator('#pricingPanel').isVisible()) throw new Error(`${viewport.name} ${slug}: Pricing tab no longer works`);
        if (await page.locator('#pricingPanel [data-price-request], #pricingPanel [data-service-selection]').count() < 1) throw new Error(`${viewport.name} ${slug}: estimate request functionality is missing`);
        await page.getByRole('button',{name:'Overview',exact:true}).click();
        const overflow = await page.evaluate(()=>document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
        if (overflow) throw new Error(`${viewport.name} ${slug}: horizontal overflow`);
      }
      console.log(`${viewport.name}: ${services.length}/17 service contact layouts PASS`);
      await page.close();
    }

    const guest = await browser.newPage({viewport:{width:390,height:844}});
    await guest.goto(`${base}/services/house-cleaning/`,{waitUntil:'load'});
    await guest.locator('.service-quick-actions').getByRole('link',{name:'Email',exact:true}).click();
    if (!guest.url().includes('/auth/?contact=email&service=house-cleaning')) throw new Error('guest Email did not preserve service context');
    if (!await guest.locator('#signInForm').isVisible()) throw new Error('guest Email did not present sign in');
    await guest.close();

    const customer = await browser.newPage({viewport:{width:390,height:844}});
    await customer.addInitScript(({session})=>localStorage.setItem('ogreena-auth-session',JSON.stringify(session)),{session});
    await customer.route('**/auth/v1/user',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(user)}));
    await customer.route('**/rest/v1/**',route=>{
      const url=new URL(route.request().url()); let body=[];
      if(url.pathname.endsWith('/profiles'))body={display_name:'Service Test',phone:'',property_street_address:'',property_unit:null,property_city:'',property_state:'',property_zip:'',property_type:''};
      else if(url.pathname.endsWith('/user_roles'))body={role:'customer'};
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
    });
    await customer.goto(`${base}/auth/?contact=email&service=house-cleaning&return=%2Fservices%2Fhouse-cleaning%2F`,{waitUntil:'load'});
    const form=customer.locator('[data-customer-email-form]');
    await form.waitFor({state:'visible',timeout:10000});
    if(!await form.isVisible())throw new Error('signed-in internal Email form did not open');
    if(await form.locator('[name=from]').inputValue()!==user.email)throw new Error('registered From email was not populated');
    if(await form.locator('[name=subject]').inputValue()!=='House Cleaning inquiry')throw new Error('service subject was not populated');
    if(await customer.locator('[data-service-return]').getAttribute('href')!=='/services/house-cleaning/')throw new Error('service return destination was not preserved');
    console.log('signed-out sign-in handoff and signed-in internal Email context PASS');
    await customer.close();
  } finally {
    await browser.close();
  }
})().catch(error=>{console.error(error.stack||error);process.exit(1);});
