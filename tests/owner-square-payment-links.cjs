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
assert.match(publicData, /visible,square_payment_link/);
assert.match(publicData, /catalogProduct\.squareUrl = product\.square_payment_link/);
for (const id of ['og-trinity-32oz','og-floor-32oz','og-t-fresche-32oz','og-trinity-gallon','og-floor-gallon']) assert.match(migration, new RegExp(id));
assert.match(products, /Checkout is unavailable until final owner activation/);
assert.doesNotMatch(products, /window\.location\s*=\s*product\.squareUrl/);
console.log('Owner Square payment-link checks passed.');
