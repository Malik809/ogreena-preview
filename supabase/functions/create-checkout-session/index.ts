import Stripe from 'npm:stripe@22.6.0';
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { corsHeaders } from './owner.ts';
import { stripeEnvironment } from './stripe-mode.ts';

const NEW_MERCHANT = 'acct_1UUtHREjIGxDre3j';
type PaymentKind = 'product' | 'invoice';
type ShippingAddress = { name:string; line1:string; line2?:string; city:string; state:string; postal_code:string; country:string };
const CONTIGUOUS_STATE_CODES = new Set(['AL','AZ','AR','CA','CO','CT','DE','FL','GA','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY']);
const ALL_STATE_CODES = new Set([...CONTIGUOUS_STATE_CODES,'AK','HI','DC']);
const PO_BOX_PATTERN = /\b(?:P(?:OST(?:AL)?)?\.?\s*O(?:FFICE)?\.?|P\.?\s*O\.?)\s*BOX\b/i;
const ONLINE_PRODUCT_IDS = new Set(['og-trinity-32oz','og-floor-32oz']);

function validatedShippingAddress(input: unknown, shipping: Record<string, unknown>): ShippingAddress {
  const address = (input || {}) as Record<string, unknown>;
  const normalized: ShippingAddress = {
    name:String(address.name || '').trim(), line1:String(address.line1 || '').trim(), line2:String(address.line2 || '').trim(), city:String(address.city || '').trim(),
    state:String(address.state || '').trim().toUpperCase(), postal_code:String(address.postal_code || '').trim(), country:String(address.country || 'US').trim().toUpperCase(),
  };
  if (!normalized.name || !normalized.line1 || !normalized.city || !normalized.state || !normalized.postal_code) throw new Error('A complete physical shipping address is required');
  if (normalized.country !== 'US') throw new Error('Product shipping is limited to approved U.S. destinations');
  const allowedStates = shipping.coverage === 'us_contiguous_48' ? CONTIGUOUS_STATE_CODES : ALL_STATE_CODES;
  if (!allowedStates.has(normalized.state)) throw new Error('Shipping is currently limited to the 48 contiguous states');
  if (!/^\d{5}(?:-\d{4})?$/.test(normalized.postal_code)) throw new Error('Enter a valid U.S. ZIP code');
  if (shipping.po_boxes === 'not_supported' && PO_BOX_PATTERN.test(`${normalized.line1} ${normalized.line2 || ''}`)) throw new Error('P.O. boxes are not supported');
  return normalized;
}

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
    let amount = 0, name = '', productId: string | null = null, requestId: string | null = null, estimateId: string | null = null, orderId: string | null = null, serviceSlug = '', servicePriceItemId = '';
    let approvedInvoiceLines: Array<{price_data:{currency:'usd';product_data:{name:string};unit_amount:number};quantity:number}> | null = null;
    let productShipping: { rate_cents:number; category:string; origin_zip:string; carriers:string[] } | null = null;
    let productCustomerId: string | null = null;
    if (kind === 'product') {
      if (!settings.product_payments_enabled) throw new Error('Product checkout is unavailable');
      const requestedProductId = String(body.productId || '');
      if (!ONLINE_PRODUCT_IDS.has(requestedProductId)) throw new Error('This product is not approved for online sale');
      const { data: shippingRecord, error: shippingError } = await admin.from('website_content').select('content_value').eq('content_key','product-shipping-settings').eq('published',true).single();
      if (shippingError) throw new Error('Product shipping is not approved');
      const shipping = shippingRecord?.content_value || {};
      if (shipping.mode !== 'category_flat_rate' || !['us_contiguous_48','us_50_states_dc'].includes(shipping.coverage) || shipping.rates_approved !== true || shipping.owner_approved !== true || !/^\d{5}(-\d{4})?$/.test(shipping.origin_zip || '')) throw new Error('Product shipping is not approved');
      if (!Array.isArray(shipping.carriers) || !shipping.carriers.length || !shipping.packages) throw new Error('Product fulfillment details are incomplete');
      const productEligibility = shipping.product_eligibility?.[requestedProductId];
      if (!productEligibility || productEligibility.checkout_ready !== true || productEligibility.package_measurements_verified !== true || productEligibility.packaging_verified !== true || productEligibility.carrier_eligibility_verified !== true) throw new Error('This product has not completed its packaging and carrier verification');
      const { data: product } = await admin.from('products').select('id,name,size,price_cents,visible,shipping_category').eq('id', requestedProductId).single();
      if (!product?.visible) throw new Error('Product is unavailable');
      const shippingCategory = String(product.shipping_category || '');
      const shippingRate = shipping.category_rates_cents?.[shippingCategory];
      if (!['spray_bottle','gallon'].includes(shippingCategory) || !Number.isInteger(shippingRate) || shippingRate < 0) throw new Error('This product does not have an approved shipping category');
      productShipping = { rate_cents:shippingRate, category:shippingCategory, origin_zip:shipping.origin_zip, carriers:shipping.carriers };
      productId = product.id; amount = product.price_cents; name = `${product.name} — ${product.size}`;
      const shippingAddress = validatedShippingAddress(body.shippingAddress, shipping);
      const customer = await stripe.customers.create({ email:user.email, name:shippingAddress.name, shipping:{ name:shippingAddress.name, address:{ line1:shippingAddress.line1, line2:shippingAddress.line2 || undefined, city:shippingAddress.city, state:shippingAddress.state, postal_code:shippingAddress.postal_code, country:'US' } } }, { idempotencyKey:`ogreena-product-customer-${idempotencyKey}`, ...requestOptions });
      productCustomerId = customer.id;
      const { data: order, error } = await admin.from('orders').insert({ customer_id:user.id, status:'pending', total_cents:amount, stripe_account_id:stripeAccountId }).select('id').single();
      if (error) throw error; orderId = order.id;
      const { error: itemError } = await admin.from('order_items').insert({ order_id:orderId, product_id:productId, quantity:1, unit_price_cents:amount });
      if (itemError) throw itemError;
    } else if (kind === 'invoice') {
      if (!settings.service_payments_enabled) throw new Error('Invoice checkout is unavailable');
      const { data: estimate } = await admin.from('estimates').select('id,request_id,customer_id,amount_cents,description,status,expires_at,stripe_account_id,tax_treatment,tax_confirmed_at,tax_confirmed_by,service_price_item_id,service_slug,catalog_item_name,catalog_unit_price_cents,catalog_pricing_type,catalog_unit_label,quantity,catalog_price_locked').eq('id', String(body.estimateId)).eq('customer_id', user.id).eq('status','accepted').single();
      if (!estimate?.amount_cents || estimate.amount_cents < 50) throw new Error('Approved invoice not found');
      if (estimate.expires_at && new Date(estimate.expires_at).getTime() <= Date.now()) throw new Error('This approved invoice has expired');
      if (estimate.tax_treatment !== 'service_only_nontaxable' || !estimate.tax_confirmed_at || !estimate.tax_confirmed_by) throw new Error('This invoice is blocked pending owner-confirmed tax treatment');
      const { data: invoiceLines, error: lineError } = await admin.from('estimate_line_items').select('service_price_item_id,service_slug,item_name,unit_price_cents,pricing_type,unit_label,quantity,line_total_cents').eq('estimate_id', estimate.id).order('created_at');
      if (lineError) throw new Error('Approved invoice lines could not be verified');
      if (invoiceLines?.length) {
        const verifiedTotal=invoiceLines.reduce((sum,line)=>sum+Number(line.line_total_cents),0);
        if (!invoiceLines.every(line=>line.service_slug&&line.item_name&&Number(line.unit_price_cents)>=0&&Number(line.quantity)>0&&Math.round(Number(line.unit_price_cents)*Number(line.quantity))===Number(line.line_total_cents))||verifiedTotal!==estimate.amount_cents) throw new Error('Invoice line verification failed');
        approvedInvoiceLines=invoiceLines.map(line=>({price_data:{currency:'usd',product_data:{name:`${line.item_name} × ${line.quantity}${line.unit_label?` ${line.unit_label}`:''}`},unit_amount:Number(line.line_total_cents)},quantity:1}));
      } else if (estimate.catalog_price_locked) {
        if (!estimate.service_slug || !estimate.catalog_item_name || !estimate.catalog_unit_price_cents || !estimate.catalog_pricing_type || !estimate.quantity) throw new Error('This invoice is blocked because it does not contain a verified service-price snapshot');
        const snapshotAmount = Math.round(Number(estimate.catalog_unit_price_cents) * Number(estimate.quantity));
        if (snapshotAmount !== estimate.amount_cents) throw new Error('Invoice price verification failed');
      }
      if (!environment.testMode && estimate.stripe_account_id && estimate.stripe_account_id !== NEW_MERCHANT) throw new Error('Invoice merchant mismatch');
      estimateId = estimate.id; requestId = estimate.request_id; amount = estimate.amount_cents; serviceSlug = estimate.service_slug || ''; servicePriceItemId = estimate.service_price_item_id || ''; name = `Approved Ogreena invoice — ${estimate.catalog_item_name || estimate.description || estimate.id}`;
      await admin.from('estimates').update({ stripe_account_id:stripeAccountId }).eq('id', estimate.id).is('stripe_account_id', null);
    } else throw new Error('Unsupported payment type');
    const session = await stripe.checkout.sessions.create({
      mode:'payment', ...(kind === 'product' ? { customer:productCustomerId! } : { customer_email:user.email }),
      line_items:approvedInvoiceLines || [{ price_data:{ currency:'usd', product_data:{ name }, unit_amount:amount }, quantity:1 }],
      ...(kind === 'product' ? { automatic_tax:{ enabled:true, liability:{ type:'self' as const } }, shipping_options:[{ shipping_rate_data:{ type:'fixed_amount', fixed_amount:{ amount:productShipping!.rate_cents, currency:'usd' }, display_name:productShipping!.category === 'gallon' ? 'Gallon-product shipping' : 'Spray-bottle shipping' } }], phone_number_collection:{ enabled:true } } : {}),
      success_url:'https://ogreena.com/auth/?checkout=success&session_id={CHECKOUT_SESSION_ID}', cancel_url:'https://ogreena.com/auth/?checkout=cancelled',
      integration_identifier:'ogreena_qvmtzxpk',
      metadata:{ customer_id:user.id, payment_kind:kind, product_id:productId || '', service_request_id:requestId || '', estimate_id:estimateId || '', order_id:orderId || '', stripe_account_id:stripeAccountId || '', tax_treatment:kind==='invoice'?'service_only_nontaxable':'', service_slug:serviceSlug, service_price_item_id:servicePriceItemId, shipping_mode:kind==='product'?'category_flat_rate':'', shipping_category:productShipping?.category || '', shipping_rate_cents:String(productShipping?.rate_cents ?? ''), fulfillment_origin_zip:productShipping?.origin_zip || '', carrier_comparison:productShipping?.carriers.join(',') || '' },
    }, { idempotencyKey, ...requestOptions });
    const { error: transactionError } = await admin.from('payment_transactions').insert({ customer_id:user.id, order_id:orderId, service_request_id:requestId, estimate_id:estimateId, payment_kind:kind, stripe_checkout_session_id:session.id, stripe_account_id:stripeAccountId, amount_cents:amount, currency:'usd', status:'pending', idempotency_key:idempotencyKey, livemode:!environment.testMode });
    if (transactionError) throw transactionError;
    return Response.json({ url:session.url, sessionId:session.id, testMode:environment.testMode }, { headers });
  } catch (error) {
    return Response.json({ error:error instanceof Error ? error.message : 'Checkout failed' }, { status:400, headers });
  }
});
