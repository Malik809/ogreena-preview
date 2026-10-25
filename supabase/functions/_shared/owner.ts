import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

export function corsHeaders(origin: string | null) {
  const allowed = new Set(['https://ogreena.com', 'https://www.ogreena.com']);
  return {
    'Access-Control-Allow-Origin': origin && allowed.has(origin) ? origin : 'https://ogreena.com',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

export async function requireOwner(request: Request) {
  const { user, client } = await requireAuthenticated(request);
  const { data: role } = await client.from('user_roles').select('role').eq('user_id', user.id).single();
  if (role?.role !== 'owner') throw new Error('Owner access required');
  return { user, client };
}

export async function requireAuthenticated(request: Request) {
  const auth = request.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) throw new Error('Authentication required');
  const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } },
  });
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) throw new Error('Authentication required');
  return { user, client };
}

export async function requireConnectedAccountOwner(request: Request) {
  const { user, client } = await requireAuthenticated(request);
  const { data: account, error } = await client
    .from('business_stripe_accounts')
    .select('stripe_account_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error || !account?.stripe_account_id) throw new Error('No Stripe payout account is assigned to this business user');
  return { user, client, stripeAccountId: account.stripe_account_id as string };
}
