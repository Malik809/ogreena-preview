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

function renderAccountNavigation(session) {
  const signedIn = Boolean(session?.user);
  document.querySelectorAll('[data-auth-guest]').forEach(element => setVisible(element, !signedIn));
  document.querySelectorAll('[data-auth-user],[data-auth-signout]').forEach(element => setVisible(element, signedIn));
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
renderAccountNavigation(session);
