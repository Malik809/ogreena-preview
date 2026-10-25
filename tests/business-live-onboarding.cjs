const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const ui = read('business/business.js');
const html = read('business/index.html');
const session = read('supabase/functions/create-business-connect-session/index.ts');
const provision = read('supabase/functions/provision-live-business-account/index.ts');

function expect(source, value, label) {
  if (!source.includes(value)) throw new Error(`${label} missing: ${value}`);
}

expect(html, 'Live Stripe onboarding consent', 'explicit live consent UI');
expect(html, 'This does not enable customer charging', 'charging safety notice');
expect(ui, "connectEnvironment = sandboxMode ? 'test' : 'live'", 'live-by-default environment');
expect(ui, "'connect-live-v1'", 'versioned live consent');
expect(ui, "'provision-live-business-account'", 'consent-gated live provisioner');
expect(ui, '@stripe/connect-js@3.3.1', 'verified Connect JS version');
expect(ui, "create(data.mode === 'management' ? 'account-management' : 'account-onboarding')", 'onboarding and management isolation');
expect(session, ".eq('business_id', businessId)", 'business-scoped session lookup');
expect(session, ".eq('user_id', user.id)", 'authenticated membership ownership check');
expect(session, "environment = body.environment === 'live' ? 'live' : 'test'", 'separate Stripe environments');
expect(session, 'external_account_collection: true', 'Stripe-only payout collection');
expect(provision, "consent.terms_version !== 'connect-live-v1'", 'exact live consent enforcement');
expect(provision, "membership?.role !== 'owner'", 'verified owner enforcement');
expect(provision, "Deno.env.get('STRIPE_CONNECT_SECRET_KEY_LIVE')", 'server-only live credential');
expect(provision, "stripe.v2.core.accounts.create", 'Accounts v2 provisioning');
expect(provision, "idempotencyKey:`ogreena-live-business-${businessId}`", 'one-account idempotency');
expect(provision, "account.id === OGREENA_MERCHANT_ACCOUNT", 'Ogreena merchant isolation');
expect(provision, "environment:'live'", 'live mapping scope');
if (provision.includes('accountId:account.id')) throw new Error('Live Stripe account ID is exposed to the browser');
if (/type:\s*['\"](express|custom|standard)/.test(provision)) throw new Error('Legacy connected-account type is used');
if (/card_number|routing_number|ssn|tax_id/.test(ui)) throw new Error('Frontend attempts to collect sensitive Stripe data');

console.log('Business live onboarding focused checks passed.');
