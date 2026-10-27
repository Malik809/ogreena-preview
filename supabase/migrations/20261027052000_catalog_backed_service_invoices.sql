-- Catalog-backed invoice snapshots connect every current and future service price
-- to owner-approved invoices without changing historical invoice amounts.
begin;

alter table public.estimates
  add column if not exists service_price_item_id text references public.service_price_items(id) on delete set null,
  add column if not exists service_slug text,
  add column if not exists catalog_item_name text,
  add column if not exists catalog_unit_price_cents integer,
  add column if not exists catalog_pricing_type text,
  add column if not exists catalog_unit_label text,
  add column if not exists quantity numeric(10,2),
  add column if not exists catalog_price_locked boolean not null default false;

alter table public.estimates drop constraint if exists estimates_catalog_snapshot_check;
alter table public.estimates add constraint estimates_catalog_snapshot_check check (
  service_price_item_id is null or (
    service_slug is not null
    and catalog_item_name is not null
    and catalog_unit_price_cents is not null and catalog_unit_price_cents >= 0
    and catalog_pricing_type in ('fixed','hourly','per_square_foot','per_unit')
    and catalog_unit_label is not null
    and quantity is not null and quantity > 0
  )
);

create index if not exists estimates_service_price_item_idx
  on public.estimates (service_price_item_id, created_at desc)
  where service_price_item_id is not null;

create or replace function private.snapshot_service_invoice_catalog_price()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
declare
  catalog public.service_price_items%rowtype;
  conversation_slug text;
  request_price_id text;
  calculated_amount bigint;
begin
  if tg_op = 'UPDATE' and (
    new.service_price_item_id is distinct from old.service_price_item_id
    or new.service_slug is distinct from old.service_slug
    or new.catalog_item_name is distinct from old.catalog_item_name
    or new.catalog_unit_price_cents is distinct from old.catalog_unit_price_cents
    or new.catalog_pricing_type is distinct from old.catalog_pricing_type
    or new.catalog_unit_label is distinct from old.catalog_unit_label
    or new.quantity is distinct from old.quantity
    or new.catalog_price_locked is distinct from old.catalog_price_locked
    or new.amount_cents is distinct from old.amount_cents
  ) and not private.is_owner() then
    raise exception 'Only the verified owner can change invoice pricing';
  end if;

  if new.service_price_item_id is not null and (
    tg_op = 'INSERT'
    or new.service_price_item_id is distinct from old.service_price_item_id
    or new.quantity is distinct from old.quantity
  ) then
    select * into catalog
    from public.service_price_items
    where id = new.service_price_item_id and active;
    if not found then raise exception 'Published service price is not available'; end if;

    if new.conversation_id is not null then
      select service_slug into conversation_slug
      from public.service_conversations where id = new.conversation_id;
      if conversation_slug is distinct from catalog.service_slug then
        raise exception 'Service price does not match this conversation';
      end if;
    end if;

    if new.request_id is not null then
      select service_price_item_id into request_price_id
      from public.service_requests where id = new.request_id;
      if request_price_id is not null and request_price_id is distinct from catalog.id then
        raise exception 'Service price does not match this request';
      end if;
    end if;

    new.quantity := coalesce(new.quantity, 1);
    if new.quantity <= 0 then raise exception 'Invoice quantity must be greater than zero'; end if;
    calculated_amount := round(catalog.price_cents * new.quantity);
    if calculated_amount < 50 or calculated_amount > 99999999 then
      raise exception 'Calculated invoice amount is outside the supported range';
    end if;

    new.service_slug := catalog.service_slug;
    new.catalog_item_name := catalog.name;
    new.catalog_unit_price_cents := catalog.price_cents;
    new.catalog_pricing_type := catalog.pricing_type;
    new.catalog_unit_label := catalog.unit_label;
    new.amount_cents := calculated_amount::integer;
    new.catalog_price_locked := true;
  end if;

  if new.conversation_id is not null and new.status in ('sent','accepted')
     and new.service_price_item_id is null
     and (tg_op = 'INSERT' or new.status is distinct from old.status) then
    raise exception 'A published service price is required for payable Messenger invoices';
  end if;
  return new;
end $$;

revoke all on function private.snapshot_service_invoice_catalog_price() from public, anon, authenticated;
drop trigger if exists estimates_snapshot_catalog_price on public.estimates;
create trigger estimates_snapshot_catalog_price
before insert or update on public.estimates
for each row execute function private.snapshot_service_invoice_catalog_price();

comment on column public.estimates.catalog_unit_price_cents is
  'Immutable-at-creation catalog price snapshot used to preserve historical invoices.';

commit;
