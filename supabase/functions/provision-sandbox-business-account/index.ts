import Stripe from 'npm:stripe@22.6.0';
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { corsHeaders, requireAuthenticated } from '../_shared/owner.ts';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(async request => {
  const headers = {
    ...corsHeaders(request.headers.get('Origin'), { allowLocalPreview:true }),
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
      admin.from('business_connect_consents').select('consented_at,revoked_at,user_id')
        .eq('business_id',businessId).eq('environment','test').maybeSingle(),
      admin.from('business_connect_accounts').select('stripe_account_id')
        .eq('business_id',businessId).eq('environment','test').maybeSingle(),
    ]);
    if (!consent?.consented_at || consent.revoked_at || consent.user_id !== user.id) throw new Error('Explicit sandbox consent is required');
    if (existing?.stripe_account_id) return Response.json({ accountId:existing.stripe_account_id, created:false, livemode:false }, { headers });

    const secret = Deno.env.get('STRIPE_CONNECT_SECRET_KEY_TEST') || '';
    if (!secret.startsWith('sk_test_') && !secret.startsWith('rk_test_')) throw new Error('Sandbox Stripe credential is not configured');
    const stripe = new Stripe(secret, { apiVersion:'2026-08-26.dahlia' });
    const account = await stripe.v2.core.accounts.create({
      contact_email:'sandbox-onboarding@example.com',
      dashboard:'express',
      identity:{ country:'US' },
      defaults:{ responsibilities:{ fees_collector:'application', losses_collector:'application' } },
      configuration:{ recipient:{ capabilities:{ stripe_balance:{ stripe_transfers:{ requested:true } } } } },
      metadata:{ ogreena_business_id:businessId, ogreena_environment:'sandbox' },
      include:['configuration.recipient','defaults','identity','requirements'],
    }, { idempotencyKey:`ogreena-sandbox-business-${businessId}` });
    if (account.livemode !== false) throw new Error('Stripe returned a live account to the sandbox provisioner');

    const { error:mappingError } = await admin.from('business_connect_accounts').insert({
      business_id:businessId,
      environment:'test',
      stripe_account_id:account.id,
      onboarding_status:'not_started',
    });
    if (mappingError) throw new Error('The sandbox account was created but its protected business mapping could not be saved');

    return Response.json({ accountId:account.id, created:true, livemode:false }, { headers });
  } catch (error) {
    return Response.json({ error:error instanceof Error ? error.message : 'Sandbox account provisioning failed' }, { status:403, headers });
  }
});
