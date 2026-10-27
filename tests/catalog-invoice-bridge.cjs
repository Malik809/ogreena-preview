const assert = require('node:assert/strict');
const fs = require('node:fs');

const owner = fs.readFileSync('owner/owner.js', 'utf8');
const checkout = fs.readFileSync('supabase/functions/create-checkout-session/index.ts', 'utf8');
const migration = fs.readFileSync('supabase/migrations/20261027052000_catalog_backed_service_invoices.sql', 'utf8');

for (const slug of ['electrical-services', 'carpet-cleaning']) {
  assert.match(owner, new RegExp(`\\['${slug}'`), `${slug} must be available in the existing service editor`);
}
assert.match(owner, /price\.service_slug === serviceSlug/, 'invoice choices must be scoped to the conversation service');
assert.match(owner, /\.eq\('active',true\)/, 'only published prices may be selected');
assert.match(owner, /service_price_item_id:price\.id,quantity/, 'owner invoice must persist the catalog item and quantity');
assert.match(owner, /refreshServiceProfileOptions/, 'service profiles must be discovered dynamically');
assert.match(migration, /catalog_price_locked := true/, 'database must lock a catalog snapshot');
assert.match(migration, /new\.amount_cents := calculated_amount::integer/, 'database must calculate the invoice amount');
assert.match(migration, /Service price does not match this conversation/, 'database must reject cross-service prices');
assert.doesNotMatch(migration, /electrical-services|carpet-cleaning/, 'database support must not be hard-coded to known services');
assert.match(checkout, /Invoice price verification failed/, 'Checkout must revalidate snapshot totals');
assert.match(checkout, /service_slug:serviceSlug/, 'Checkout metadata must preserve service identity');
assert.match(checkout, /if \(!settings\.product_payments_enabled\)/, 'product checkout gate must remain enforced');

console.log('Catalog-to-invoice bridge checks passed for Electrical Services, Carpet Cleaning, and future service slugs.');
