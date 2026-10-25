import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const OGREENA_MERCHANT_ACCOUNT_ID = 'acct_1UTpIlI19b4U0AqM';
const RETURN_URL = 'https://ogreena.com/owner/payment-setup/';

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function finish(status: 'connected' | 'cancelled' | 'error', detail?: string) {
  const target = new URL(RETURN_URL);
  target.searchParams.set('connect', status);
  if (detail) target.searchParams.set('reason', detail.slice(0, 160));
  return Response.redirect(target.toString(), 303);
}

Deno.serve(async request => {
  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });
  const url = new URL(request.url);
  if (url.searchParams.get('error')) {
    return finish('cancelled', url.searchParams.get('error_description') || 'Stripe authorization was cancelled');
  }
  const code = url.searchParams.get('code') || '';
  const state = url.searchParams.get('state') || '';
  if (!code || !state) return finish('error', 'Missing authorization response');

  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const stateHash = await sha256(state);
    const { data: stateRow, error: stateError } = await admin
      .from('stripe_connect_oauth_states')
      .select('owner_id')
      .eq('state_hash', stateHash)
      .is('used_at', null)
      .gt('expires_at', new Date().toISOString())
      .single();
    if (stateError || !stateRow) return finish('error', 'Authorization expired or already used');

    const secret = Deno.env.get('STRIPE_CONNECT_SECRET_KEY_LIVE') || '';
    if (!/^r?k_live_/.test(secret)) return finish('error', 'Connect credential is not configured');
    const tokenResponse = await fetch('https://connect.stripe.com/oauth/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${secret}:`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ grant_type: 'authorization_code', code }),
    });
    const token = await tokenResponse.json();
    if (!tokenResponse.ok) {
      const safeCode = typeof token?.error === 'string' ? token.error : 'oauth_token_error';
      const safeDescription = typeof token?.error_description === 'string' ? token.error_description : 'Stripe rejected the OAuth token exchange';
      return finish('error', `${safeCode}: ${safeDescription}`);
    }
    if (token.stripe_user_id !== OGREENA_MERCHANT_ACCOUNT_ID) {
      return finish('error', 'Wrong Stripe merchant account selected');
    }

    const { error: settingsError } = await admin.from('payment_settings').update({
      stripe_account_id: OGREENA_MERCHANT_ACCOUNT_ID,
      updated_at: new Date().toISOString(),
    }).eq('id', true);
    if (settingsError) throw settingsError;
    const { error: usedError } = await admin.from('stripe_connect_oauth_states')
      .update({ used_at: new Date().toISOString() })
      .eq('state_hash', stateHash)
      .is('used_at', null);
    if (usedError) throw usedError;
    return finish('connected');
  } catch {
    return finish('error', 'Authorization callback failed');
  }
});
