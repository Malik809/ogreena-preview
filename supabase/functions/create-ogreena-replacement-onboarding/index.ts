import Stripe from 'npm:stripe@22.6.0';
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { corsHeaders, requireOwner } from '../_shared/owner.ts';

const EXISTING_MERCHANT = 'acct_1UTpIlI19b4U0AqM';
const CONSENT_VERSION = 'ogreena-replacement-live-v1';

Deno.serve(async request => {
  const headers = {
    ...corsHeaders(request.headers.get('Origin'), { allowLocalPreview:false }),
    'Cache-Control':'no-store',
    'Content-Type':'application/json',
  };
  if (request.method === 'OPTIONS') return new Response(null, { headers });
  if (request.method !== 'POST') return Response.json({ error:'Method not allowed' }, { status:405, headers });

  try {
    const { user } = await requireOwner(request);
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth:{ persistSession:false, autoRefreshToken:false } },
    );
    const [{ data:consent, error:consentError }, { data:candidate, error:candidateError }] = await Promise.all([
      admin.from('ogreena_replacement_connect_consents')
        .select('owner_id,existing_merchant_account_id,terms_version,consented_at,revoked_at')
        .eq('id',true).maybeSingle(),
      admin.from('ogreena_replacement_connect_candidates')
        .select('replacement_stripe_account_id,status,created_from_consent_owner_id')
        .eq('id',true).maybeSingle(),
    ]);
    if (consentError || !consent?.consented_at || consent.revoked_at || consent.owner_id !== user.id ||
        consent.existing_merchant_account_id !== EXISTING_MERCHANT || consent.terms_version !== CONSENT_VERSION) {
      throw new Error('Authenticated owner consent is required before creating the replacement account');
    }
    if (candidateError) throw candidateError;

    const secret = Deno.env.get('STRIPE_CONNECT_SECRET_KEY_LIVE') || '';
    const publishableKey = Deno.env.get('STRIPE_CONNECT_PUBLISHABLE_KEY_LIVE') || '';
    if (!secret.startsWith('rk_live_')) throw new Error('Live Stripe credential is not configured');
    if (!publishableKey.startsWith('pk_live_')) throw new Error('Live Stripe publishable key is not configured');
    const stripe = new Stripe(secret, { apiVersion:'2026-08-26.dahlia' });

    let accountId = candidate?.replacement_stripe_account_id || '';
    let created = false;
    if (!accountId) {
      const account = await stripe.v2.core.accounts.create({
        dashboard:'express',
        identity:{ country:'US' },
        defaults:{ responsibilities:{ fees_collector:'application', losses_collector:'stripe' } },
        configuration:{ recipient:{ capabilities:{ stripe_balance:{ stripe_transfers:{ requested:true } } } } },
        metadata:{ ogreena_replacement_candidate:'true', ogreena_existing_merchant:EXISTING_MERCHANT },
        include:['configuration.recipient','defaults','identity','requirements'],
      }, { idempotencyKey:'ogreena-llc-replacement-candidate-v1' });
      if (!account.id || account.livemode !== true || account.id === EXISTING_MERCHANT) {
        throw new Error('Stripe returned an unsafe replacement account');
      }
      accountId = account.id;
      created = true;
      const { error:mappingError } = await admin.from('ogreena_replacement_connect_candidates').upsert({
        id:true,
        existing_merchant_account_id:EXISTING_MERCHANT,
        replacement_stripe_account_id:accountId,
        status:'created',
        created_from_consent_owner_id:user.id,
        created_at:new Date().toISOString(),
        updated_at:new Date().toISOString(),
      }, { onConflict:'id' });
      if (mappingError) throw new Error('The account was created but its protected candidate mapping could not be saved');
    }

    if (accountId === EXISTING_MERCHANT || candidate?.created_from_consent_owner_id && candidate.created_from_consent_owner_id !== user.id) {
      throw new Error('Replacement-account isolation check failed');
    }
    const account = await stripe.v2.core.accounts.retrieve(accountId, {
      include:['configuration.recipient','identity','requirements'],
    });
    if (account.livemode !== true || account.id === EXISTING_MERCHANT || account.metadata?.ogreena_replacement_candidate !== 'true') {
      throw new Error('The mapped Stripe account is not the authorized live replacement candidate');
    }

    const accountSession = await stripe.accountSessions.create({
      account:accountId,
      components:{
        account_onboarding:{ enabled:true, features:{ external_account_collection:true } },
        notification_banner:{ enabled:true },
      },
    });
    await admin.from('ogreena_replacement_connect_candidates').update({
      status:'onboarding', updated_at:new Date().toISOString(),
    }).eq('id',true).eq('replacement_stripe_account_id',accountId);

    return Response.json({
      clientSecret:accountSession.client_secret,
      expiresAt:accountSession.expires_at,
      publishableKey,
      livemode:true,
      mode:'onboarding',
      created,
    }, { headers });
  } catch (error) {
    return Response.json({ error:error instanceof Error ? error.message : 'Unable to open replacement onboarding' }, { status:403, headers });
  }
});
