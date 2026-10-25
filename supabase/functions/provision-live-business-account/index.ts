import Stripe from 'npm:stripe@22.6.0';
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { corsHeaders, requireAuthenticated } from '../_shared/owner.ts';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OGREENA_MERCHANT_ACCOUNT = 'acct_1UTpIlI19b4U0AqM';

Deno.serve(async request => {
  const headers = {
    ...corsHeaders(request.headers.get('Origin'), { allowLocalPreview:false }),
    'Cache-Control':'no-store',
    'Content-Type':'application/json',
  };
  if (request.method === 'OPTIONS') return new Response(null, { headers });
  if (request.method !== 'POST') return Response.json({ error:'Method not allowed' }, { status:405, headers });

  try {
    const { user, client } = await requireAuthenticated(request);
    const body = await request.json().catch(() => ({}));
    const businessId = typeof body.businessId === 'string' ? body.businessId : '';
    if (!UUID_PATTERN.test(businessId)) throw new Error('A valid business is required');

    const { data:membership, error:membershipError } = await client
      .from('business_memberships')
      .select('role,verification_status,businesses!inner(status)')
      .eq('business_id', businessId)
      .eq('user_id', user.id)
      .maybeSingle();
    const business = Array.isArray(membership?.businesses) ? membership.businesses[0] : membership?.businesses;
    if (membershipError || membership?.role !== 'owner' || membership?.verification_status !== 'verified' || business?.status !== 'verified') {
      throw new Error('Verified business-owner access is required');
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth:{ persistSession:false, autoRefreshToken:false } },
    );
    const [{ data:consent }, { data:existing }] = await Promise.all([
      admin.from('business_connect_consents').select('consented_at,revoked_at,user_id,terms_version')
        .eq('business_id',businessId).eq('environment','live').maybeSingle(),
      admin.from('business_connect_accounts').select('stripe_account_id')
        .eq('business_id',businessId).eq('environment','live').maybeSingle(),
    ]);
    if (!consent?.consented_at || consent.revoked_at || consent.user_id !== user.id || consent.terms_version !== 'connect-live-v1') {
      throw new Error('Explicit live Stripe consent from this verified business owner is required');
    }
    if (existing?.stripe_account_id) {
      if (existing.stripe_account_id === OGREENA_MERCHANT_ACCOUNT) throw new Error('Ogreena LLC merchant isolation check failed');
      return Response.json({ created:false, livemode:true }, { headers });
    }

    const secret = Deno.env.get('STRIPE_CONNECT_SECRET_KEY_LIVE') || '';
    if (!secret.startsWith('rk_live_')) throw new Error('Live Stripe credential is not configured');
    const stripe = new Stripe(secret, { apiVersion:'2026-08-26.dahlia' });
    const account = await stripe.v2.core.accounts.create({
      dashboard:'express',
      identity:{ country:'US' },
      defaults:{ responsibilities:{ fees_collector:'application', losses_collector:'application' } },
      configuration:{ recipient:{ capabilities:{ stripe_balance:{ stripe_transfers:{ requested:true } } } } },
      metadata:{ ogreena_business_id:businessId, ogreena_environment:'live' },
      include:['configuration.recipient','defaults','identity','requirements'],
    }, { idempotencyKey:`ogreena-live-business-${businessId}` });
    if (account.livemode !== true || account.id === OGREENA_MERCHANT_ACCOUNT) throw new Error('Stripe returned an unsafe live account');

    const { error:mappingError } = await admin.from('business_connect_accounts').insert({
      business_id:businessId,
      environment:'live',
      stripe_account_id:account.id,
      onboarding_status:'not_started',
    });
    if (mappingError) throw new Error('The live account was created but its protected business mapping could not be saved');

    return Response.json({ created:true, livemode:true }, { headers });
  } catch (error) {
    return Response.json({ error:error instanceof Error ? error.message : 'Live account provisioning failed' }, { status:403, headers });
  }
});
