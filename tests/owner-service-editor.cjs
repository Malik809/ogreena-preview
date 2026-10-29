const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const ownerPage = read('owner/index.html');
const owner = read('owner/owner.js');
const publicData = read('public-data.js');
const service = read('service.js');
const customer = read('auth/owner-auth.js');
const migration = read('supabase/migrations/20261026234500_owner_service_picture_editor.sql');

assert.match(ownerPage, /Edit Service Prices/);
assert.match(ownerPage, /Edit Service Pictures/);
assert.match(ownerPage, /websiteServiceSelector/);
assert.match(ownerPage, /data-website-editor-tab="prices"/);
assert.match(ownerPage, /data-website-editor-tab="pictures"/);
assert.match(ownerPage, /owner\.js\?v=32/);
assert.match(owner, /service_profile_media/);
assert.match(owner, /image\/jpeg/);
assert.match(owner, /5\*1024\*1024/);
assert.match(owner, /publish_service_picture/);
assert.match(owner, /restore_service_picture/);
assert.match(owner, /Change Cover Picture/);
assert.match(owner, /Assigned to/);
assert.match(owner, /selectedWebsiteService/);
assert.match(owner, /Move-In \/ Move-Out/);
assert.match(owner, /item\.service_slug === selectedWebsiteService/);
assert.match(owner, /data-delete-price/);
assert.match(owner, /hourly/);
assert.match(owner, /per_square_foot/);
assert.match(publicData, /service-images/);
assert.match(publicData, /backgroundPosition/);
assert.match(service, /price\.service_slug === document\.body\.dataset\.service/);
assert.match(service, /service-catalog\.js\?v=2/);
assert.match(customer, /pricing_type !== 'fixed'/);
assert.match(migration, /file_size_limit=excluded\.file_size_limit/);
assert.match(migration, /allowed_mime_types=excluded\.allowed_mime_types/);
assert.match(migration, /service_profile_media_owner_insert/);
assert.match(migration, /service_images_owner_insert/);
assert.match(migration, /to anon, authenticated using \(true\)/);
assert.doesNotMatch(owner, /service_role|secret key/i);

const servicePages = fs.readdirSync(path.join(root, 'services'))
  .map(name => `services/${name}/index.html`)
  .filter(file => fs.existsSync(path.join(root, file)));
assert.equal(servicePages.length, 14);
for (const file of servicePages) {
  const html = read(file);
  assert.match(html, /service\.js\?v=22/);
  assert.match(html, /public-data\.js\?v=2/);
}

console.log('owner service editor: pricing, independent pictures, owner-only storage, restore, and public sync PASS');
