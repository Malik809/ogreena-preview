const assert = require('node:assert/strict');
const fs = require('node:fs');

const owner = fs.readFileSync('owner/owner.js', 'utf8');
const publicData = fs.readFileSync('public-data.js', 'utf8');
const products = fs.readFileSync('products.js', 'utf8');
const migration = fs.readFileSync('supabase/migrations/20261028200000_owner_square_payment_links.sql', 'utf8');

assert.match(owner, /name="square_payment_link"/);
assert.match(owner, /data-save-square-link/);
assert.match(owner, /data-preview-square-link/);
assert.match(owner, /url\.hostname === 'square\.link'/);
assert.match(owner, /url\.hostname === 'checkout\.square\.site'/);
assert.doesNotMatch(publicData, /square_payment_link/, 'public catalog must not expose historical Square links');
assert.match(publicData, /product_checkout_is_enabled/);
for (const id of ['og-trinity-32oz','og-floor-32oz','og-t-fresche-32oz','og-trinity-gallon','og-floor-gallon']) assert.match(migration, new RegExp(id));
assert.match(products, /Checkout is unavailable until final owner activation/);
assert.doesNotMatch(products, /window\.location\s*=\s*product\.squareUrl/);
assert.doesNotMatch(products, /square\.link|checkout\.square\.site/, 'public buying flow must not route to Square');
console.log('Owner Square payment-link checks passed.');
