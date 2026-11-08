-- Route all business alerts to Ogreena's official office mailbox and dispatch
-- from the database outbox, independent of any signed-in browser session.
create extension if not exists pg_net with schema extensions;

alter table public.business_notification_deliveries
  drop constraint if exists business_notification_deliveries_event_type_check;
alter table public.business_notification_deliveries
  add constraint business_notification_deliveries_event_type_check
  check (event_type in ('customer_registration','customer_question','customer_message','service_request'));

alter table public.business_notification_deliveries
  drop constraint if exists business_notification_deliveries_dashboard_path_check;
alter table public.business_notification_deliveries
  add constraint business_notification_deliveries_dashboard_path_check
  check (dashboard_path in ('/owner/#operations:customers','/owner/#operations:requests','/owner/#operations:messages'));

alter table public.business_notification_deliveries
  alter column recipient_email set default 'office@ogreena.com';
alter table public.business_notification_deliveries
  add column if not exists customer_email text;

update public.business_notification_deliveries
set recipient_email='office@ogreena.com', updated_at=now()
where recipient_email='far.i@ogreena.com' and status in ('pending','failed');

create or replace function private.enqueue_customer_registration_notification()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  insert into public.business_notification_deliveries(
    event_type,source_id,recipient_email,customer_id,customer_name,customer_email,
    request_type,summary,dashboard_path
  ) values (
    'customer_registration',new.id,'office@ogreena.com',new.id,
    coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'),''),'New account'),
    lower(trim(coalesce(new.email,''))),
    'New customer registration',
    'Signed up ' || to_char(new.created_at at time zone 'America/Los_Angeles','Mon DD, YYYY HH12:MI AM') ||
      ' PT · ' || case when new.email_confirmed_at is null then 'Unverified' else 'Verified' end,
    '/owner/#operations:customers'
  ) on conflict(event_type,source_id,recipient_email) do nothing;
  return new;
end;
$$;

revoke all on function private.enqueue_customer_registration_notification() from public,anon,authenticated;
drop trigger if exists auth_users_enqueue_business_registration_notification on auth.users;
create trigger auth_users_enqueue_business_registration_notification
after insert on auth.users
for each row execute function private.enqueue_customer_registration_notification();

create or replace function private.enqueue_service_request_notification()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  profile_name text;
  account_email text;
begin
  select p.display_name,u.email into profile_name,account_email
  from auth.users u left join public.profiles p on p.id=u.id where u.id=new.customer_id;
  insert into public.business_notification_deliveries(
    event_type,source_id,recipient_email,customer_id,customer_name,customer_email,
    request_type,summary,dashboard_path
  ) values (
    'service_request',new.id,'office@ogreena.com',new.customer_id,
    coalesce(nullif(trim(new.customer_name),''),nullif(trim(profile_name),''),'Customer'),
    lower(trim(coalesce(new.customer_email,account_email,''))),
    coalesce(nullif(trim(new.service_slug),''),'Service request'),
    left(coalesce(nullif(trim(new.details),''),nullif(trim(new.summary),''),'New service request'),240),
    '/owner/#operations:requests'
  ) on conflict(event_type,source_id,recipient_email) do nothing;
  return new;
end;
$$;

revoke all on function private.enqueue_service_request_notification() from public,anon,authenticated;

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
    select exists(select 1 from public.user_roles where user_id=new.sender_id and role='customer'::public.account_role)
      into is_customer;
    conversation_customer := new.sender_id;
    select service_slug into conversation_service from public.service_requests where id=new.request_id;
  end if;
  if not coalesce(is_customer,false) then return new; end if;

  select p.display_name,u.email into profile_name,account_email
  from auth.users u left join public.profiles p on p.id=u.id where u.id=conversation_customer;
  notification_type := case when conversation_service='general-inquiry' then 'customer_question' else 'customer_message' end;
  insert into public.business_notification_deliveries(
    event_type,source_id,recipient_email,customer_id,customer_name,customer_email,
    request_type,summary,dashboard_path
  ) values (
    notification_type,new.id,'office@ogreena.com',conversation_customer,
    coalesce(nullif(trim(profile_name),''),'Customer'),lower(trim(coalesce(account_email,''))),
    case when notification_type='customer_question' then 'Customer question' else coalesce(nullif(trim(conversation_service),''),'Customer message') end,
    left(coalesce(nullif(trim(new.body),''),'Customer sent an attachment'),240),
    '/owner/#operations:messages'
  ) on conflict(event_type,source_id,recipient_email) do nothing;
  return new;
end;
$$;

revoke all on function private.enqueue_customer_message_notification() from public,anon,authenticated;

create or replace function private.dispatch_business_notification()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
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
drop trigger if exists business_notification_deliveries_dispatch on public.business_notification_deliveries;
create trigger business_notification_deliveries_dispatch
after insert on public.business_notification_deliveries
for each row execute function private.dispatch_business_notification();
