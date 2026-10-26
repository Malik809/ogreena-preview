import Stripe from 'npm:stripe@22.6.0';
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const MERCHANT_ID = 'acct_1UUtHREjIGxDre3j';
const VALIDATION_ESTIMATE_ID = 'c5e66b8a-8d74-4f53-8e4f-31c74d550150';
const allowedOrigins = new Set(['https://ogreena.com', 'https://www.ogreena.com']);
const cors = (origin: string | null) => ({
  'Access-Control-Allow-Origin': origin && allowedOrigins.has(origin) ? origin : 'https://ogreena.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
});

Deno.serve(async request => {
  const headers = { ...cors(request.headers.get('Origin')), 'Content-Type': 'application/json' };
  if (request.method === 'OPTIONS') return new Response(null, { headers });
  try {
    const auth = request.headers.get('Authorization');
    if (!auth?.startsWith('Bearer ')) throw new Error('Authentication required');
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) throw new Error('Authentication required');
    const { data: role } = await admin.from('user_roles').select('role').eq('user_id', user.id).single();
    if (role?.role !== 'owner') throw new Error('Owner access required');

    const { data: settings } = await admin.from('payment_settings').select('payments_enabled,product_payments_enabled,service_payments_enabled,stripe_account_id').single();
    if (settings?.payments_enabled || settings?.product_payments_enabled || settings?.service_payments_enabled) throw new Error('Public checkout gates must remain disabled');
    const { data: estimate } = await admin.from('estimates').select('id,request_id,customer_id,amount_cents,description,status,expires_at').eq('id', VALIDATION_ESTIMATE_ID).eq('customer_id', user.id).eq('status', 'accepted').single();
    if (!estimate || estimate.amount_cents !== 50 || estimate.description !== 'Owner-approved $0.50 live Stripe validation invoice') throw new Error('Approved validation invoice not found');
    if (estimate.expires_at && new Date(estimate.expires_at) <= new Date()) throw new Error('Validation invoice expired');

    const secret = Deno.env.get('STRIPE_LIVE_SECRET_KEY');
    if (!secret?.startsWith('rk_live_')) throw new Error('Restricted live Stripe key is not configured');
    const stripe = new Stripe(secret, { apiVersion: '2026-08-26.dahlia' });
    const idempotencyKey = `ogreena-live-validation-${estimate.id}`;
    const { data: existing } = await admin.from('payment_transactions').select('stripe_checkout_session_id').eq('estimate_id', estimate.id).eq('livemode', true).maybeSingle();
    if (existing?.stripe_checkout_session_id) {
      const existingSession = await stripe.checkout.sessions.retrieve(existing.stripe_checkout_session_id, {}, { stripeAccount:MERCHANT_ID });
      return Response.json({ url: existingSession.url, sessionId: existingSession.id }, { headers });
    }
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: user.email,
      line_items: [{ price_data: { currency: 'usd', product_data: { name: 'Ogreena live payment validation' }, unit_amount: 50 }, quantity: 1 }],
      success_url: 'https://ogreena.com/owner/?live_validation=success&session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'https://ogreena.com/owner/?live_validation=cancelled',
      integration_identifier: 'ogreena_qvmtzxpk',
      metadata: { customer_id: user.id, payment_kind: 'invoice', service_request_id: estimate.request_id, estimate_id: estimate.id, validation_test: 'true', merchant_account_id: MERCHANT_ID },
    }, { idempotencyKey, stripeAccount:MERCHANT_ID });
    const { error } = await admin.from('payment_transactions').insert({ customer_id: user.id, service_request_id: estimate.request_id, estimate_id: estimate.id, payment_kind: 'invoice', stripe_checkout_session_id: session.id, stripe_account_id:MERCHANT_ID, amount_cents: 50, currency: 'usd', status: 'pending', livemode: true });
    if (error) throw error;
    return Response.json({ url: session.url, sessionId: session.id }, { headers });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Validation checkout failed' }, { status: 400, headers });
  }
});
