import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '../auth/supabase-config.js';
const safariSafeAuthLock = async (_name, _acquireTimeout, callback) => callback();

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storage: window.localStorage, storageKey: 'ogreena-auth-session', lock: safariSafeAuthLock }
});

const { data: { user } } = await supabase.auth.getUser();

if (!user) {
  location.replace('../auth/?mode=signin');
} else {
  const { data } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single();

  location.replace(data?.role === 'owner' ? '../owner/' : '../auth/');
}
