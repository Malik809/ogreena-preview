const fs = require('node:fs');
const assert = require('node:assert/strict');

const migration = fs.readFileSync('supabase/migrations/20261028170000_product_shipping_categories.sql', 'utf8');
const checkout = fs.readFileSync('supabase/functions/create-checkout-session/index.ts', 'utf8');
const owner = fs.readFileSync('owner/owner.js', 'utf8');
const manager = fs.readFileSync('supabase/functions/manage-product-shipping/index.ts', 'utf8');

for (const product of ['og-trinity-32oz','og-floor-32oz','og-t-fresche-32oz']) {
  assert.match(migration, new RegExp(product), `${product} must have a stored spray-bottle category`);
}
for (const product of ['og-trinity-gallon','og-floor-gallon']) {
  assert.match(migration, new RegExp(product), `${product} must have a stored gallon category`);
}
assert.match(migration, /'spray_bottle', 400, 'gallon', 800/, 'approved rates must be stored in cents');
assert.match(checkout, /shipping\.category_rates_cents\?\.\[shippingCategory\]/, 'Checkout must look up rates server-side');
assert.match(checkout, /fixed_amount:\{ amount:productShipping!\.rate_cents/, 'Stripe must receive the server-selected shipping amount');
assert.doesNotMatch(checkout, /body\.(shippingRate|shipping_rate|shipping_category)/, 'Checkout must not trust a customer-supplied shipping amount or category');
assert.match(owner, /spray_bottle:Math\.round/, 'owner can update the spray-bottle rate');
assert.match(owner, /gallon:Math\.round/, 'owner can update the gallon rate');
assert.match(manager, /owner_approved:false/, 'editing rates must not activate product charging');
assert.match(manager, /us_contiguous_48/, 'lower-48 coverage must be an approved owner-editable option');
assert.match(checkout, /Shipping is currently limited to the 48 contiguous states/, 'Checkout must reject excluded states server-side');
assert.match(checkout, /P\.O\. boxes are not supported/, 'Checkout must reject PO boxes server-side');
assert.match(checkout, /stripe\.customers\.create/, 'validated shipping address must be attached to the Stripe customer');

console.log('Product category shipping checks passed.');
