const { chromium } = require('playwright');

const base = process.env.SITE_URL || 'http://127.0.0.1:4173';

async function fillSignup(page, suffix) {
  await page.goto(`${base}/auth/?mode=signup`, { waitUntil: 'networkidle' });
  await page.locator('#signUpForm input[name="display_name"]').fill('Ogreena Test');
  await page.locator('#signUpForm input[name="email"]').fill(`ogreena-${suffix}@example.invalid`);
  await page.locator('#signUpForm input[name="password"]').fill('SafeMockPassword123!');
  await page.locator('#signUpForm button[type="submit"]').click();
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  for (const viewport of [{ name: 'desktop', width: 1440, height: 900 }, { name: 'iphone', width: 390, height: 844 }]) {
    const success = await browser.newPage({ viewport });
    await success.route('**/auth/v1/signup**', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ user: { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'mock@example.invalid', identities: [] }, session: null })
    }));
    await fillSignup(success, `${viewport.name}-success`);
    await success.locator('#authStatus.success').waitFor();
    const successText = await success.locator('#authStatus').innerText();
    if (!/already exists/i.test(successText)) throw new Error(`${viewport.name}: privacy-preserving duplicate response is not routed to sign in`);
    if (!await success.locator('#signInForm').isVisible()) throw new Error(`${viewport.name}: existing account was not returned to sign in`);
    if (await success.locator('#signUpForm button[type="submit"]').isDisabled()) throw new Error(`${viewport.name}: signup button stayed disabled after success`);
    await success.close();

    const duplicate = await browser.newPage({ viewport });
    await duplicate.route('**/auth/v1/signup**', route => route.fulfill({
      status: 422,
      contentType: 'application/json',
      body: JSON.stringify({ code: 422, error_code: 'user_already_exists', msg: 'User already registered' })
    }));
    await fillSignup(duplicate, `${viewport.name}-duplicate`);
    await duplicate.locator('#authStatus.error').waitFor();
    const duplicateText = await duplicate.locator('#authStatus').innerText();
    if (!/already exists/i.test(duplicateText)) throw new Error(`${viewport.name}: duplicate account message is unclear`);
    if (await duplicate.locator('#signUpForm button[type="submit"]').isDisabled()) throw new Error(`${viewport.name}: signup button stayed disabled after error`);
    await duplicate.close();

    const owner = await browser.newPage({ viewport });
    const ownerUser = { id: '00000000-0000-4000-8000-000000000010', email: 'owner@example.invalid', email_confirmed_at: new Date().toISOString(), role: 'authenticated' };
    await owner.route('**/rest/v1/**', route => route.fulfill({ status: 200, contentType: 'application/json', body:'[]' }));
    await owner.route('**/rest/v1/user_roles**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ role:'owner' }) }));
    await owner.route('**/auth/v1/user', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ownerUser) }));
    await owner.route('**/auth/v1/token?grant_type=password', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token:'mock-owner-access', refresh_token:'mock-owner-refresh', expires_in:3600, expires_at:Math.floor(Date.now()/1000)+3600, token_type:'bearer', user:ownerUser }) }));
    await owner.goto(`${base}/auth/?mode=signin`, { waitUntil:'networkidle' });
    await owner.locator('#signInForm input[name="email"]').fill(ownerUser.email);
    await owner.locator('#signInForm input[name="password"]').fill('SafeMockPassword123!');
    await owner.locator('#signInForm button[type="submit"]').click();
    await owner.locator('#ownerDashboard').waitFor({ state:'visible' });
    if (!/\/owner\/$/.test(new URL(owner.url()).pathname)) throw new Error(`${viewport.name}: verified owner was not redirected to /owner/`);
    if (!await owner.locator('#ownerDashboard').isVisible()) throw new Error(`${viewport.name}: verified owner did not reach the dashboard`);
    await owner.close();

    console.log(`${viewport.name}: duplicate recovery and verified owner redirect PASS`);
  }
  await browser.close();
})().catch(error => { console.error(error.stack || error); process.exit(1); });
