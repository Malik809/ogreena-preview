begin;

do $$
begin
  if exists (select 1 from public.estimates where catalog_item_name is not null) then
    raise exception 'Rollback stopped: catalog-backed invoice history exists and must be preserved';
  end if;
end $$;

drop trigger if exists estimates_snapshot_catalog_price on public.estimates;
drop function if exists private.snapshot_service_invoice_catalog_price();
drop index if exists public.estimates_service_price_item_idx;
alter table public.estimates drop constraint if exists estimates_catalog_snapshot_check;
alter table public.estimates
  drop column if exists catalog_price_locked,
  drop column if exists quantity,
  drop column if exists catalog_unit_label,
  drop column if exists catalog_pricing_type,
  drop column if exists catalog_unit_price_cents,
  drop column if exists catalog_item_name,
  drop column if exists service_slug,
  drop column if exists service_price_item_id;

commit;
