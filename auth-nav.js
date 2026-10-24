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
  document.querySelectorAll('[data-auth-user],[data-auth-signout]').forEach(element => setVisible(element, signedIn));
  if (!signedIn) return;
  const { data } = await supabase.from('user_roles').select('role').eq('user_id', session.user.id).single();
  const role = data?.role || 'customer';
  document.querySelectorAll('[data-auth-user]').forEach(link => {
    if (role === 'owner') { link.textContent = 'Owner Dashboard'; link.href = '/owner/'; }
    else if (role === 'employee') { link.textContent = 'Employee Dashboard'; link.href = '/customer/'; }
    else { link.textContent = 'My Account'; link.href = '/customer/'; }
  });
}

document.querySelectorAll('[data-auth-signout]').forEach(element => {
  element.addEventListener('click', async event => {
    event.preventDefault();
    const { error } = await supabase.auth.signOut();
    if (!error) location.href = '/';
  });
});

supabase.auth.onAuthStateChange((_event, session) => queueMicrotask(() => renderAccountNavigation(session)));
const { data: { session } } = await supabase.auth.getSession();
await renderAccountNavigation(session);
