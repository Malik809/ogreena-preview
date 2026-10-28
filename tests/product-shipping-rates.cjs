const fs = require('node:fs');
const assert = require('node:assert/strict');

const migration = fs.readFileSync('supabase/migrations/20261028170000_product_shipping_categories.sql', 'utf8');
const checkout = fs.readFileSync('supabase/functions/create-checkout-session/index.ts', 'utf8');
const owner = fs.readFileSync('owner/owner.js', 'utf8');

for (const product of ['og-trinity-32oz','og-floor-32oz','og-t-fresche-32oz']) {
  assert.match(migration, new RegExp(product), `${product} must have a stored spray-bottle category`);
}
for (const product of ['og-trinity-gallon','og-floor-gallon']) {
  assert.match(migration, new RegExp(product), `${product} must have a stored gallon category`);
}
assert.match(migration, /'spray_bottle', 400, 'gallon', 800/, 'approved rates must be stored in cents');
assert.match(checkout, /shipping\.category_rates_cents\?\.\[shippingCategory\]/, 'Checkout must look up rates server-side');
assert.match(checkout, /fixed_amount:\{ amount:productShipping!\.rate_cents/, 'Stripe must receive the server-selected shipping amount');
assert.doesNotMatch(checkout, /body\.(shipping|shippingRate|shipping_category)/, 'Checkout must not trust a customer-supplied shipping amount or category');
assert.match(owner, /spray_bottle:Math\.round/, 'owner can update the spray-bottle rate');
assert.match(owner, /gallon:Math\.round/, 'owner can update the gallon rate');
assert.match(owner, /owner_approved:false/, 'editing rates must not activate product charging');

console.log('Product category shipping checks passed.');
