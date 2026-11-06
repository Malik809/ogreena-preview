-- Keep the privileged implementation outside the exposed public schema.
-- The public RPC is an invoker wrapper; only signed-in customers can reach
-- the internal function, which repeats the auth.uid() and customer-role checks.

alter function public.create_multi_service_request(jsonb,text,text,date)
  rename to create_multi_service_request_internal;
alter function public.create_multi_service_request_internal(jsonb,text,text,date)
  set schema private;

revoke all on function private.create_multi_service_request_internal(jsonb,text,text,date)
  from public, anon;
grant execute on function private.create_multi_service_request_internal(jsonb,text,text,date)
  to authenticated;

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

revoke all on function public.create_multi_service_request(jsonb,text,text,date)
  from public, anon;
grant execute on function public.create_multi_service_request(jsonb,text,text,date)
  to authenticated;

