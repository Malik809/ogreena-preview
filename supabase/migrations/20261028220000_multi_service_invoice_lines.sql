create table if not exists public.estimate_line_items (
  id uuid primary key default gen_random_uuid(),
  estimate_id uuid not null references public.estimates(id) on delete cascade,
  service_price_item_id text not null references public.service_price_items(id) on delete restrict,
  service_slug text not null,
  item_name text not null,
  unit_price_cents integer not null check (unit_price_cents >= 0),
  pricing_type text not null,
  unit_label text not null default '',
  quantity numeric(10,2) not null check (quantity > 0),
  line_total_cents integer not null check (line_total_cents >= 50),
  created_at timestamptz not null default now(),
  unique (estimate_id, service_price_item_id)
);

alter table public.estimate_line_items enable row level security;
revoke all on public.estimate_line_items from anon, authenticated;
grant select, insert, update, delete on public.estimate_line_items to authenticated;

create policy estimate_line_items_owner_all on public.estimate_line_items
for all to authenticated using (private.is_owner()) with check (private.is_owner());
create policy estimate_line_items_customer_read on public.estimate_line_items
for select to authenticated using (exists (
  select 1 from public.estimates e where e.id=estimate_id and e.customer_id=(select auth.uid())
));

create or replace function private.snapshot_estimate_line_item()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
declare catalog public.service_price_items%rowtype; estimate_slug text;
begin
  if not private.is_owner() then raise exception 'Only the verified owner can approve invoice lines'; end if;
  select * into catalog from public.service_price_items where id=new.service_price_item_id and active;
  if not found then raise exception 'Published service price is not available'; end if;
  select c.service_slug into estimate_slug from public.estimates e join public.service_conversations c on c.id=e.conversation_id where e.id=new.estimate_id;
  if estimate_slug is distinct from catalog.service_slug then raise exception 'Service price does not match this conversation'; end if;
  new.service_slug:=catalog.service_slug; new.item_name:=catalog.name; new.unit_price_cents:=catalog.price_cents;
  new.pricing_type:=catalog.pricing_type; new.unit_label:=catalog.unit_label;
  new.line_total_cents:=round(catalog.price_cents*new.quantity);
  if new.line_total_cents<50 or new.line_total_cents>99999999 then raise exception 'Invoice line is outside the supported range'; end if;
  return new;
end $$;
revoke all on function private.snapshot_estimate_line_item() from public, anon, authenticated;

create or replace function private.recalculate_estimate_line_total()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
declare target_id uuid; total bigint;
begin
  target_id:=coalesce(new.estimate_id,old.estimate_id);
  select coalesce(sum(line_total_cents),0) into total from public.estimate_line_items where estimate_id=target_id;
  update public.estimates set amount_cents=total::integer,catalog_price_locked=(total>0) where id=target_id;
  return coalesce(new,old);
end $$;
revoke all on function private.recalculate_estimate_line_total() from public, anon, authenticated;

drop trigger if exists estimate_line_items_snapshot on public.estimate_line_items;
create trigger estimate_line_items_snapshot before insert or update on public.estimate_line_items
for each row execute function private.snapshot_estimate_line_item();
drop trigger if exists estimate_line_items_recalculate on public.estimate_line_items;
create trigger estimate_line_items_recalculate after insert or update or delete on public.estimate_line_items
for each row execute function private.recalculate_estimate_line_total();

create index if not exists estimate_line_items_estimate_idx on public.estimate_line_items(estimate_id);
create index if not exists estimate_line_items_price_item_idx on public.estimate_line_items(service_price_item_id);
