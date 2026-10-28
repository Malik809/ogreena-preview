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
assert.match(productsSource, /PUBLIC_SQUARE_PRODUCT_CHECKOUT_ENABLED = false/, 'public checkout must remain disabled');
assert.doesNotMatch(productsSource, /functions\.invoke\('create-checkout-session'/, 'product buttons must not invoke Stripe Checkout');
assert.match(productsSource, /href="\$\{product\.squareUrl\}"/, 'enabled Buy Now actions must be direct Square HTTPS links');
assert.doesNotMatch(productsSource, /location\.href = product\.squareUrl/, 'Square Checkout must use direct anchor navigation');

console.log('Square product link checks passed: 5/5 links mapped; public checkout disabled.');
