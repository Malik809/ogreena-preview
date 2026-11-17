-- The claim RPC must read a private feature guard while remaining callable only
-- by service_role. All public/authenticated execute grants remain revoked.
create or replace function public.claim_business_notifications(batch_size integer default 10)
returns setof public.business_notification_deliveries
language sql
security definer
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
