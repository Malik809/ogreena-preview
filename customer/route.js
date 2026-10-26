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
  const [roleResult, applicationResult, employeeRequestResult] = await Promise.all([
    supabase.from('user_roles').select('role').eq('user_id', user.id).single(),
    supabase.from('job_applications').select('status').eq('user_id', user.id).maybeSingle(),
    supabase.from('employee_access_requests').select('status').eq('user_id', user.id).maybeSingle()
  ]);
  const role = roleResult.data?.role;
  if (role === 'owner') location.replace('../owner/');
  else if (role === 'employee') location.replace('../employee/');
  else if (applicationResult.data) location.replace('../careers-account/?type=applicant&mode=signin');
  else if (employeeRequestResult.data) location.replace('../careers-account/?type=employee&mode=signin');
  else location.replace('../auth/');
}
