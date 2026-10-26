const { createClient } = window.supabase;
const safariSafeAuthLock = async (_name, _acquireTimeout, callback) => callback();
const SUPABASE_URL = 'https://mhhjzifeaofgskimvuom.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_13onHaeoGy3uEVnezcGZCQ_RtSzNOlM';
const SITE_ROOT = location.hostname.endsWith('.github.io') ? '/ogreena-preview/' : '/';
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storage: window.localStorage, storageKey: 'ogreena-auth-session', lock: safariSafeAuthLock }
});
const storedSession = (() => {
  try {
    const value = JSON.parse(window.localStorage.getItem('ogreena-auth-session') || 'null');
    return value?.access_token && value?.user ? value : null;
  } catch {
    return null;
  }
})();

function setVisible(element, visible) {
  if (!element) return;
  element.dataset.authVisible = String(visible);
  element.hidden = !visible;
  element.style.display = visible ? '' : 'none';
}

async function renderAccountNavigation(session) {
  const signedIn = Boolean(session?.user);
  document.querySelectorAll('[data-auth-guest]').forEach(element => setVisible(element, !signedIn));
  document.querySelectorAll('[data-auth-user],[data-auth-signout]').forEach(element => setVisible(element, signedIn));
  document.querySelectorAll('[data-auth-profile]').forEach(element => setVisible(element, false));
  document.querySelectorAll('[data-auth-owner],[data-auth-employee]').forEach(element => setVisible(element, false));
  if (!signedIn) return;
  const { data } = await supabase.from('user_roles').select('role').eq('user_id', session.user.id).single();
  const role = data?.role || 'customer';
  document.querySelectorAll('[data-auth-profile]').forEach(element => {
    element.href = `${SITE_ROOT}customer/`;
    setVisible(element, role !== 'owner');
  });
  document.querySelectorAll('[data-auth-owner]').forEach(element => setVisible(element, role === 'owner'));
  document.querySelectorAll('[data-auth-employee]').forEach(element => setVisible(element, false));
}

document.querySelectorAll('[data-auth-signout]').forEach(element => {
  element.addEventListener('click', async event => {
    event.preventDefault();
    const { error } = await supabase.auth.signOut();
    if (!error) location.href = SITE_ROOT;
  });
});

if (storedSession) renderAccountNavigation(storedSession);
Promise.race([
  supabase.auth.getSession(),
  new Promise(resolve => setTimeout(() => resolve({ data:{ session:storedSession } }), 3000))
]).then(({ data: { session } }) => renderAccountNavigation(session || storedSession));
supabase.auth.onAuthStateChange((event, nextSession) => {
  if (event === 'SIGNED_OUT') {
    document.querySelectorAll('[data-auth-guest]').forEach(element => setVisible(element, true));
    document.querySelectorAll('[data-auth-user],[data-auth-profile],[data-auth-owner],[data-auth-employee],[data-auth-signout]').forEach(element => setVisible(element, false));
  } else if (event === 'SIGNED_IN' && nextSession?.user) {
    document.querySelectorAll('[data-auth-guest]').forEach(element => setVisible(element, false));
    document.querySelectorAll('[data-auth-user],[data-auth-signout]').forEach(element => setVisible(element, true));
    // Read the database role only after the auth callback returns.
    setTimeout(() => renderAccountNavigation(nextSession), 0);
  }
});
