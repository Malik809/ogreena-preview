const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const expect = (source, value, label) => { if (!source.includes(value)) throw new Error(`Missing ${label}`); };

const migration = read('supabase/migrations/20261027010000_service_invoice_tax_classification.sql');
const checkout = read('supabase/functions/create-checkout-session/index.ts');
const owner = read('owner/owner.js');
const messenger = read('messages/messenger.js');

expect(migration, "service_only_nontaxable", 'service-only tax classification');
expect(migration, "materials_or_products", 'materials classification');
expect(migration, "review_required", 'review-required classification');
expect(migration, "Only the verified owner can classify an invoice", 'owner-only database enforcement');
expect(migration, "new.status in ('sent','accepted')", 'payable-state database guard');
expect(checkout, "estimate.tax_treatment !== 'service_only_nontaxable'", 'server-side Checkout tax guard');
expect(checkout, 'This approved invoice has expired', 'expired invoice Checkout guard');
expect(checkout, "tax_treatment:kind==='invoice'?'service_only_nontaxable':''", 'Stripe metadata tax classification');
if (checkout.includes("kind === 'service_deposit'") || checkout.includes("kind === 'service_full'")) throw new Error('Non-invoice service checkout remains enabled');
expect(owner, 'confirm_service_only', 'owner tax confirmation');
expect(owner, 'owner-invoice-form', 'Messenger invoice composer');
expect(messenger, 'data-pay-invoice', 'verified guest/customer payment action');
expect(messenger, "kind:'invoice'", 'invoice-only Checkout action');

console.log('Service invoice tax-classification checks passed.');
