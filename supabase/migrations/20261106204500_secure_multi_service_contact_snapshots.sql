-- Extend the existing server-verified multi-service request flow with a
-- customer-authorized contact/property snapshot. Catalog names and prices
-- continue to be resolved on the server rather than trusted from the browser.

create or replace function private.create_multi_service_request_with_contact(
  selected_items jsonb,
  request_details text,
  requested_date date,
  request_customer_name text,
  request_customer_phone text,
  request_address_street text,
  request_address_unit text,
  request_address_city text,
  request_address_state text,
  request_address_zip text,
  request_property_type text
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
  selected_snapshot jsonb := '[]'::jsonb;
  full_service_address text;
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
  if requested_date is not null and requested_date < current_date then raise exception 'Preferred date cannot be in the past'; end if;
  if char_length(trim(coalesce(request_customer_name,''))) < 2
    or char_length(trim(coalesce(request_customer_phone,''))) < 7
    or char_length(trim(coalesce(request_address_street,''))) < 2
    or char_length(trim(coalesce(request_address_city,''))) < 2
    or upper(coalesce(request_address_state,'')) !~ '^[A-Z]{2}$'
    or coalesce(request_address_zip,'') !~ '^[0-9]{5}(-[0-9]{4})?$'
    or coalesce(request_property_type,'') not in ('house','apartment','condominium','commercial','multi-unit','other')
  then raise exception 'Complete contact and property information is required'; end if;

  select min(value->>'service_slug'), count(distinct value->>'service_slug')
    into first_slug, distinct_service_count
  from jsonb_array_elements(selected_items);

  for selection in select value from jsonb_array_elements(selected_items)
  loop
    requested_slug := trim(coalesce(selection->>'service_slug',''));
    requested_price_id := nullif(trim(coalesce(selection->>'service_price_item_id','')), '');
    requested_qty := coalesce(nullif(selection->>'quantity','')::numeric, 1);
    if requested_qty <= 0 or requested_qty > 10000 then raise exception 'Invalid requested quantity'; end if;

    selected_service := null;
    selected_price := null;
    select * into selected_service from public.services
      where id = requested_slug and visible = true;
    if selected_service.id is null then raise exception 'A selected service is unavailable'; end if;

    if requested_price_id is not null then
      select * into selected_price from public.service_price_items
        where id = requested_price_id and service_slug = requested_slug and active = true;
      if selected_price.id is null then raise exception 'A selected price is unavailable'; end if;
      selected_snapshot := selected_snapshot || jsonb_build_array(jsonb_build_object(
        'service_slug', selected_service.id, 'service_name', selected_service.name,
        'service_price_item_id', selected_price.id, 'item_name', selected_price.name,
        'price_cents', selected_price.price_cents, 'pricing_type', selected_price.pricing_type,
        'unit_label', selected_price.unit_label, 'quantity', requested_qty
      ));
    else
      selected_snapshot := selected_snapshot || jsonb_build_array(jsonb_build_object(
        'service_slug', selected_service.id, 'service_name', selected_service.name,
        'service_price_item_id', null, 'item_name', selected_service.name || ' estimate request',
        'price_cents', null, 'pricing_type', null, 'unit_label', '', 'quantity', 1
      ));
    end if;
  end loop;

  full_service_address := concat_ws(', ', trim(request_address_street), nullif(trim(coalesce(request_address_unit,'')),''),
    trim(request_address_city) || ', ' || upper(trim(request_address_state)) || ' ' || trim(request_address_zip));

  insert into public.service_requests (
    customer_id, customer_name, customer_phone, customer_email,
    service_slug, summary, details, service_address,
    service_address_street, service_address_unit, service_address_city,
    service_address_state, service_address_zip, property_type,
    selected_services_snapshot, preferred_date, notification_status, submitted_via
  ) values (
    actor, trim(request_customer_name), trim(request_customer_phone), (select auth.jwt()->>'email'),
    case when distinct_service_count = 1 then first_slug else 'multiple-services' end,
    selection_count || case when selection_count = 1 then ' service selected' else ' services selected' end,
    trim(coalesce(request_details,'')), full_service_address,
    trim(request_address_street), nullif(trim(coalesce(request_address_unit,'')),''), trim(request_address_city),
    upper(trim(request_address_state)), trim(request_address_zip), request_property_type,
    selected_snapshot, requested_date, 'pending', 'account'
  ) returning id into request_id;

  for selection in select value from jsonb_array_elements(selected_snapshot)
  loop
    insert into public.service_request_items (
      request_id, customer_id, service_slug, service_price_item_id,
      service_name, item_name, price_cents, pricing_type, unit_label, requested_quantity
    ) values (
      request_id, actor, selection->>'service_slug', nullif(selection->>'service_price_item_id',''),
      selection->>'service_name', selection->>'item_name', (selection->>'price_cents')::integer,
      selection->>'pricing_type', coalesce(selection->>'unit_label',''), (selection->>'quantity')::numeric
    );
  end loop;

  return request_id;
end;
$$;

revoke all on function private.create_multi_service_request_with_contact(jsonb,text,date,text,text,text,text,text,text,text,text)
  from public, anon;
grant execute on function private.create_multi_service_request_with_contact(jsonb,text,date,text,text,text,text,text,text,text,text)
  to authenticated;

create or replace function public.create_multi_service_request(
  selected_items jsonb,
  request_details text,
  requested_date date,
  request_customer_name text,
  request_customer_phone text,
  request_address_street text,
  request_address_unit text,
  request_address_city text,
  request_address_state text,
  request_address_zip text,
  request_property_type text
) returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.create_multi_service_request_with_contact(
    selected_items, request_details, requested_date, request_customer_name,
    request_customer_phone, request_address_street, request_address_unit,
    request_address_city, request_address_state, request_address_zip, request_property_type
  );
$$;

revoke all on function public.create_multi_service_request(jsonb,text,date,text,text,text,text,text,text,text,text)
  from public, anon;
grant execute on function public.create_multi_service_request(jsonb,text,date,text,text,text,text,text,text,text,text)
  to authenticated;
