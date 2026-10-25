import Stripe from 'npm:stripe@22.6.0';
import { corsHeaders, requireConnectedAccountOwner } from '../_shared/owner.ts';

const PLATFORM_ACCOUNT_ID = 'acct_1UUSC7IBe0SKV30I';

Deno.serve(async request => {
  const headers = {
    ...corsHeaders(request.headers.get('Origin'), { allowLocalPreview: true }),
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json',
  };
  if (request.method === 'OPTIONS') return new Response(null, { headers });
  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405, headers });

  try {
    const { stripeAccountId } = await requireConnectedAccountOwner(request);
    const secret = Deno.env.get('STRIPE_CONNECT_SECRET_KEY_LIVE') || '';
    const publishableKey = Deno.env.get('STRIPE_CONNECT_PUBLISHABLE_KEY_LIVE') || '';
    if (!secret.startsWith('rk_live_')) throw new Error('Ogreena Connect credential is not configured');
    if (!publishableKey.startsWith('pk_live_')) throw new Error('Ogreena Connect publishable key is not configured');

    const stripe = new Stripe(secret, { apiVersion: '2026-08-26.dahlia' });
    let account: Stripe.Account;
    try {
      account = await stripe.accounts.retrieve(stripeAccountId);
    } catch {
      return Response.json({
        error: 'The authenticated business payout account is not connected to Ogreena',
        platformAccountId: PLATFORM_ACCOUNT_ID,
      }, { status: 409, headers });
    }
    if (account.id !== stripeAccountId) throw new Error('Connected Stripe account ownership mismatch');

    const accountSession = await stripe.accountSessions.create({
      account: stripeAccountId,
      components: {
        account_management: {
          enabled: true,
          features: {
            external_account_collection: true,
          },
        },
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
