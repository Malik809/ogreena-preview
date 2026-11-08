const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const catalogSource = fs.readFileSync('product-catalog.js', 'utf8');
const productsSource = fs.readFileSync('products.js', 'utf8');
const context = { location: { hostname: 'ogreena.com' }, window: {} };
vm.runInNewContext(catalogSource, context);

const products = context.window.OgreenaProductCatalog;
assert.equal(products.length, 5, 'five published products are required');
assert.equal(new Set(products.map(product => product.id)).size, 5, 'product IDs must be unique');
assert(products.every(product => !('squareUrl' in product)), 'public products must not expose Square links');
assert.doesNotMatch(productsSource, /PUBLIC_SQUARE_PRODUCT_CHECKOUT_ENABLED/, 'obsolete duplicate payment gate must be removed');
assert.match(productsSource, /functions\.invoke\('create-checkout-session'/, 'product buttons must invoke existing Stripe Checkout');
assert.match(productsSource, /productCheckoutAuthorized/, 'Stripe Buy Now must require the canonical sales authorization');
assert.doesNotMatch(productsSource, /squareUrl|square\.link|checkout\.square\.site/, 'public Buy Now must not route to Square');
assert.match(productsSource, /aria-disabled="true"/, 'Buy Now must remain non-navigating while sales authorization is closed');

assert.match(productsSource, /checkoutEligible !== true/, 'ineligible products must not expose Buy Now');
assert.match(productsSource, /not available for online purchase/i, 'ineligible checkout attempts must be blocked');
console.log('Public product checkout checks passed: approved products use gated Stripe Checkout; T-Fresche and Square are not in the buying flow.');
