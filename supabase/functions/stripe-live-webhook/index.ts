import Stripe from 'npm:stripe@22.6.0';
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const VALIDATION_ESTIMATE_ID = 'c5e66b8a-8d74-4f53-8e4f-31c74d550150';
const NEW_MERCHANT = 'acct_1UUtHREjIGxDre3j';
const ORIGINAL_MERCHANT = 'acct_1UTpIlI19b4U0AqM';

Deno.serve(async request => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const secret = Deno.env.get('STRIPE_LIVE_SECRET_KEY');
  const webhookSecret = Deno.env.get('STRIPE_LIVE_WEBHOOK_SECRET');
  if (!secret?.startsWith('rk_live_') || !webhookSecret?.startsWith('whsec_')) return new Response('Not configured', { status: 503 });
  const stripe = new Stripe(secret, { apiVersion: '2026-08-26.dahlia' });
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(await request.text(), request.headers.get('stripe-signature') || '', webhookSecret);
  } catch {
    return new Response('Invalid signature', { status: 400 });
  }
  if (!event.livemode) return new Response('Live events only', { status: 400 });
  const stripeAccountId = typeof event.account === 'string' ? event.account : null;
  if (!stripeAccountId || ![NEW_MERCHANT, ORIGINAL_MERCHANT].includes(stripeAccountId)) return new Response('Unknown connected account', { status: 400 });
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: settings } = await admin.from('payment_settings').select('live_activation_approved').single();
  const normalLiveProcessing = settings?.live_activation_approved && Deno.env.get('LIVE_PAYMENTS_ENABLED') === 'true';
  let validationEvent = false;
  if (event.type.startsWith('checkout.session.')) {
    const session = event.data.object as Stripe.Checkout.Session;
    validationEvent = session.metadata?.validation_test === 'true' && session.metadata?.estimate_id === VALIDATION_ESTIMATE_ID && session.amount_total === 50;
  } else if (event.type === 'charge.refunded' || event.type === 'payment_intent.payment_failed') {
    const object = event.data.object as Stripe.Charge | Stripe.PaymentIntent;
    const paymentIntentId = event.type === 'charge.refunded'
      ? (typeof (object as Stripe.Charge).payment_intent === 'string' ? (object as Stripe.Charge).payment_intent as string : (object as Stripe.Charge).payment_intent?.id)
      : (object as Stripe.PaymentIntent).id;
    if (paymentIntentId) {
      const { data: transaction } = await admin.from('payment_transactions').select('id').eq('stripe_payment_intent_id', paymentIntentId).eq('stripe_account_id', stripeAccountId).eq('estimate_id', VALIDATION_ESTIMATE_ID).eq('amount_cents', 50).eq('livemode', true).maybeSingle();
      validationEvent = Boolean(transaction);
    }
  }
  if (!normalLiveProcessing && !validationEvent) return new Response('Live processing disabled', { status: 503 });
  const { error: claimError } = await admin.from('stripe_webhook_events').insert({ stripe_event_id: event.id, event_type: event.type });
  if (claimError?.code === '23505') return new Response('ok');
  if (claimError) return new Response('Unable to claim event', { status: 500 });
  try {
    if (['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.async_payment_failed'].includes(event.type)) {
      const session = event.data.object as Stripe.Checkout.Session;
      const paid = session.payment_status === 'paid' && event.type !== 'checkout.session.async_payment_failed';
      await admin.from('payment_transactions').upsert({
        customer_id: session.metadata?.customer_id || null,
        order_id: session.metadata?.order_id || null,
        service_request_id: session.metadata?.service_request_id || null,
        estimate_id: session.metadata?.estimate_id || null,
        payment_kind: session.metadata?.payment_kind || 'product',
        stripe_checkout_session_id: session.id,
        stripe_payment_intent_id: typeof session.payment_intent === 'string' ? session.payment_intent : null,
        stripe_account_id: stripeAccountId,
        amount_cents: session.amount_total || 0,
        currency: session.currency || 'usd',
        status: paid ? 'paid' : 'failed',
        livemode: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'stripe_checkout_session_id' });
      if (paid && session.metadata?.order_id) await admin.from('orders').update({ status: 'confirmed', updated_at: new Date().toISOString() }).eq('id', session.metadata.order_id);
    } else if (event.type === 'payment_intent.payment_failed') {
      const intent = event.data.object as Stripe.PaymentIntent;
      await admin.from('payment_transactions').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('stripe_payment_intent_id', intent.id).eq('stripe_account_id', stripeAccountId).eq('livemode', true).neq('status', 'paid');
    } else if (event.type === 'charge.refunded') {
      const charge = event.data.object as Stripe.Charge;
      const paymentIntent = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;
      if (paymentIntent) await admin.from('payment_transactions').update({ refunded_amount_cents: charge.amount_refunded, refund_stripe_account_id:stripeAccountId, status: charge.refunded ? 'refunded' : 'partially_refunded', updated_at: new Date().toISOString() }).eq('stripe_payment_intent_id', paymentIntent).eq('stripe_account_id', stripeAccountId).eq('livemode', true);
    }
  } catch (error) {
    await admin.from('stripe_webhook_events').delete().eq('stripe_event_id', event.id);
    console.error('Live webhook processing failed', error instanceof Error ? error.message : 'unknown error');
    return new Response('Processing failed', { status: 500 });
  }
  return new Response('ok');
});
