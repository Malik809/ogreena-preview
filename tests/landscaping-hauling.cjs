const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const orderSource = read('service-order.js');
const context = { window:{} };
vm.runInNewContext(orderSource, context);
const services = context.window.OgreenaServiceOrder.getServices();
assert.equal(services.slice(-2).map(service => service.slug).join(','), 'landscaping,hauling');

const app = read('app.js');
assert.match(app, /featuredSlugs = \['carpet-cleaning','house-cleaning','deep-cleaning','move-in-move-out-cleaning','landscaping','hauling'\]/);

for (const [slug, title] of [['landscaping','Landscaping'],['hauling','Hauling']]) {
  const html = read(`services/${slug}/index.html`);
  assert.match(html, new RegExp(`data-service="${slug}"`));
  assert.match(html, /data-request data-request-label="Request Estimate"/);
  assert.match(html, new RegExp(`<title>[^<]*${title}`));
  assert.match(html, new RegExp(`canonical" href="https://ogreena.com/services/${slug}/`));
}

const service = read('service.js');
assert.match(service, /'landscaping':/);
assert.match(service, /'hauling':/);
assert.match(service, /messages\/\?service=/);

const owner = read('owner/owner.js');
assert.match(owner, /\['landscaping','Landscaping'\]/);
assert.match(owner, /\['hauling','Hauling'\]/);

const migration = read('supabase/migrations/20261105180000_add_landscaping_and_hauling_services.sql');
assert.match(migration, /insert into public\.services/);
assert.match(migration, /insert into public\.service_profile_media/);

console.log('landscaping and hauling: featured cards, profiles, Messenger requests, owner editing, SEO, and media defaults PASS');
