create or replace function public.product_checkout_is_enabled()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    payments_enabled
    and product_payments_enabled
    and live_activation_approved,
    false
  )
  from public.payment_settings
  limit 1
$$;

revoke all on function public.product_checkout_is_enabled() from public;
grant execute on function public.product_checkout_is_enabled() to anon, authenticated;

comment on function public.product_checkout_is_enabled() is
  'Returns only the canonical public product-checkout authorization state; exposes no payment credentials or settings.';
