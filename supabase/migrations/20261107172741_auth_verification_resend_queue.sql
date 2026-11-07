-- A private, deduplicated queue for the owner-authorized confirmation-email
-- recovery campaign. One message is submitted every three minutes (20/hour),
-- leaving ten of Supabase Auth's 30 hourly email slots for normal customers.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

create table if not exists private.auth_verification_resend_queue (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  status text not null default 'queued'
    check (status in ('queued','sending','sent','delivered','bounced','failed','verified','suppressed')),
  provider_status text,
  http_request_id bigint unique,
  attempt_count integer not null default 0 check (attempt_count between 0 and 2),
  available_at timestamptz not null default now(),
  sent_at timestamptz,
  delivered_at timestamptz,
  verified_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table private.auth_verification_resend_queue enable row level security;
revoke all on table private.auth_verification_resend_queue from public, anon, authenticated;

create index if not exists auth_verification_resend_queue_work_idx
  on private.auth_verification_resend_queue(status, available_at, created_at);

create or replace function private.process_auth_verification_resend_queue()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target private.auth_verification_resend_queue%rowtype;
  request_id bigint;
  accepted_count integer;
  failed_count integer;
begin
  -- Verification is authoritative in auth.users. This keeps the queue and the
  -- owner directory synchronized without manually confirming any account.
  update private.auth_verification_resend_queue q
  set status='verified', provider_status='verified', verified_at=u.email_confirmed_at,
      last_error=null, updated_at=now()
  from auth.users u
  where u.id=q.user_id and u.email_confirmed_at is not null
    and q.status in ('queued','sending','sent','delivered');

  -- pg_net is asynchronous. Reconcile the previous request before claiming
  -- another address so only one message can be in flight at a time.
  update private.auth_verification_resend_queue q
  set status=case when r.status_code between 200 and 299 and r.error_msg is null then 'sent' else 'failed' end,
      provider_status=case when r.status_code between 200 and 299 and r.error_msg is null then 'accepted' else 'failed' end,
      sent_at=case when r.status_code between 200 and 299 and r.error_msg is null then coalesce(q.sent_at,r.created) else q.sent_at end,
      last_error=case when r.status_code between 200 and 299 and r.error_msg is null then null else left(coalesce(r.error_msg,r.content,'Authentication email request failed'),1000) end,
      updated_at=now()
  from net._http_response r
  where q.status='sending' and q.http_request_id=r.id;

  select count(*) into failed_count
  from private.auth_verification_resend_queue where status='failed';
  if failed_count > 0 then
    return jsonb_build_object('ok',false,'stopped',true,'reason','A provider or authentication request failed','failed',failed_count);
  end if;

  -- Do not submit a second message while pg_net is still processing one.
  if exists(select 1 from private.auth_verification_resend_queue where status='sending') then
    return jsonb_build_object('ok',true,'waiting',true);
  end if;

  select * into target
  from private.auth_verification_resend_queue
  where status='queued' and available_at<=now()
  order by created_at, user_id
  for update skip locked
  limit 1;

  if target.user_id is null then
    select count(*) into accepted_count from private.auth_verification_resend_queue where status='sent';
    return jsonb_build_object('ok',true,'complete',true,'sent',accepted_count);
  end if;

  -- Recheck immediately before sending so a recently verified account is never
  -- emailed by the recovery campaign.
  if exists(select 1 from auth.users where id=target.user_id and email_confirmed_at is not null) then
    update private.auth_verification_resend_queue
    set status='verified', provider_status='verified', verified_at=now(), updated_at=now()
    where user_id=target.user_id;
    return jsonb_build_object('ok',true,'skipped_verified',true);
  end if;

  update private.auth_verification_resend_queue
  set status='sending', attempt_count=attempt_count+1, updated_at=now()
  where user_id=target.user_id;

  request_id := net.http_post(
    url := 'https://mhhjzifeaofgskimvuom.supabase.co/auth/v1/resend?redirect_to=https%3A%2F%2Fogreena.com%2Fauth%2F',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'apikey','sb_publishable_13onHaeoGy3uEVnezcGZCQ_RtSzNOlM'
    ),
    body := jsonb_build_object('type','signup','email',target.email),
    timeout_milliseconds := 10000
  );

  update private.auth_verification_resend_queue
  set http_request_id=request_id, updated_at=now()
  where user_id=target.user_id;

  return jsonb_build_object('ok',true,'queued_request',request_id);
exception when others then
  if target.user_id is not null then
    update private.auth_verification_resend_queue
    set status='failed', provider_status='failed', last_error=left(sqlerrm,1000), updated_at=now()
    where user_id=target.user_id;
  end if;
  return jsonb_build_object('ok',false,'stopped',true,'error',sqlerrm);
end;
$$;

revoke all on function private.process_auth_verification_resend_queue() from public, anon, authenticated;

-- Seed only customer-role accounts that remain unconfirmed and whose addresses
-- and profile names do not match the project's established test-data markers.
insert into private.auth_verification_resend_queue(user_id,email)
select u.id, lower(trim(u.email))
from auth.users u
join public.user_roles r on r.user_id=u.id and r.role='customer'
left join public.profiles p on p.id=u.id
where u.email_confirmed_at is null
  and u.email is not null
  and u.email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'
  and not (
    coalesce(u.email,'') ~* '(^|[+._ -])(test|demo|sample|example|invalid|validation|playwright|mock)([+._@ -]|$)'
    or coalesce(p.display_name,'') ~* '(^|[+._ -])(test|demo|sample|example|invalid|validation|playwright|mock)([+._@ -]|$)'
  )
on conflict (user_id) do nothing;

select cron.schedule(
  'ogreena-auth-verification-resend',
  '*/3 * * * *',
  'select private.process_auth_verification_resend_queue();'
);
