-- One customer submission may contain several published Ogreena services.
-- Catalog names and prices are snapshotted server-side; the browser cannot
-- supply or alter pricing. Existing single-service requests remain valid.

create table if not exists public.service_request_items (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.service_requests(id) on delete cascade,
  customer_id uuid not null references auth.users(id) on delete cascade,
  service_slug text not null references public.services(id) on delete restrict,
  service_price_item_id text references public.service_price_items(id) on delete set null,
  service_name text not null check (char_length(trim(service_name)) between 2 and 150),
  item_name text not null check (char_length(trim(item_name)) between 2 and 150),
  price_cents integer check (price_cents is null or price_cents >= 0),
  pricing_type text check (pricing_type is null or pricing_type in ('fixed','per_unit')),
  unit_label text not null default '',
  requested_quantity numeric(10,2) not null default 1 check (requested_quantity > 0),
  created_at timestamptz not null default now()
);

create index if not exists service_request_items_request_idx
  on public.service_request_items (request_id, created_at);
create index if not exists service_request_items_customer_idx
  on public.service_request_items (customer_id, created_at desc);

alter table public.service_request_items enable row level security;
revoke all on table public.service_request_items from anon, authenticated;
grant select on table public.service_request_items to authenticated;

drop policy if exists service_request_items_read_authorized on public.service_request_items;
create policy service_request_items_read_authorized
on public.service_request_items for select to authenticated
using (
  customer_id = (select auth.uid())
  or (select private.is_owner())
  or (select private.is_assigned_employee(customer_id, request_id))
);

create or replace function private.create_multi_service_request_internal(
  selected_items jsonb,
  request_details text,
  property_information text,
  requested_date date
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  request_id uuid;
  selection jsonb;
  selected_service public.services%rowtype;
  selected_price public.service_price_items%rowtype;
  requested_slug text;
  requested_price_id text;
  requested_qty numeric;
  first_slug text;
  distinct_service_count integer;
  selection_count integer;
begin
  if actor is null then raise exception 'Authentication required'; end if;
  if not exists (
    select 1 from public.user_roles
    where user_id = actor and role = 'customer'::public.account_role
  ) then raise exception 'Customer access required'; end if;

  if jsonb_typeof(selected_items) <> 'array' then raise exception 'Selected services must be an array'; end if;
  selection_count := jsonb_array_length(selected_items);
  if selection_count < 1 or selection_count > 50 then raise exception 'Select between 1 and 50 services'; end if;
  if char_length(trim(coalesce(request_details,''))) > 2000 then raise exception 'Additional details are too long'; end if;
  if char_length(trim(coalesce(property_information,''))) not between 5 and 500 then raise exception 'Property information is required'; end if;
  if requested_date is not null and requested_date < current_date then raise exception 'Preferred date cannot be in the past'; end if;

  select min(value->>'service_slug'), count(distinct value->>'service_slug')
    into first_slug, distinct_service_count
  from jsonb_array_elements(selected_items);

  insert into public.service_requests (
    customer_id, service_slug, summary, details, service_address,
    preferred_date, notification_status, submitted_via
  ) values (
    actor,
    case when distinct_service_count = 1 then first_slug else 'multiple-services' end,
    selection_count || case when selection_count = 1 then ' service selected' else ' services selected' end,
    trim(coalesce(request_details,'')), trim(property_information), requested_date,
    'pending', 'account'
  ) returning id into request_id;

  for selection in select value from jsonb_array_elements(selected_items)
  loop
    requested_slug := trim(coalesce(selection->>'service_slug',''));
    requested_price_id := nullif(trim(coalesce(selection->>'service_price_item_id','')), '');
    requested_qty := coalesce(nullif(selection->>'quantity','')::numeric, 1);
    if requested_qty <= 0 or requested_qty > 10000 then raise exception 'Invalid requested quantity'; end if;

    select * into selected_service from public.services
      where id = requested_slug and visible = true;
    if selected_service.id is null then raise exception 'A selected service is unavailable'; end if;

    if requested_price_id is not null then
      select * into selected_price from public.service_price_items
        where id = requested_price_id and service_slug = requested_slug and active = true;
      if selected_price.id is null then raise exception 'A selected price is unavailable'; end if;
      insert into public.service_request_items (
        request_id, customer_id, service_slug, service_price_item_id,
        service_name, item_name, price_cents, pricing_type, unit_label, requested_quantity
      ) values (
        request_id, actor, selected_service.id, selected_price.id,
        selected_service.name, selected_price.name, selected_price.price_cents,
        selected_price.pricing_type, selected_price.unit_label, requested_qty
      );
    else
      insert into public.service_request_items (
        request_id, customer_id, service_slug, service_name, item_name, requested_quantity
      ) values (
        request_id, actor, selected_service.id, selected_service.name,
        selected_service.name || ' estimate request', 1
      );
    end if;
  end loop;

  return request_id;
end;
$$;

revoke all on function private.create_multi_service_request_internal(jsonb,text,text,date) from public, anon;
grant execute on function private.create_multi_service_request_internal(jsonb,text,text,date) to authenticated;

create or replace function public.create_multi_service_request(
  selected_items jsonb,
  request_details text,
  property_information text,
  requested_date date
) returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.create_multi_service_request_internal(
    selected_items, request_details, property_information, requested_date
  );
$$;

revoke all on function public.create_multi_service_request(jsonb,text,text,date) from public, anon;
grant execute on function public.create_multi_service_request(jsonb,text,text,date) to authenticated;

