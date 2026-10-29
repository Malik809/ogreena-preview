alter table public.products
  add column if not exists square_payment_link text;

alter table public.products
  drop constraint if exists products_square_payment_link_check;

alter table public.products
  add constraint products_square_payment_link_check check (
    square_payment_link is null
    or square_payment_link ~ '^https://square\.link/u/[A-Za-z0-9]+/?$'
    or square_payment_link ~ '^https://checkout\.square\.site/merchant/[A-Za-z0-9_-]+/order/[A-Za-z0-9_-]+/?$'
  );

comment on column public.products.square_payment_link is
  'Owner-managed Square-hosted checkout URL. Public checkout activation remains controlled separately.';

update public.products
set square_payment_link = case id
  when 'og-trinity-32oz' then 'https://square.link/u/Q0rHcOP5'
  when 'og-floor-32oz' then 'https://square.link/u/sTOZ84R7'
  when 'og-t-fresche-32oz' then 'https://square.link/u/JW1cV72R'
  when 'og-trinity-gallon' then 'https://square.link/u/Rh2ajlwu'
  when 'og-floor-gallon' then 'https://square.link/u/GfnXsOiP'
  else square_payment_link
end
where id in ('og-trinity-32oz','og-floor-32oz','og-t-fresche-32oz','og-trinity-gallon','og-floor-gallon')
  and square_payment_link is null;
