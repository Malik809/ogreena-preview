-- Customer-initiated email ledger. Automatic Messenger notification delivery
-- remains controlled independently by private.business_notification_settings.

alter table public.messages drop constraint if exists messages_message_type_check;
alter table public.messages add constraint messages_message_type_check
  check (message_type in ('text','photo','estimate','appointment','email'));

drop trigger if exists messages_enqueue_business_notification on public.messages;
create trigger messages_enqueue_business_notification
after insert on public.messages
for each row when (new.message_type<>'email')
execute function private.enqueue_customer_message_notification();

create table if not exists public.customer_email_inquiries (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id) on delete cascade,
  submission_id uuid not null,
  subject text not null check (char_length(subject) between 2 and 120),
  message_id uuid references public.messages(id) on delete set null,
  status text not null default 'processing' check (status in ('processing','sent','failed')),
  provider_message_id text,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(customer_id,submission_id)
);

alter table public.customer_email_inquiries enable row level security;
revoke all on table public.customer_email_inquiries from public,anon,authenticated;
grant select,insert,update on table public.customer_email_inquiries to service_role;
create index if not exists customer_email_inquiries_rate_idx
  on public.customer_email_inquiries(customer_id,created_at desc);

create or replace function public.claim_customer_email_inquiry(
  p_customer_id uuid,p_submission_id uuid,p_subject text
) returns table(inquiry_id uuid,is_new boolean)
language plpgsql security definer set search_path=''
as $$
declare existing_id uuid;existing_status text;existing_updated_at timestamptz;created_id uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_customer_id::text,0));
  select id,status,updated_at into existing_id,existing_status,existing_updated_at from public.customer_email_inquiries
    where customer_id=p_customer_id and submission_id=p_submission_id;
  if existing_id is not null then
    if existing_status='failed' or (existing_status='processing' and existing_updated_at<now()-interval '2 minutes') then
      update public.customer_email_inquiries set status='processing',last_error=null,updated_at=now() where id=existing_id;
      return query select existing_id,true;
      return;
    end if;
    return query select existing_id,false;
    return;
  end if;
  if (select count(*) from public.customer_email_inquiries
      where customer_id=p_customer_id and created_at>now()-interval '1 hour')>=5 then
    raise exception 'CUSTOMER_EMAIL_RATE_LIMIT';
  end if;
  insert into public.customer_email_inquiries(customer_id,submission_id,subject)
    values(p_customer_id,p_submission_id,p_subject) returning id into created_id;
  return query select created_id,true;
end;
$$;

revoke all on function public.claim_customer_email_inquiry(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.claim_customer_email_inquiry(uuid,uuid,text) to service_role;

comment on table public.customer_email_inquiries is
  'Private server-managed idempotency and rate-limit ledger for authenticated customer-initiated emails.';
