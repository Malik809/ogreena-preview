const assert=require('node:assert');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

const auth=read('auth/index.html'),authJs=read('auth/owner-auth.js'),authCss=read('auth/auth.css');
assert.match(auth,/Phone number \(optional\)/);
assert.match(auth,/Welcome to Ogreena!/);
assert.match(auth,/tel:\+15104729327/);
assert.match(auth,/messages\/\?service=general-inquiry/);
assert.match(auth,/id="requestServices"/);
assert.match(authJs,/phone: values\.phone\?\.trim\(\) \|\| null/);
assert.match(authJs,/SIGNUP_WELCOME_KEY/);
assert.match(authCss,/signup-welcome-actions/);

const order=read('service-order.js'),service=read('service.js'),page=read('services/water-restoration/index.html');
assert.match(order,/slug:'water-restoration'/);
assert.match(service,/'water-restoration':/);
assert.match(service,/Water extraction from accessible affected areas/);
assert.doesNotMatch(service,/24\/7 emergency response[^,]*available/i);
assert.match(page,/<link rel="canonical" href="https:\/\/ogreena\.com\/services\/water-restoration\/">/);
assert.match(page,/<meta name="description" content="Bay Area water restoration estimates/);
assert.match(read('sitemap.xml'),/https:\/\/ogreena\.com\/services\/water-restoration\//);
assert.match(read('supabase/migrations/20261118173000_add_water_restoration_service.sql'),/on conflict\(id\) do update/);

const notification=read('supabase/migrations/20261117213000_messenger_office_email_notifications.sql');
assert.match(notification,/recipient_email.*office@ogreena\.com/s);
assert.match(notification,/customer_message_notifications_enabled boolean not null default false/);
assert.match(notification,/on conflict\(event_type,source_id,recipient_email\) do nothing/);
console.log('signup and Water Restoration checks passed');
