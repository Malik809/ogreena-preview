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
const serviceScript = read('service.js');

for (const [slug, title] of [['landscaping','Landscaping'],['hauling','Hauling']]) {
  const html = read(`services/${slug}/index.html`);
  assert.match(html, new RegExp(`data-service="${slug}"`));
  assert.match(html, /data-request data-request-label="Request Estimate"/);
  assert.match(html, new RegExp(`<title>[^<]*${title}`));
  assert.match(html, new RegExp(`canonical" href="https://ogreena.com/services/${slug}/`));
}

const landscapingPage = read('services/landscaping/index.html');
assert.match(landscapingPage, /Professional landscaping, lawn care, yard maintenance, and property groundskeeping services throughout the Bay Area\./);
assert.match(serviceScript, /'landscaping'[\s\S]*description: 'Professional landscaping, lawn care, yard maintenance, and property groundskeeping services throughout the Bay Area\.'/);
assert.doesNotMatch(serviceScript, /'landscaping'[\s\S]{0,250}cover: 'facilities-maintenance'/);
assert.ok(fs.existsSync(path.join(root, 'assets/service-covers/landscaping.jpg')), 'landscaping cover image is missing');

assert.match(serviceScript, /'landscaping':/);
assert.match(serviceScript, /'hauling':/);
assert.match(serviceScript, /messages\/\?service=/);

const owner = read('owner/owner.js');
assert.match(owner, /\['landscaping','Landscaping'\]/);
assert.match(owner, /\['hauling','Hauling'\]/);

const migration = read('supabase/migrations/20261105180000_add_landscaping_and_hauling_services.sql');
assert.match(migration, /insert into public\.services/);
assert.match(migration, /insert into public\.service_profile_media/);

console.log('landscaping and hauling: featured cards, profiles, Messenger requests, owner editing, SEO, and media defaults PASS');
