import Stripe from 'npm:stripe@22.6.0';
import { corsHeaders, requireOwner } from '../_shared/owner.ts';

const MERCHANT_ACCOUNT_ID = 'acct_1UUtHREjIGxDre3j';

function scheduleFrom(account: Stripe.Account) {
  const schedule = account.settings?.payouts?.schedule;
  return {
    interval: schedule?.interval || 'unknown',
    delayDays: schedule?.delay_days ?? null,
    weeklyAnchor: schedule?.weekly_anchor || null,
    monthlyAnchor: schedule?.monthly_anchor || null,
  };
}

Deno.serve(async request => {
  const headers = {
    ...corsHeaders(request.headers.get('Origin'), { allowLocalPreview: true }),
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json',
  };
  if (request.method === 'OPTIONS') return new Response(null, { headers });
  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405, headers });

  try {
    await requireOwner(request);
    const body = await request.json().catch(() => ({})) as { action?: string };
    if (body.action && body.action !== 'enable_daily') {
      return Response.json({ error: 'Unsupported payout schedule action' }, { status: 400, headers });
    }

    const secret = Deno.env.get('STRIPE_CONNECT_SECRET_KEY_LIVE') || '';
    if (!secret.startsWith('rk_live_')) throw new Error('Ogreena Connect credential is not configured');
    const stripe = new Stripe(secret, { apiVersion: '2026-08-26.dahlia' });

    const before = await stripe.accounts.retrieve(MERCHANT_ACCOUNT_ID);
    const currentSchedule = scheduleFrom(before);
    let account = before;

    if (body.action === 'enable_daily' && currentSchedule.interval !== 'daily') {
      account = await stripe.accounts.update(MERCHANT_ACCOUNT_ID, {
        settings: { payouts: { schedule: { interval: 'daily' } } },
      });
    }

    const updatedSchedule = scheduleFrom(account);
    if (body.action === 'enable_daily' && updatedSchedule.interval !== 'daily') {
      throw new Error('Stripe did not confirm the daily automatic payout schedule');
    }

    let payoutReadAvailable = true;
    let pendingPayouts: Stripe.ApiList<Stripe.Payout> | null = null;
    try {
      pendingPayouts = await stripe.payouts.list(
        { limit: 10 },
        { stripeAccount: MERCHANT_ACCOUNT_ID },
      );
    } catch (error) {
      const payoutError = error as { code?: string };
      if (payoutError.code !== 'more_permissions_required') throw error;
      payoutReadAvailable = false;
    }
    const nextAutomaticPayout = (pendingPayouts?.data || [])
      .filter(item => item.automatic && ['pending', 'in_transit'].includes(item.status))
      .sort((left, right) => left.arrival_date - right.arrival_date)[0] || null;

    return Response.json({
      accountId: account.id,
      livemode: true,
      currentSchedule,
      updatedSchedule,
      dailyEnabled: updatedSchedule.interval === 'daily',
      payoutsEnabled: account.payouts_enabled === true,
      payoutReadAvailable,
      destinationConnected: Boolean(account.external_accounts?.data.some(item =>
        item.object === 'bank_account' || (item.object === 'card' && item.funding === 'debit')
      )),
      restrictions: {
        disabledReason: account.requirements?.disabled_reason || null,
        currentlyDue: account.requirements?.currently_due || [],
        pastDue: account.requirements?.past_due || [],
      },
      nextAutomaticPayout: nextAutomaticPayout ? {
        status: nextAutomaticPayout.status,
        amount: nextAutomaticPayout.amount,
        currency: nextAutomaticPayout.currency,
        arrivalDate: nextAutomaticPayout.arrival_date,
      } : null,
    }, { headers });
  } catch (error) {
    const stripeError = error as { code?: string; param?: string; requestId?: string; statusCode?: number; message?: string };
    return Response.json({
      error: stripeError.message || 'Unable to verify the Stripe payout schedule',
      code: stripeError.code || null,
      param: stripeError.param || null,
      requestId: stripeError.requestId || null,
    }, { status: stripeError.statusCode || 403, headers });
  }
});
