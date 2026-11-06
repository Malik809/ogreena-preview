const assert=require('node:assert/strict');
const fs=require('node:fs');

const html=fs.readFileSync('auth/index.html','utf8');
const js=fs.readFileSync('auth/owner-auth.js','utf8');
const css=fs.readFileSync('auth/auth.css','utf8');
const owner=fs.readFileSync('owner/owner.js','utf8');
const migration=fs.readFileSync('supabase/migrations/20261106161353_multi_service_customer_requests.sql','utf8');

assert.match(html,/Service Requests/);
assert.match(html,/id="requestCategories"/);
assert.match(html,/Send Request to Ogreena/);
assert.ok(html.indexOf('Ogreena Products') < html.indexOf('Service Requests'));
assert.ok(html.indexOf('Service Requests') < html.indexOf('Service history'));
assert.match(js,/service_price_items/);
assert.match(js,/from\('services'\)/);
assert.match(js,/selectedRequestItems/);
assert.match(js,/create_multi_service_request/);
assert.match(js,/request_address_street/);
assert.match(js,/requested_date/);
assert.match(owner,/service_request_items/);
assert.match(owner,/selected services/);
assert.match(css,/service-category-grid/);
assert.match(css,/@media\(max-width:720px\)/);
assert.match(migration,/create table if not exists public\.service_request_items/);
assert.match(migration,/enable row level security/);
assert.match(migration,/customer_id = \(select auth\.uid\(\)\)/);
assert.match(migration,/private\.create_multi_service_request_internal[\s\S]+security definer/);
assert.match(migration,/public\.create_multi_service_request[\s\S]+security invoker/);
assert.match(migration,/actor uuid := \(select auth\.uid\(\)\)/);
assert.match(migration,/revoke all on function public\.create_multi_service_request/);
assert.doesNotMatch(js,/create_multi_service_request[\s\S]{0,600}create-checkout-session/);

console.log('Multi-service customer request UI, server validation, owner display, and RLS checks PASS');
