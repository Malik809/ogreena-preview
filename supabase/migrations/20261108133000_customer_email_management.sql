-- Owner-controlled customer email queue. Deployment creates no jobs and sends no email.
create table if not exists public.customer_email_jobs (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id) on delete cascade,
  recipient_email text not null,
  email_type text not null check (email_type in ('verification','welcome')),
  status text not null default 'queued'
    check (status in ('queued','sending','sent','delivered','failed','bounced','verified','suppressed','cancelled')),
  requested_by uuid not null references auth.users(id),
  batch_id uuid,
  provider text,
  provider_message_id text,
  attempt_count integer not null default 0 check (attempt_count between 0 and 3),
  available_at timestamptz not null default now(),
  sent_at timestamptz,
  delivered_at timestamptz,
  verified_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.customer_email_jobs enable row level security;
revoke all on table public.customer_email_jobs from public, anon, authenticated;

create index if not exists customer_email_jobs_work_idx
  on public.customer_email_jobs(status, available_at, created_at);
create index if not exists customer_email_jobs_customer_idx
  on public.customer_email_jobs(customer_id, created_at desc);
create index if not exists customer_email_jobs_requested_by_idx
  on public.customer_email_jobs(requested_by, created_at desc);
create unique index if not exists customer_email_jobs_active_dedupe_idx
  on public.customer_email_jobs(customer_id, email_type)
  where status in ('queued','sending');

-- Mirror the pre-existing verification recovery campaign into the dashboard log.
-- This prevents owner-created jobs from duplicating recipients already queued.
insert into public.customer_email_jobs
  (customer_id, recipient_email, email_type, status, requested_by, provider, sent_at, delivered_at, verified_at, last_error, created_at, updated_at)
select q.user_id, q.email, 'verification', q.status,
       coalesce((select ur.user_id from public.user_roles ur where ur.role='owner' order by ur.user_id limit 1), q.user_id),
       'supabase-auth', q.sent_at, q.delivered_at, q.verified_at, q.last_error, q.created_at, q.updated_at
from private.auth_verification_resend_queue q
where not exists (
  select 1 from public.customer_email_jobs j
  where j.customer_id=q.user_id and j.email_type='verification'
    and j.status in ('queued','sending','sent','delivered','verified')
)
on conflict do nothing;

create or replace function private.sync_customer_email_verification_job()
returns trigger
language plpgsql
security invoker
set search_path=''
as $$
begin
  update public.customer_email_jobs
  set status=new.status, provider='supabase-auth', sent_at=new.sent_at,
      delivered_at=new.delivered_at, verified_at=new.verified_at,
      last_error=new.last_error, updated_at=new.updated_at
  where id=(
    select id from public.customer_email_jobs
    where customer_id=new.user_id and email_type='verification'
    order by created_at desc limit 1
  );
  return new;
end;
$$;

drop trigger if exists sync_customer_email_verification_job on private.auth_verification_resend_queue;
create trigger sync_customer_email_verification_job
after update on private.auth_verification_resend_queue
for each row execute function private.sync_customer_email_verification_job();

revoke all on function private.sync_customer_email_verification_job() from public, anon, authenticated;

-- The Edge Function calls this with the service role after its owner check.
-- It reuses the existing 20/hour recovery worker rather than creating a
-- competing authentication-email sender.
create or replace function public.enqueue_auth_verification_resend_service(
  target_user_id uuid,
  target_email text
)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if current_user not in ('service_role','postgres') then
    raise exception 'service role required';
  end if;
  if exists(select 1 from auth.users where id=target_user_id and email_confirmed_at is not null) then
    raise exception 'account is already verified';
  end if;
  insert into private.auth_verification_resend_queue
    (user_id,email,status,provider_status,http_request_id,attempt_count,available_at,sent_at,delivered_at,verified_at,last_error,updated_at)
  values
    (target_user_id,lower(trim(target_email)),'queued',null,null,0,now(),null,null,null,null,now())
  on conflict (user_id) do update set
    email=excluded.email,status='queued',provider_status=null,http_request_id=null,
    attempt_count=0,available_at=now(),sent_at=null,delivered_at=null,
    verified_at=null,last_error=null,updated_at=now();
end;
$$;

revoke all on function public.enqueue_auth_verification_resend_service(uuid,text) from public, anon, authenticated;
grant execute on function public.enqueue_auth_verification_resend_service(uuid,text) to service_role;
