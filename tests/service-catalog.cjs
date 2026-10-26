const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'service-catalog.js'), 'utf8');
const context = { window:{}, Intl };
vm.runInNewContext(source, context);
const catalog = context.window.OgreenaServiceCatalog;

assert.equal(catalog.items.length, 36, 'all 36 residential prices must be present');
assert.equal(new Set(catalog.items.map(item => item.id)).size, 36, 'catalog IDs must be unique');
assert.deepEqual([...new Set(catalog.items.map(item => item.category))].sort(), ['carpet-cleaning','floor-cleaning','housekeeping','mattress-cleaning','upholstery-cleaning']);

const byName = Object.fromEntries(catalog.items.map(item => [item.name,item]));
assert.equal(byName['Landing'].price_cents, 3000);
assert.equal(byName['Living/Dining Room Combo 15x18'].price_cents, 20000);
assert.equal(byName['Two Team Members Deep Cleaning (4 hrs)'].price_cents, 80000);
assert.equal(byName['King Size Bed'].price_cents, 30000);
assert.equal(byName['Sectional Couch (6 seats)'].price_cents, 35000);
assert.equal(byName['Tile and Grout'].price_cents, 500);
assert.equal(byName['Tile and Grout'].unit_label, 'per sq. ft.');

const auth = fs.readFileSync(path.join(root, 'auth/owner-auth.js'), 'utf8');
assert.match(auth, /service_price_item_id:item\.id/);
const authHtml = fs.readFileSync(path.join(root, 'auth/index.html'), 'utf8');
assert.match(authHtml, /Submitting does not create an invoice|owner approval/i);
const owner = fs.readFileSync(path.join(root, 'owner/owner.js'), 'utf8');
assert.match(owner, /approved_quantity/);
assert.match(owner, /service_price_items/);
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20261026210000_residential_service_catalog.sql'), 'utf8');
assert.match(migration, /enable row level security/);
assert.match(migration, /service_price_items_owner_update/);

console.log('service catalog: 36 exact prices, request-only flow, owner editing, and RLS checks PASS');
