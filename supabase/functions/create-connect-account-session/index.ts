import Stripe from 'npm:stripe@22.6.0';
import { corsHeaders, requireOwner } from '../_shared/owner.ts';

const PLATFORM_ACCOUNT_ID = 'acct_1UUSC7IBe0SKV30I';
const OGREENA_MERCHANT_ACCOUNT_ID = 'acct_1UTpIlI19b4U0AqM';

Deno.serve(async request => {
  const headers = {
    ...corsHeaders(request.headers.get('Origin')),
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json',
  };
  if (request.method === 'OPTIONS') return new Response(null, { headers });
  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405, headers });

  try {
    await requireOwner(request);
    const secret = Deno.env.get('STRIPE_CONNECT_SECRET_KEY_LIVE') || '';
    const publishableKey = Deno.env.get('STRIPE_CONNECT_PUBLISHABLE_KEY_LIVE') || '';
    if (!secret.startsWith('rk_live_')) throw new Error('Ogreena Connect credential is not configured');
    if (!publishableKey.startsWith('pk_live_')) throw new Error('Ogreena Connect publishable key is not configured');

    const stripe = new Stripe(secret, { apiVersion: '2026-08-26.dahlia' });
    let account: Stripe.Account;
    try {
      account = await stripe.accounts.retrieve(OGREENA_MERCHANT_ACCOUNT_ID);
    } catch {
      return Response.json({
        error: 'Ogreena merchant authorization is required before embedded bank management can open',
        platformAccountId: PLATFORM_ACCOUNT_ID,
        expectedMerchantAccountId: OGREENA_MERCHANT_ACCOUNT_ID,
      }, { status: 409, headers });
    }
    if (account.id !== OGREENA_MERCHANT_ACCOUNT_ID) throw new Error('Connected Stripe account mismatch');

    const accountSession = await stripe.accountSessions.create({
      account: OGREENA_MERCHANT_ACCOUNT_ID,
      components: {
        account_management: { enabled: true, features: { external_account_collection: true } },
        account_onboarding: { enabled: true, features: { external_account_collection: true } },
        notification_banner: { enabled: true },
      },
    });

    return Response.json({
      accountId: account.id,
      clientSecret: accountSession.client_secret,
      expiresAt: accountSession.expires_at,
      livemode: accountSession.livemode,
      platformAccountId: PLATFORM_ACCOUNT_ID,
      publishableKey,
    }, { headers });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Unable to start secure Stripe account management' }, { status: 403, headers });
  }
});
