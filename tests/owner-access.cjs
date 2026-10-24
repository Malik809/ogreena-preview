const { chromium } = require('playwright');

const base = process.env.SITE_URL || 'http://127.0.0.1:4173';

async function mockAccount(page, role) {
  await page.addInitScript(({ role }) => {
    const user = { id: '00000000-0000-4000-8000-000000000010', email: `${role}@example.invalid`, role: 'authenticated' };
    localStorage.setItem('sb-mhhjzifeaofgskimvuom-auth-token', JSON.stringify({ access_token: 'mock-access-token', refresh_token: 'mock-refresh-token', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer', user }));
  }, { role });
  await page.route('**/rest/v1/**', route => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': '*/0' }, body: '[]' }));
  await page.route('**/rest/v1/user_roles**', route => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': '0-0/1' }, body: JSON.stringify(route.request().url().includes('user_id=eq') ? { role } : [{ role }]) }));
  await page.route('**/auth/v1/user', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: '00000000-0000-4000-8000-000000000010', email: `${role}@example.invalid`, role: 'authenticated' }) }));
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  for (const viewport of [{ name: 'desktop', width: 1440, height: 900 }, { name: 'iphone', width: 390, height: 844 }]) {
    const customer = await browser.newPage({ viewport });
    await mockAccount(customer, 'customer');
    await customer.goto(`${base}/owner/`, { waitUntil: 'networkidle' });
    if (await customer.locator('#ownerDashboard').isVisible()) throw new Error(`${viewport.name}: customer reached owner dashboard`);
    if (!/not authorized as an owner/i.test(await customer.locator('#ownerStatus').innerText())) throw new Error(`${viewport.name}: customer denial message missing`);
    await customer.close();

    const owner = await browser.newPage({ viewport });
    await mockAccount(owner, 'owner');
    await owner.goto(`${base}/owner/`, { waitUntil: 'networkidle' });
    if (!await owner.locator('#ownerDashboard').isVisible()) throw new Error(`${viewport.name}: owner dashboard did not open`);
    for (const heading of ['Customers', 'Employees', 'Customer requests', 'Appointments', 'Messages', 'Products', 'Business settings']) {
      if (!await owner.getByRole('heading', { name: heading, exact: true }).isVisible()) throw new Error(`${viewport.name}: ${heading} section missing`);
    }
    for (const section of [{ button:'Website Editor', heading:'Website Editor' }, { button:'Services', heading:'Services' }, { button:'Payment Setup', heading:'Payment Setup' }]) {
      await owner.getByRole('button', { name:section.button, exact:true }).click();
      if (!await owner.getByRole('heading', { name:section.heading, exact:true }).isVisible()) throw new Error(`${viewport.name}: ${section.heading} section missing`);
    }
    for (const heading of ['Bank payouts', 'Reports']) if (!await owner.getByRole('heading', { name:heading, exact:true }).isVisible()) throw new Error(`${viewport.name}: ${heading} section missing`);
    if (!(await owner.textContent('body')).includes('Payments remain disabled')) throw new Error(`${viewport.name}: disabled payment status missing`);
    await owner.close();
    console.log(`${viewport.name}: owner allow/customer deny PASS`);
  }
  await browser.close();
})().catch(error => { console.error(error.stack || error); process.exit(1); });
