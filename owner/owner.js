import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '../auth/supabase-config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
const denied = document.querySelector('#deniedPanel');
const dashboard = document.querySelector('#ownerDashboard');
const status = document.querySelector('#ownerStatus');

async function countRows(table) {
  const result = await supabase.from(table).select('id', { count: 'exact', head: true });
  return result.error ? 'Not configured' : (result.count ?? 0);
}

document.querySelector('#signOut').addEventListener('click', async () => { await supabase.auth.signOut(); location.href = '../auth/?mode=signin'; });
const { data: { user }, error: userError } = await supabase.auth.getUser();
if (userError || !user) {
  status.textContent = 'Sign in with an authorized owner account to continue.';
} else {
  const { data: roleRow } = await supabase.from('user_roles').select('role').eq('user_id', user.id).single();
  if (roleRow?.role !== 'owner') {
    status.textContent = 'This account is not authorized as an owner. Owner access is never granted from an email address alone.';
  } else {
    denied.hidden = true; dashboard.hidden = false;
    const [roles, requests, appointments, messages, products, content, payments] = await Promise.all([
      supabase.from('user_roles').select('role'), supabase.from('service_requests').select('id', { count: 'exact', head: true }),
      countRows('appointments'), countRows('messages'),
      supabase.from('products').select('id', { count: 'exact', head: true }), supabase.from('website_content').select('content_key', { count: 'exact', head: true }),
      supabase.from('payment_settings').select('provider,payments_enabled,product_payments_enabled,service_payments_enabled').single()
    ]);
    const rows = roles.data || [];
    document.querySelector('#customerCount').textContent = rows.filter(row => row.role === 'customer').length;
    document.querySelector('#employeeCount').textContent = rows.filter(row => row.role === 'employee').length;
    document.querySelector('#requestCount').textContent = requests.count ?? 0;
    document.querySelector('#appointmentCount').textContent = appointments;
    document.querySelector('#messageCount').textContent = messages;
    document.querySelector('#productCount').textContent = products.count ?? 0;
    document.querySelector('#contentCount').textContent = `${content.count ?? 0} managed content records`;
    const p = payments.data;
    document.querySelector('#paymentState').textContent = p ? `Provider: ${p.provider}. Payments: ${p.payments_enabled ? 'enabled' : 'disabled'}.` : 'Payment settings unavailable.';
  }
}
