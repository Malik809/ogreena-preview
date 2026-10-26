import Stripe from 'npm:stripe@22.6.0';
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { corsHeaders, requireOwner } from '../_shared/owner.ts';

const EXISTING_MERCHANT = 'acct_1UTpIlI19b4U0AqM';
const CONSENT_VERSION = 'ogreena-replacement-live-v1';
const MAX_REAUTH_AGE_SECONDS = 5 * 60;

function decodeJwtPayload(request: Request) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const encoded = token.split('.')[1];
  if (!encoded) throw new Error('Fresh owner authentication is required');
  try {
    const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return JSON.parse(atob(padded));
  } catch {
    throw new Error('Fresh owner authentication is required');
  }
}

function requireFreshPasswordAuthentication(request: Request, userId: string) {
  // requireOwner() cryptographically verifies the JWT with Supabase before this
  // decoded payload is consulted. The AMR timestamp survives ordinary token
  // refreshes, so a refreshed session cannot masquerade as fresh authentication.
  const claims = decodeJwtPayload(request);
  const now = Math.floor(Date.now() / 1000);
  const passwordAuth = Array.isArray(claims.amr)
    ? claims.amr.filter((entry: { method?: string; timestamp?: number }) => entry?.method === 'password')
      .sort((a: { timestamp?: number }, b: { timestamp?: number }) => Number(b.timestamp || 0) - Number(a.timestamp || 0))[0]
    : null;
  const authenticatedAt = Number(passwordAuth?.timestamp || 0);
  if (claims.sub !== userId || claims.is_anonymous === true || !claims.session_id ||
      !authenticatedAt || authenticatedAt > now + 30 || now - authenticatedAt > MAX_REAUTH_AGE_SECONDS) {
    throw new Error('Re-enter your Ogreena password to start secure Stripe onboarding');
  }
}

Deno.serve(async request => {
  const headers = {
    ...corsHeaders(request.headers.get('Origin'), { allowLocalPreview:false }),
    'Cache-Control':'no-store',
    'Content-Type':'application/json',
  };
  if (request.method === 'OPTIONS') return new Response(null, { headers });
  if (request.method !== 'POST') return Response.json({ error:'Method not allowed' }, { status:405, headers });

  let stage = 'owner_authentication';
  try {
    const { user } = await requireOwner(request);
    requireFreshPasswordAuthentication(request, user.id);
    stage = 'candidate_authorization';
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
        dashboard:'full',
        identity:{ country:'US' },
        defaults:{ responsibilities:{ fees_collector:'stripe', losses_collector:'stripe' } },
        configuration:{ merchant:{ capabilities:{ card_payments:{ requested:true } } } },
        metadata:{ ogreena_replacement_candidate:'true', ogreena_existing_merchant:EXISTING_MERCHANT },
        include:['configuration.merchant','defaults','identity','requirements'],
      }, { idempotencyKey:'ogreena-llc-replacement-candidate-v4' });
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
      include:['configuration.merchant','identity','requirements'],
    });
    if (account.livemode !== true || account.id === EXISTING_MERCHANT ||
        !account.applied_configurations?.includes('merchant') ||
        account.metadata?.ogreena_replacement_candidate !== 'true') {
      throw new Error('The mapped Stripe account is not the authorized live replacement candidate');
    }

    stage = 'stripe_account_session';
    const accountSession = await stripe.accountSessions.create({
      account:accountId,
      components:{
        account_onboarding:{
          enabled:true,
          features:{
            external_account_collection:true,
            disable_stripe_user_authentication:true,
          },
        },
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
    const message = error instanceof Error ? error.message : 'Unable to open replacement onboarding';
    const stripeError = error as { code?:string; type?:string; param?:string; requestId?:string };
    console.error('replacement_onboarding_failed', {
      stage,
      code:stripeError?.code || null,
      type:stripeError?.type || null,
      param:stripeError?.param || null,
      request_id:stripeError?.requestId || null,
      message,
    });
    const status = stage === 'owner_authentication' || stage === 'candidate_authorization' ? 403
      : stage === 'stripe_account_session' ? 502 : 500;
    const safeError = stage === 'stripe_account_session'
      ? `Stripe could not create the secure onboarding session${stripeError?.code ? ` (${stripeError.code})` : ''}`
      : message;
    return Response.json({ error:safeError, stage }, { status, headers });
  }
});
