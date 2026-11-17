-- Complete customer-message office email notifications with authenticated
-- conversation deep links and bounded scheduled retries. Existing failed rows
-- are intentionally excluded from automatic retry pending owner approval.

create extension if not exists pg_cron;

alter table public.business_notification_deliveries
  add column if not exists conversation_id uuid references public.service_conversations(id) on delete set null,
  add column if not exists message_created_at timestamptz,
  add column if not exists retry_allowed boolean not null default true,
  add column if not exists delivery_mode text not null default 'automatic'
    check (delivery_mode in ('automatic','controlled_test'));

create table if not exists private.business_notification_settings (
  id boolean primary key default true check (id),
  customer_message_notifications_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
revoke all on table private.business_notification_settings from public,anon,authenticated;
insert into private.business_notification_settings(id,customer_message_notifications_enabled)
values (true,false)
on conflict(id) do update set customer_message_notifications_enabled=false,updated_at=now();

update public.business_notification_deliveries
set retry_allowed=false, updated_at=now()
where status='failed';

create index if not exists business_notification_delivery_retry_idx
  on public.business_notification_deliveries(available_at,created_at)
  where status='failed' and retry_allowed=true and attempt_count<5;

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
  account_email text;
  is_customer boolean;
  notification_type text;
begin
  if new.conversation_id is not null then
    select customer_id,service_slug,participant_kind
      into conversation_customer,conversation_service,conversation_kind
    from public.service_conversations where id=new.conversation_id;
    is_customer := new.sender_id=conversation_customer and conversation_kind in ('customer','guest');
  else
    select exists(
      select 1 from public.user_roles
      where user_id=new.sender_id and role='customer'::public.account_role
    ) into is_customer;
    conversation_customer := new.sender_id;
    select service_slug into conversation_service from public.service_requests where id=new.request_id;
  end if;
  if not coalesce(is_customer,false) then return new; end if;

  select p.display_name,u.email into profile_name,account_email
  from auth.users u left join public.profiles p on p.id=u.id where u.id=conversation_customer;
  notification_type := case when conversation_service='general-inquiry' then 'customer_question' else 'customer_message' end;
  insert into public.business_notification_deliveries(
    event_type,source_id,recipient_email,customer_id,customer_name,customer_email,
    request_type,summary,dashboard_path,conversation_id,message_created_at,retry_allowed,delivery_mode
  ) values (
    notification_type,new.id,'office@ogreena.com',conversation_customer,
    coalesce(nullif(trim(profile_name),''),'Customer'),lower(trim(coalesce(account_email,''))),
    case when notification_type='customer_question' then 'Customer question' else coalesce(nullif(trim(conversation_service),''),'Customer message') end,
    left(coalesce(nullif(trim(new.body),''),'Customer sent an attachment'),240),
    '/owner/#operations:messages',new.conversation_id,new.created_at,true,'automatic'
  ) on conflict(event_type,source_id,recipient_email) do nothing;
  return new;
end;
$$;

revoke all on function private.enqueue_customer_message_notification() from public,anon,authenticated;

create or replace function public.claim_business_notifications(batch_size integer default 10)
returns setof public.business_notification_deliveries
language sql
security invoker
set search_path=''
as $$
  with claimed as (
    select id from public.business_notification_deliveries
    where (
      status='pending'
      or (status='failed' and retry_allowed=true)
    )
      and available_at<=now()
      and attempt_count<5
      and (
        event_type not in ('customer_message','customer_question')
        or delivery_mode='controlled_test'
        or exists (
          select 1 from private.business_notification_settings
          where id=true and customer_message_notifications_enabled=true
        )
      )
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

create or replace function private.retry_business_notifications()
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  delivery record;
begin
  update public.business_notification_deliveries
  set status='failed',last_error='Notification worker timed out before recording a result.',
      available_at=now(),updated_at=now()
  where status='processing' and retry_allowed=true and attempt_count<5
    and updated_at<now()-interval '15 minutes';

  for delivery in
    select id from public.business_notification_deliveries
    where status='failed' and retry_allowed=true and attempt_count<5 and available_at<=now()
      and (
        event_type not in ('customer_message','customer_question')
        or delivery_mode='controlled_test'
        or exists (
          select 1 from private.business_notification_settings
          where id=true and customer_message_notifications_enabled=true
        )
      )
    order by available_at,created_at
    limit 25
  loop
    perform net.http_post(
      url := 'https://mhhjzifeaofgskimvuom.supabase.co/functions/v1/send-business-notifications',
      headers := jsonb_build_object('Content-Type','application/json'),
      body := jsonb_build_object('source','database_retry','delivery_id',delivery.id),
      timeout_milliseconds := 10000
    );
  end loop;
end;
$$;

revoke all on function private.retry_business_notifications() from public,anon,authenticated;

create or replace function private.dispatch_business_notification()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.event_type in ('customer_message','customer_question')
    and new.delivery_mode='automatic'
    and not exists (
      select 1 from private.business_notification_settings
      where id=true and customer_message_notifications_enabled=true
    )
  then
    return new;
  end if;
  perform net.http_post(
    url := 'https://mhhjzifeaofgskimvuom.supabase.co/functions/v1/send-business-notifications',
    headers := jsonb_build_object('Content-Type','application/json'),
    body := jsonb_build_object('source','database_outbox','delivery_id',new.id),
    timeout_milliseconds := 10000
  );
  return new;
end;
$$;

revoke all on function private.dispatch_business_notification() from public,anon,authenticated;

do $$
declare existing_job bigint;
begin
  select jobid into existing_job from cron.job where jobname='retry-business-notifications';
  if existing_job is not null then perform cron.unschedule(existing_job); end if;
  perform cron.schedule(
    'retry-business-notifications',
    '*/5 * * * *',
    'select private.retry_business_notifications();'
  );
end;
$$;
