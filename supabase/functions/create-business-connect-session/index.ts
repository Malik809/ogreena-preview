import Stripe from 'npm:stripe@22.6.0';
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { corsHeaders, requireAuthenticated } from '../_shared/owner.ts';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(async request => {
  const headers = {
    ...corsHeaders(request.headers.get('Origin'), { allowLocalPreview: true }),
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json',
  };
  if (request.method === 'OPTIONS') return new Response(null, { headers });
  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405, headers });

  try {
    const { user, client } = await requireAuthenticated(request);
    const body = await request.json().catch(() => ({}));
    const businessId = typeof body.businessId === 'string' ? body.businessId : '';
    const environment = body.environment === 'live' ? 'live' : 'test';
    if (!UUID_PATTERN.test(businessId)) throw new Error('A valid business is required');

    const { data: membership, error: membershipError } = await client
      .from('business_memberships')
      .select('role,verification_status,businesses!inner(status)')
      .eq('business_id', businessId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (membershipError || !membership) throw new Error('Business access denied');
    if (membership.role !== 'owner' || membership.verification_status !== 'verified') {
      throw new Error('Verified business-owner access is required');
    }
    const business = Array.isArray(membership.businesses) ? membership.businesses[0] : membership.businesses;
    if (business?.status !== 'verified') throw new Error('Business verification is not complete');

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const [{ data: consent }, { data: account, error: accountError }] = await Promise.all([
      admin.from('business_connect_consents')
        .select('consented_at,revoked_at,user_id')
        .eq('business_id', businessId)
        .eq('environment', environment)
        .maybeSingle(),
      admin.from('business_connect_accounts')
        .select('stripe_account_id,onboarding_status')
        .eq('business_id', businessId)
        .eq('environment', environment)
        .maybeSingle(),
    ]);
    if (!consent?.consented_at || consent.revoked_at || consent.user_id !== user.id) throw new Error('Explicit consent from the current verified business owner is required');
    if (accountError || !account?.stripe_account_id) {
      return Response.json({
        error: `No ${environment} Stripe account is assigned to this verified business. No account was created.`,
        code: `${environment}_account_not_assigned`,
      }, { status: 409, headers });
    }

    const secret = Deno.env.get(environment === 'live' ? 'STRIPE_CONNECT_SECRET_KEY_LIVE' : 'STRIPE_CONNECT_SECRET_KEY_TEST') || '';
    const publishableKey = Deno.env.get(environment === 'live' ? 'STRIPE_CONNECT_PUBLISHABLE_KEY_LIVE' : 'STRIPE_CONNECT_PUBLISHABLE_KEY_TEST') || '';
    if (environment === 'live' && !secret.startsWith('rk_live_')) throw new Error('Live Stripe credential is not configured');
    if (environment === 'test' && !secret.startsWith('sk_test_') && !secret.startsWith('rk_test_')) throw new Error('Sandbox Stripe credential is not configured');
    if (!publishableKey.startsWith(environment === 'live' ? 'pk_live_' : 'pk_test_')) throw new Error(`${environment} Stripe publishable key is not configured`);

    const stripe = new Stripe(secret, { apiVersion: '2026-08-26.dahlia' });
    const stripeAccount = await stripe.v2.core.accounts.retrieve(account.stripe_account_id, {
      include:['configuration.recipient','identity','requirements'],
    });
    if (stripeAccount.livemode !== (environment === 'live')) throw new Error('Stripe connected-account environment mismatch');

    const onboardingComplete = account.onboarding_status === 'complete';
    const accountSession = await stripe.accountSessions.create({
      account: account.stripe_account_id,
      components: onboardingComplete ? {
        account_management: {
          enabled: true,
          features: { external_account_collection: true },
        },
        notification_banner: { enabled: true },
      } : {
        account_onboarding: {
          enabled: true,
          features: { external_account_collection: true },
        },
        notification_banner: { enabled: true },
      },
    });

    return Response.json({
      businessId,
      clientSecret: accountSession.client_secret,
      expiresAt: accountSession.expires_at,
      livemode: environment === 'live',
      environment,
      mode: onboardingComplete ? 'management' : 'onboarding',
      publishableKey,
    }, { headers });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Unable to start business onboarding' }, { status: 403, headers });
  }
});
