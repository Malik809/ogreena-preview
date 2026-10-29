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
assert.equal(new Set(products.map(product => product.squareUrl)).size, 5, 'Square links must be unique');
assert(products.every(product => /^https:\/\/square\.link\/u\/[A-Za-z0-9]+$/.test(product.squareUrl)), 'each product must have a Square link');
assert.doesNotMatch(productsSource, /PUBLIC_SQUARE_PRODUCT_CHECKOUT_ENABLED/, 'obsolete duplicate payment gate must be removed');
assert.doesNotMatch(productsSource, /functions\.invoke\('create-checkout-session'/, 'product buttons must not invoke Stripe Checkout');
assert.match(productsSource, /productCheckoutAuthorized && isSquarePaymentLink\(product\.squareUrl\)/, 'direct Square links must require the canonical sales authorization');
assert.match(productsSource, /href="\$\{product\.squareUrl\}"/, 'authorized Buy Now must be a direct Square-hosted link');
assert.match(productsSource, /rel="noopener noreferrer external"/, 'external Square links must be isolated');
assert.match(productsSource, /aria-disabled="true"/, 'Buy Now must remain non-navigating while sales authorization is closed');

console.log('Square product link checks passed: 5/5 links mapped; public checkout disabled.');
