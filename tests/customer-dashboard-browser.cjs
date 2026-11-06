const { webkit } = require('playwright');

const base = process.env.SITE_URL || 'http://127.0.0.1:4173';
const user = { id:'00000000-0000-4000-8000-000000000202', email:'customer@example.invalid', email_confirmed_at:new Date().toISOString(), role:'authenticated' };
const session = { access_token:'mock-customer-access', refresh_token:'mock-customer-refresh', expires_in:3600, expires_at:Math.floor(Date.now()/1000)+3600, token_type:'bearer', user };

(async () => {
  const browser = await webkit.launch({ headless:true });
  for (const viewport of [{ name:'desktop', width:1440, height:900 }, { name:'iphone', width:390, height:844 }]) {
    const page = await browser.newPage({ viewport });
    page.on('pageerror', error => console.error(`${viewport.name} page error:`, error.message));
    let submittedRequest = null;
    const savedProfile = { display_name:'Test Customer', phone:'5105550123', property_street_address:'100 Saved Street', property_unit:'2A', property_city:'Oakland', property_state:'CA', property_zip:'94609', property_type:'apartment' };
    const services = [{ id:'carpet-cleaning', name:'Carpet Cleaning', summary:'', display_order:1, visible:true }];
    const prices = [{ id:'carpet-cleaning-bedroom', category:'carpet-cleaning', service_slug:'carpet-cleaning', name:'Bedroom Cleaning', price_cents:10000, pricing_type:'fixed', unit_label:'', active:true, display_order:1 }];
    await page.addInitScript(value => localStorage.setItem('ogreena-auth-session', JSON.stringify(value)), session);
    await page.route('**/auth/v1/user', route => route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(user) }));
    await page.route('**/rest/v1/**', route => {
      const url = new URL(route.request().url());
      let body = [];
      if (url.pathname.endsWith('/rpc/create_multi_service_request')) {
        submittedRequest = route.request().postDataJSON();
        body = '11111111-2222-4333-8444-555555555555';
      }
      if (url.pathname.endsWith('/profiles')) body = savedProfile;
      if (url.pathname.endsWith('/user_roles')) body = { role:'customer' };
      if (url.pathname.endsWith('/services')) body = services;
      if (url.pathname.endsWith('/service_price_items')) body = prices;
      return route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(body) });
    });
    await page.goto(`${base}/auth/`, { waitUntil:'networkidle' });
    await page.locator('#accountPanel').waitFor({ state:'visible' });
    const headings = await page.locator('#accountPanel .account-grid > .card > h2').allTextContents();
    const expected = ['Profile', 'Ogreena Products', 'Service Requests', 'Service history'];
    if (JSON.stringify(headings) !== JSON.stringify(expected)) throw new Error(`${viewport.name}: customer sections are ${JSON.stringify(headings)}`);
    if (await page.getByText('Business owner account', { exact:false }).count()) throw new Error(`${viewport.name}: business-owner section is still present`);
    if (await page.locator('#requestForm [name="service_address_street"]').inputValue() !== savedProfile.property_street_address) throw new Error(`${viewport.name}: saved address did not prefill the request`);
    await page.getByRole('button', { name:/Carpet Cleaning/ }).click();
    await page.getByLabel(/Bedroom Cleaning/).check();
    await page.locator('#requestForm [name="service_address_street"]').fill('200 One-Time Job Avenue');
    await page.locator('#requestForm [name="details"]').fill('Please clean the selected area.');
    await page.getByRole('button', { name:'Send Request to Ogreena' }).click();
    await page.waitForTimeout(500);
    const requestState = await page.evaluate(() => ({
      valid:document.querySelector('#requestForm').checkValidity(),
      street:document.querySelector('#requestForm [name="service_address_street"]').value,
      invalid:[...document.querySelectorAll('#requestForm :invalid')].map(input => input.name)
    }));
    if (requestState.street !== '100 Saved Street') throw new Error(`${viewport.name}: request did not reset (${JSON.stringify(requestState)}; submitted=${JSON.stringify(submittedRequest)})`);
    if (!submittedRequest) throw new Error(`${viewport.name}: service request was not submitted`);
    if (submittedRequest.request_address_street !== '200 One-Time Job Avenue') throw new Error(`${viewport.name}: alternate job address was not snapshotted`);
    if (submittedRequest.request_customer_phone !== savedProfile.phone || submittedRequest.request_customer_name !== savedProfile.display_name) throw new Error(`${viewport.name}: customer contact snapshot is incomplete`);
    if (!Array.isArray(submittedRequest.selected_items) || submittedRequest.selected_items.length !== 1) throw new Error(`${viewport.name}: selected service snapshot request is missing`);
    if (await page.locator('#contactPropertyForm [name="property_street_address"]').inputValue() !== savedProfile.property_street_address) throw new Error(`${viewport.name}: one-time address overwrote the saved profile`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflow > 1) throw new Error(`${viewport.name}: customer profile overflows by ${overflow}px`);
    console.log(`${viewport.name}: profile prefill, immutable request snapshot, role separation, and responsive width PASS`);
    await page.close();
  }
  await browser.close();
})().catch(error => { console.error(error.stack || error); process.exit(1); });
