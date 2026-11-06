create index if not exists business_notification_deliveries_customer_idx
  on public.business_notification_deliveries(customer_id,created_at desc)
  where customer_id is not null;
