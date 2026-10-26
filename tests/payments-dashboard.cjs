const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const ownerHtml = read('owner/index.html');
const ownerJs = read('owner/owner.js');
const productJs = read('products.js');
const accountJs = read('auth/owner-auth.js');
const liveWebhook = read('supabase/functions/stripe-live-webhook/index.ts');
const liveValidation = read('supabase/functions/create-live-validation-checkout/index.ts');
const connectSession = read('supabase/functions/create-connect-account-session/index.ts');
const payoutSetup = read('owner/payment-setup/payment-setup.js');

function expect(source, value, label) {
  if (!source.includes(value)) throw new Error(`${label} missing: ${value}`);
}

expect(ownerHtml, 'data-owner-tab="payments">Payments', 'owner navigation');
expect(ownerHtml, 'data-payment-view="product">Product Sales', 'product reporting tab');
expect(ownerHtml, 'data-payment-view="service">Service Payments', 'service reporting tab');
expect(ownerHtml, 'Public checkout stays disabled', 'payment safety notice');
expect(ownerHtml, '>Add Bank Account or Debit Card</button>', 'single payout action');
expect(ownerHtml, 'Replacement-candidate Stripe account', 'replacement consent card');
expect(ownerHtml, 'Recording consent does not create an account', 'consent safety notice');
expect(ownerJs, "const OGREENA_LIVE_MERCHANT = 'acct_1UTpIlI19b4U0AqM'", 'merchant routing check');
expect(ownerJs, 'product_payments_enabled', 'product payment gate');
expect(ownerJs, 'service_payments_enabled', 'service payment gate');
expect(ownerJs, 'live_activation_approved', 'live activation gate');
expect(ownerJs, "supabase.functions.invoke('create-refund'", 'authorized refund integration');
expect(ownerJs, "body:{ statusOnly:true }", 'owner payout status request');
expect(ownerJs, "from('ogreena_replacement_connect_consents')", 'replacement consent storage');
expect(ownerJs, "terms_version:'ogreena-replacement-live-v1'", 'versioned owner consent');
expect(connectSession, 'external_accounts?.data.find', 'Stripe-confirmed payout destination check');
expect(connectSession, 'informationRequired', 'Stripe requirement status');
expect(connectSession, 'accountManagementEnabled: true', 'Stripe account-management component');
expect(connectSession, 'disable_stripe_user_authentication: false', 'Stripe authentication preserved');
expect(payoutSetup, 'renderPayoutStatus', 'payout status display');
expect(payoutSetup, "connectInstance.create('account-management')", 'embedded bank-management controls');
expect(productJs, "kind:'product'", 'product checkout integration');
expect(accountJs, "kind:'invoice'", 'approved service invoice checkout integration');
expect(liveWebhook, "Deno.env.get('LIVE_PAYMENTS_ENABLED') === 'true'", 'server live-payment gate');
expect(liveWebhook, "stripe_webhook_events", 'duplicate webhook protection');
expect(liveWebhook, "event.type === 'charge.refunded'", 'refund event recording');
expect(liveValidation, 'Public checkout gates must remain disabled', 'controlled test isolation');

if (/data-stripe-path="test\//.test(ownerHtml)) throw new Error('Payments Dashboard still links to Stripe test mode');
if (ownerHtml.includes('data-stripe-path=')) throw new Error('Payments Dashboard still includes full Stripe Dashboard links');

console.log('Payments Dashboard focused checks passed.');
