import Stripe from 'npm:stripe@22.6.0';
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { corsHeaders } from './owner.ts';
import { stripeEnvironment } from './stripe-mode.ts';

const NEW_MERCHANT = 'acct_1UUtHREjIGxDre3j';
type PaymentKind = 'product' | 'service_deposit' | 'service_full' | 'invoice';

Deno.serve(async request => {
  const headers = { ...corsHeaders(request.headers.get('Origin')), 'Content-Type': 'application/json' };
  if (request.method === 'OPTIONS') return new Response(null, { headers });
  try {
    const auth = request.headers.get('Authorization');
    if (!auth?.startsWith('Bearer ')) throw new Error('Authentication required');
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) throw new Error('Authentication required');
    const { data: settings } = await admin.from('payment_settings').select('payments_enabled,product_payments_enabled,service_payments_enabled,test_mode,live_activation_approved').single();
    if (!settings?.payments_enabled) throw new Error('Checkout is not available');
    const environment = stripeEnvironment(settings);
    const stripeAccountId = environment.testMode ? null : NEW_MERCHANT;
    const requestOptions = stripeAccountId ? { stripeAccount: stripeAccountId } : {};
    const body = await request.json();
    const idempotencyKey = String(body.idempotencyKey || '');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)) throw new Error('A valid checkout request ID is required');
    const { data: existing } = await admin.from('payment_transactions').select('stripe_checkout_session_id,stripe_account_id').eq('customer_id', user.id).eq('idempotency_key', idempotencyKey).maybeSingle();
    const stripe = new Stripe(environment.secret, { apiVersion:'2026-08-26.dahlia' });
    if (existing?.stripe_checkout_session_id) {
      if (!environment.testMode && existing.stripe_account_id !== NEW_MERCHANT) throw new Error('Existing checkout merchant mismatch');
      const session = await stripe.checkout.sessions.retrieve(existing.stripe_checkout_session_id, {}, requestOptions);
      return Response.json({ url:session.url, sessionId:session.id, testMode:environment.testMode }, { headers });
    }
    const kind = String(body.kind || '') as PaymentKind;
    let amount = 0, name = '', productId: string | null = null, requestId: string | null = null, estimateId: string | null = null, orderId: string | null = null;
    if (kind === 'product') {
      if (!settings.product_payments_enabled) throw new Error('Product checkout is unavailable');
      const { data: product } = await admin.from('products').select('id,name,size,price_cents,visible').eq('id', String(body.productId)).single();
      if (!product?.visible) throw new Error('Product is unavailable');
      productId = product.id; amount = product.price_cents; name = `${product.name} — ${product.size}`;
      const { data: order, error } = await admin.from('orders').insert({ customer_id:user.id, status:'pending', total_cents:amount, stripe_account_id:stripeAccountId }).select('id').single();
      if (error) throw error; orderId = order.id;
      const { error: itemError } = await admin.from('order_items').insert({ order_id:orderId, product_id:productId, quantity:1, unit_price_cents:amount });
      if (itemError) throw itemError;
    } else if (kind === 'service_deposit' || kind === 'service_full') {
      if (!settings.service_payments_enabled) throw new Error('Service checkout is unavailable');
      const { data: service } = await admin.from('service_requests').select('id,customer_id,summary,deposit_amount_cents,full_payment_amount_cents').eq('id', String(body.serviceRequestId)).eq('customer_id', user.id).single();
      if (!service) throw new Error('Service request not found');
      requestId = service.id; amount = kind === 'service_deposit' ? service.deposit_amount_cents : service.full_payment_amount_cents;
      if (!amount || amount < 50) throw new Error('The owner has not approved an amount for this payment');
      name = kind === 'service_deposit' ? `Deposit — ${service.summary}` : `Service payment — ${service.summary}`;
    } else if (kind === 'invoice') {
      if (!settings.service_payments_enabled) throw new Error('Invoice checkout is unavailable');
      const { data: estimate } = await admin.from('estimates').select('id,request_id,customer_id,amount_cents,description,status,stripe_account_id').eq('id', String(body.estimateId)).eq('customer_id', user.id).eq('status','accepted').single();
      if (!estimate?.amount_cents || estimate.amount_cents < 50) throw new Error('Approved invoice not found');
      if (!environment.testMode && estimate.stripe_account_id && estimate.stripe_account_id !== NEW_MERCHANT) throw new Error('Invoice merchant mismatch');
      estimateId = estimate.id; requestId = estimate.request_id; amount = estimate.amount_cents; name = `Approved Ogreena invoice — ${estimate.description || estimate.id}`;
      await admin.from('estimates').update({ stripe_account_id:stripeAccountId }).eq('id', estimate.id).is('stripe_account_id', null);
    } else throw new Error('Unsupported payment type');
    const session = await stripe.checkout.sessions.create({
      mode:'payment', customer_email:user.email,
      line_items:[{ price_data:{ currency:'usd', product_data:{ name }, unit_amount:amount }, quantity:1 }],
      success_url:'https://ogreena.com/auth/?checkout=success&session_id={CHECKOUT_SESSION_ID}', cancel_url:'https://ogreena.com/auth/?checkout=cancelled',
      integration_identifier:'ogreena_qvmtzxpk',
      metadata:{ customer_id:user.id, payment_kind:kind, product_id:productId || '', service_request_id:requestId || '', estimate_id:estimateId || '', order_id:orderId || '', stripe_account_id:stripeAccountId || '' },
    }, { idempotencyKey, ...requestOptions });
    const { error: transactionError } = await admin.from('payment_transactions').insert({ customer_id:user.id, order_id:orderId, service_request_id:requestId, estimate_id:estimateId, payment_kind:kind, stripe_checkout_session_id:session.id, stripe_account_id:stripeAccountId, amount_cents:amount, currency:'usd', status:'pending', idempotency_key:idempotencyKey, livemode:!environment.testMode });
    if (transactionError) throw transactionError;
    return Response.json({ url:session.url, sessionId:session.id, testMode:environment.testMode }, { headers });
  } catch (error) {
    return Response.json({ error:error instanceof Error ? error.message : 'Checkout failed' }, { status:400, headers });
  }
});
