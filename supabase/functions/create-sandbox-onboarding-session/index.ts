import Stripe from 'npm:stripe@22.6.0';
import { corsHeaders, requireOwner } from '../_shared/owner.ts';

// Approved empty sandbox account. Never accept a Stripe account ID from the browser.
const SANDBOX_ACCOUNT_ID = 'acct_1UUV7cIMECjACbLj';

Deno.serve(async request => {
  const headers = {
    ...corsHeaders(request.headers.get('Origin')),
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json',
  };

  if (request.method === 'OPTIONS') return new Response(null, { headers });
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405, headers });
  }

  try {
    await requireOwner(request);

    const secret = Deno.env.get('STRIPE_CONNECT_SECRET_KEY_TEST') || '';
    const publishableKey = Deno.env.get('STRIPE_CONNECT_PUBLISHABLE_KEY_TEST') || '';
    if (!secret.startsWith('sk_test_')) {
      throw new Error('Ogreena sandbox Connect secret is not configured with a full-access test key');
    }
    if (!publishableKey.startsWith('pk_test_')) {
      throw new Error('Ogreena sandbox Connect publishable key is not configured');
    }

    const stripe = new Stripe(secret, { apiVersion: '2026-08-26.dahlia' });
    const accountSession = await stripe.accountSessions.create({
      account: SANDBOX_ACCOUNT_ID,
      components: {
        account_onboarding: {
          enabled: true,
          features: {
            external_account_collection: true,
          },
        },
        notification_banner: { enabled: true },
      },
    });

    if (accountSession.account !== SANDBOX_ACCOUNT_ID || accountSession.livemode) {
      throw new Error('Stripe returned the wrong account or a live-mode Account Session');
    }

    return Response.json({
      accountId: SANDBOX_ACCOUNT_ID,
      clientSecret: accountSession.client_secret,
      expiresAt: accountSession.expires_at,
      livemode: false,
      publishableKey,
    }, { headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to start sandbox onboarding';
    return Response.json({ error: message }, { status: 403, headers });
  }
});
