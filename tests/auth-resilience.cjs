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
    if (!/check your email/i.test(successText)) throw new Error(`${viewport.name}: signup success does not direct the user to email`);
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

    console.log(`${viewport.name}: signup success and duplicate recovery PASS`);
  }
  await browser.close();
})().catch(error => { console.error(error.stack || error); process.exit(1); });
