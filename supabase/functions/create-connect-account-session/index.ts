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
    const body = await request.json().catch(() => ({})) as { statusOnly?: boolean };
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

    const externalAccount = account.external_accounts?.data.find(item =>
      item.object === 'bank_account' || (item.object === 'card' && item.funding === 'debit')
    );
    const payoutDestination = externalAccount ? {
      type: externalAccount.object === 'bank_account' ? 'Bank account' : 'Debit card',
      label: externalAccount.object === 'bank_account' ? (externalAccount.bank_name || 'Bank account') : (externalAccount.brand || 'Debit card'),
      last4: externalAccount.last4 || null,
      currency: externalAccount.currency || null,
    } : null;
    const currentlyDue = account.requirements?.currently_due || [];
    const payoutStatus = {
      connected: Boolean(payoutDestination),
      destination: payoutDestination,
      informationRequired: currentlyDue.length > 0,
      pastDue: (account.requirements?.past_due || []).length > 0,
      disabledReason: account.requirements?.disabled_reason || null,
    };

    if (body.statusOnly) {
      return Response.json({
        accountId: account.id,
        livemode: true,
        platformAccountId: PLATFORM_ACCOUNT_ID,
        payoutStatus,
      }, { headers });
    }

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

    const accountManagement = accountSession.components?.account_management;
    if (!accountManagement?.enabled) {
      return Response.json({
        error: 'Stripe did not enable embedded account management for this connected account configuration',
        platformAccountId: PLATFORM_ACCOUNT_ID,
      }, { status: 409, headers });
    }

    return Response.json({
      accountId: account.id,
      clientSecret: accountSession.client_secret,
      expiresAt: accountSession.expires_at,
      livemode: accountSession.livemode,
      accountManagementEnabled: true,
      platformAccountId: PLATFORM_ACCOUNT_ID,
      payoutStatus,
      publishableKey,
    }, { headers });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Unable to start secure Stripe account management' }, { status: 403, headers });
  }
});
