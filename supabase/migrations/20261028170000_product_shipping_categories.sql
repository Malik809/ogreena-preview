alter table public.products
  add column if not exists shipping_category text;

update public.products
set shipping_category = case
  when id in ('og-trinity-gallon', 'og-floor-gallon') then 'gallon'
  when id in ('og-trinity-32oz', 'og-floor-32oz', 'og-t-fresche-32oz') then 'spray_bottle'
  else shipping_category
end
where id in (
  'og-trinity-gallon',
  'og-floor-gallon',
  'og-trinity-32oz',
  'og-floor-32oz',
  'og-t-fresche-32oz'
);

alter table public.products
  drop constraint if exists products_shipping_category_check;

alter table public.products
  add constraint products_shipping_category_check
  check (shipping_category is null or shipping_category in ('spray_bottle', 'gallon'));

comment on column public.products.shipping_category is
  'Owner-controlled server-side category used to select the approved Checkout shipping rate.';

insert into public.website_content (
  content_key,
  content_value,
  draft_value,
  published,
  visible,
  display_order
)
values (
  'product-shipping-settings',
  '{}'::jsonb,
  jsonb_build_object(
    'mode', 'category_flat_rate',
    'coverage', 'us_50_states_dc',
    'includes_alaska_hawaii', true,
    'category_rates_cents', jsonb_build_object('spray_bottle', 400, 'gallon', 800),
    'rates_approved', true,
    'owner_approved', false,
    'production_email_enabled', false,
    'po_boxes', 'pending',
    'territories', 'pending',
    'carriers', jsonb_build_array('USPS', 'UPS', 'FedEx'),
    'packages', '',
    'updated_at', now()
  ),
  false,
  false,
  9999
)
on conflict (content_key) do update
set draft_value = coalesce(public.website_content.draft_value, '{}'::jsonb)
  || jsonb_build_object(
    'mode', 'category_flat_rate',
    'category_rates_cents', jsonb_build_object('spray_bottle', 400, 'gallon', 800),
    'rates_approved', true,
    'owner_approved', false,
    'production_email_enabled', false,
    'updated_at', now()
  );
