import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './auth/supabase-config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

function setVisible(element, visible) {
  if (!element) return;
  element.hidden = !visible;
  element.style.display = visible ? '' : 'none';
}

async function renderAccountNavigation(session) {
  const signedIn = Boolean(session?.user);
  document.querySelectorAll('[data-auth-guest]').forEach(element => setVisible(element, !signedIn));
  document.querySelectorAll('[data-auth-user],[data-auth-profile],[data-auth-signout]').forEach(element => setVisible(element, signedIn));
  document.querySelectorAll('[data-auth-owner],[data-auth-employee]').forEach(element => setVisible(element, false));
  if (!signedIn) return;
  const { data } = await supabase.from('user_roles').select('role').eq('user_id', session.user.id).single();
  const role = data?.role || 'customer';
  document.querySelectorAll('[data-auth-owner]').forEach(element => setVisible(element, role === 'owner'));
  document.querySelectorAll('[data-auth-employee]').forEach(element => setVisible(element, role === 'employee'));
}

document.querySelectorAll('[data-auth-signout]').forEach(element => {
  element.addEventListener('click', async event => {
    event.preventDefault();
    const { error } = await supabase.auth.signOut();
    if (!error) location.href = '/';
  });
});

const { data: { session } } = await supabase.auth.getSession();
await renderAccountNavigation(session);
supabase.auth.onAuthStateChange((event, nextSession) => {
  if (event === 'SIGNED_OUT') {
    document.querySelectorAll('[data-auth-guest]').forEach(element => setVisible(element, true));
    document.querySelectorAll('[data-auth-user],[data-auth-profile],[data-auth-owner],[data-auth-employee],[data-auth-signout]').forEach(element => setVisible(element, false));
  } else if (event === 'SIGNED_IN' && nextSession?.user) {
    document.querySelectorAll('[data-auth-guest]').forEach(element => setVisible(element, false));
    document.querySelectorAll('[data-auth-user],[data-auth-profile],[data-auth-signout]').forEach(element => setVisible(element, true));
  }
});
