const { webkit } = require('playwright');

const base = process.env.SITE_URL || 'http://127.0.0.1:4173';
const user = {
  id: '00000000-0000-4000-8000-000000000101',
  email: 'recovery@example.invalid',
  email_confirmed_at: new Date().toISOString(),
  role: 'authenticated'
};
const session = {
  access_token: 'mock-recovery-access',
  refresh_token: 'mock-recovery-refresh',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  token_type: 'bearer',
  user
};

(async () => {
  const browser = await webkit.launch({ headless: true });
  for (const viewport of [{ name:'desktop', width:1440, height:900 }, { name:'iphone', width:390, height:844 }]) {
    const page = await browser.newPage({ viewport });
    await page.addInitScript(value => localStorage.setItem('ogreena-auth-session', JSON.stringify(value)), session);
    await page.route('**/auth/v1/user', async route => {
      if (route.request().method() === 'PUT') {
        await route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify({ ...user, updated_at:new Date().toISOString() }) });
        return;
      }
      await route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(user) });
    });
    await page.route('**/auth/v1/logout**', route => route.fulfill({ status:204, body:'' }));
    await page.goto(`${base}/auth/?mode=password`, { waitUntil:'networkidle' });
    if (!await page.locator('#newPasswordForm').isVisible()) throw new Error(`${viewport.name}: reset form is not visible`);
    if (await page.locator('#accountPanel').isVisible()) throw new Error(`${viewport.name}: customer profile overrode password recovery`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflow > 1) throw new Error(`${viewport.name}: auth page overflows horizontally by ${overflow}px`);
    await page.locator('#newPasswordForm input[name="password"]').fill('UpdatedPassword123!');
    await page.locator('#newPasswordForm input[name="password_confirmation"]').fill('UpdatedPassword123!');
    await page.locator('#newPasswordForm button').click();
    await page.locator('#signInForm').waitFor({ state:'visible' });
    if (!/updated successfully/i.test(await page.locator('#authStatus').innerText())) throw new Error(`${viewport.name}: success confirmation missing`);
    await page.close();
    console.log(`${viewport.name}: recovery form, password update, and responsive layout PASS`);
  }
  await browser.close();
})().catch(error => { console.error(error.stack || error); process.exit(1); });
