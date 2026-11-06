const { webkit } = require('playwright');

const base = process.env.SITE_URL || 'http://127.0.0.1:4173';
const user = { id:'00000000-0000-4000-8000-000000000202', email:'customer@example.invalid', email_confirmed_at:new Date().toISOString(), role:'authenticated' };
const session = { access_token:'mock-customer-access', refresh_token:'mock-customer-refresh', expires_in:3600, expires_at:Math.floor(Date.now()/1000)+3600, token_type:'bearer', user };

(async () => {
  const browser = await webkit.launch({ headless:true });
  for (const viewport of [{ name:'desktop', width:1440, height:900 }, { name:'iphone', width:390, height:844 }]) {
    const page = await browser.newPage({ viewport });
    await page.addInitScript(value => localStorage.setItem('ogreena-auth-session', JSON.stringify(value)), session);
    await page.route('**/auth/v1/user', route => route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(user) }));
    await page.route('**/rest/v1/**', route => {
      const url = new URL(route.request().url());
      let body = [];
      if (url.pathname.endsWith('/profiles')) body = { display_name:'Test Customer' };
      if (url.pathname.endsWith('/user_roles')) body = { role:'customer' };
      return route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(body) });
    });
    await page.goto(`${base}/auth/`, { waitUntil:'networkidle' });
    await page.locator('#accountPanel').waitFor({ state:'visible' });
    const headings = await page.locator('#accountPanel .account-grid > .card > h2').allTextContents();
    const expected = ['Profile', 'Ogreena Products', 'Service requests', 'Service history'];
    if (JSON.stringify(headings) !== JSON.stringify(expected)) throw new Error(`${viewport.name}: customer sections are ${JSON.stringify(headings)}`);
    if (await page.getByText('Business owner account', { exact:false }).count()) throw new Error(`${viewport.name}: business-owner section is still present`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflow > 1) throw new Error(`${viewport.name}: customer profile overflows by ${overflow}px`);
    console.log(`${viewport.name}: customer section order, role separation, and responsive width PASS`);
    await page.close();
  }
  await browser.close();
})().catch(error => { console.error(error.stack || error); process.exit(1); });
