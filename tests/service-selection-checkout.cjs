const assert = require('node:assert/strict');
const fs = require('node:fs');

const service = fs.readFileSync('service.js','utf8');
const messenger = fs.readFileSync('messages/messenger.js','utf8');
const owner = fs.readFileSync('owner/owner.js','utf8');
const checkout = fs.readFileSync('supabase/functions/create-checkout-session/index.ts','utf8');
const migration = fs.readFileSync('supabase/migrations/20261028220000_multi_service_invoice_lines.sql','utf8');

assert.match(service,/name="selected"/);
assert.match(service,/data-selection-total/);
assert.match(service,/service_address/);
assert.match(service,/preferred_date/);
assert.match(service,/Continue to Payment/);
assert.match(service,/No charge is created now/);
assert.match(messenger,/submitPendingServiceSelection/);
assert.match(messenger,/service_price_items/);
assert.match(messenger,/Owner review and an approved invoice are required/);
assert.match(owner,/name="invoice_item"/);
assert.match(owner,/estimate_line_items/);
assert.match(migration,/create table if not exists public\.estimate_line_items/);
assert.match(migration,/private\.is_owner\(\)/);
assert.match(checkout,/Invoice line verification failed/);
assert.match(checkout,/approvedInvoiceLines \|\|/);
assert.doesNotMatch(service,/create-checkout-session/);

console.log('Service selection and owner-approved multi-line invoice checks passed.');
