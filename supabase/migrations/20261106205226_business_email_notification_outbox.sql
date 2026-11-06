-- Private, deduplicated outbox for customer service-request and message email
-- notifications. Provider delivery happens in an Edge Function; dashboard
-- records remain the system of record under their existing RLS policies.

create table if not exists public.business_notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in ('service_request','customer_message')),
  source_id uuid not null,
  recipient_email text not null default 'far.i@ogreena.com',
  customer_id uuid references auth.users(id) on delete set null,
  customer_name text not null,
  request_type text not null,
  summary text not null,
  dashboard_path text not null check (dashboard_path in ('/owner/#operations:requests','/owner/#operations:messages')),
  status text not null default 'pending' check (status in ('pending','processing','sent','failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  provider text,
  provider_message_id text,
  last_error text,
  available_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  unique(event_type,source_id,recipient_email)
);

create index if not exists business_notification_delivery_queue_idx
  on public.business_notification_deliveries(status,available_at,created_at)
  where status in ('pending','failed');

alter table public.business_notification_deliveries enable row level security;
revoke all on table public.business_notification_deliveries from anon,authenticated;
grant select on table public.business_notification_deliveries to authenticated;

drop policy if exists business_notification_deliveries_owner_read on public.business_notification_deliveries;
create policy business_notification_deliveries_owner_read
on public.business_notification_deliveries for select to authenticated
using ((select private.is_owner()));

create or replace function private.enqueue_service_request_notification()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  profile_name text;
begin
  select display_name into profile_name from public.profiles where id=new.customer_id;
  insert into public.business_notification_deliveries(
    event_type,source_id,customer_id,customer_name,request_type,summary,dashboard_path
  ) values (
    'service_request',new.id,new.customer_id,
    coalesce(nullif(trim(new.customer_name),''),nullif(trim(profile_name),''),'Customer'),
    coalesce(nullif(trim(new.service_slug),''),'Service request'),
    left(coalesce(nullif(trim(new.details),''),nullif(trim(new.summary),''),'New service request'),240),
    '/owner/#operations:requests'
  ) on conflict(event_type,source_id,recipient_email) do nothing;
  return new;
end;
$$;

revoke execute on function private.enqueue_service_request_notification() from public,anon,authenticated;
drop trigger if exists service_requests_enqueue_business_notification on public.service_requests;
create trigger service_requests_enqueue_business_notification
after insert on public.service_requests
for each row execute function private.enqueue_service_request_notification();

create or replace function private.enqueue_customer_message_notification()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  conversation_customer uuid;
  conversation_service text;
  conversation_kind text;
  profile_name text;
  is_customer boolean;
begin
  if new.conversation_id is not null then
    select customer_id,service_slug,participant_kind
      into conversation_customer,conversation_service,conversation_kind
    from public.service_conversations where id=new.conversation_id;
    is_customer := new.sender_id=conversation_customer and conversation_kind in ('customer','guest');
  else
    select exists(select 1 from public.user_roles where user_id=new.sender_id and role='customer'::public.account_role)
      into is_customer;
    conversation_customer := new.sender_id;
    select service_slug into conversation_service from public.service_requests where id=new.request_id;
  end if;
  if not coalesce(is_customer,false) then return new; end if;

  select display_name into profile_name from public.profiles where id=conversation_customer;
  insert into public.business_notification_deliveries(
    event_type,source_id,customer_id,customer_name,request_type,summary,dashboard_path
  ) values (
    'customer_message',new.id,conversation_customer,
    coalesce(nullif(trim(profile_name),''),'Customer'),
    coalesce(nullif(trim(conversation_service),''),'Customer message'),
    left(coalesce(nullif(trim(new.body),''),'Customer sent an attachment'),240),
    '/owner/#operations:messages'
  ) on conflict(event_type,source_id,recipient_email) do nothing;
  return new;
end;
$$;

revoke execute on function private.enqueue_customer_message_notification() from public,anon,authenticated;
drop trigger if exists messages_enqueue_business_notification on public.messages;
create trigger messages_enqueue_business_notification
after insert on public.messages
for each row execute function private.enqueue_customer_message_notification();

create or replace function public.claim_business_notifications(batch_size integer default 10)
returns setof public.business_notification_deliveries
language sql
security invoker
set search_path=''
as $$
  with claimed as (
    select id from public.business_notification_deliveries
    where status in ('pending','failed') and available_at<=now() and attempt_count<5
    order by created_at
    for update skip locked
    limit least(greatest(batch_size,1),25)
  )
  update public.business_notification_deliveries delivery set
    status='processing',attempt_count=delivery.attempt_count+1,updated_at=now(),last_error=null
  from claimed where delivery.id=claimed.id
  returning delivery.*;
$$;

revoke all on function public.claim_business_notifications(integer) from public,anon,authenticated;
grant execute on function public.claim_business_notifications(integer) to service_role;
