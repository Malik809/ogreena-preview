const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const navigation = read('navigation.js');
const accountNav = read('owner-auth-nav.js');
const route = read('customer/route.js');
const auth = read('auth/owner-auth.js');
const employee = read('employee/employee.js');
const employeePage = read('employee/index.html');
const customerPage = read('auth/index.html');
const careers = read('careers-account/careers-account.js');
const business = read('business/business.js');
const businessPolicies = read('supabase/migrations/20261025213000_multi_business_foundation.sql');
const home = read('index.html');

assert.match(navigation, /data-auth-profile/);
assert.match(navigation, /My Profile/);
assert.match(navigation, /data-back-ogreena/);
assert.ok(navigation.includes('data-back-ogreena href="${siteRoot}"'));
assert.match(navigation, /service-return-row/);
assert.match(accountNav, /from\('user_roles'\)\.select\('role'\)/);
assert.match(accountNav, /dataset\.authVisible/);
assert.match(accountNav, /role !== 'owner'/);
assert.match(home, /Owner Dashboard/);
assert.doesNotMatch(home, /Employee Dashboard/);
assert.match(route, /auth\.getUser\(\)/);
assert.match(route, /role === 'owner'/);
assert.match(route, /role === 'employee'/);
assert.match(route, /job_applications/);
assert.match(route, /employee_access_requests/);
assert.match(auth, /customerHistory/);
assert.doesNotMatch(auth, /business_memberships/);
assert.doesNotMatch(customerPage, /Business owner account/i);
assert.doesNotMatch(customerPage, /customerAppointments|customerMessages/);
const customerSections = ['Profile', 'Ogreena Products', 'Service requests', 'Service history'];
let lastSection = -1;
for (const section of customerSections) {
  const sectionIndex = customerPage.indexOf(`<h2>${section}</h2>`);
  assert.ok(sectionIndex > lastSection, `${section} must appear in the required customer-dashboard order`);
  lastSection = sectionIndex;
}
assert.match(business, /\.eq\('user_id', user\.id\)/);
assert.match(business, /\.eq\('role', 'owner'\)/);
assert.match(businessPolicies, /alter table public\.business_memberships enable row level security/);
assert.match(businessPolicies, /business_memberships_read_own_business[\s\S]*user_id = \(select auth\.uid\(\)\)/);
assert.match(businessPolicies, /business_connect_accounts_read_verified_owner[\s\S]*is_verified_business_owner/);
assert.match(auth, /job_applications/);
assert.match(auth, /employee_access_requests/);
assert.doesNotMatch(employee, /stripe|banking|payment_transactions|payment_settings/i);
assert.match(employeePage, /Employee Profile/);
assert.doesNotMatch(employeePage, /Employee Dashboard/);
assert.match(customerPage, /Customer Profile/);
assert.match(careers, /Applicant Profile/);

for (const file of fs.readdirSync(path.join(root, 'services')).map(name => `services/${name}/index.html`).filter(file => fs.existsSync(path.join(root, file)))) {
  const html = read(file);
  assert.match(html, /data-service=/, `${file} is not a service profile`);
  assert.match(html, /navigation\.js\?v=17/, `${file} does not load verified navigation`);
}

console.log('profile navigation: role routing, applicant status, service return links, and employee financial isolation PASS');
