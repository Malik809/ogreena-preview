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
assert.match(auth, /customerAppointments/);
assert.match(auth, /customerMessages/);
assert.match(auth, /customerHistory/);
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
