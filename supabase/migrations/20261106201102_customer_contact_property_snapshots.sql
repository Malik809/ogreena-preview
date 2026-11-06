-- Private customer contact/property details and immutable request snapshots.
-- Existing business records, payment data, and historical requests are preserved.

alter table public.profiles
  add column if not exists phone text,
  add column if not exists property_street_address text,
  add column if not exists property_unit text,
  add column if not exists property_city text,
  add column if not exists property_state text,
  add column if not exists property_zip text,
  add column if not exists property_type text;

alter table public.service_requests
  add column if not exists customer_name text,
  add column if not exists customer_phone text,
  add column if not exists customer_email text,
  add column if not exists service_address text,
  add column if not exists service_address_street text,
  add column if not exists service_address_unit text,
  add column if not exists service_address_city text,
  add column if not exists service_address_state text,
  add column if not exists service_address_zip text,
  add column if not exists property_type text,
  add column if not exists details text,
  add column if not exists selected_services_snapshot jsonb not null default '[]'::jsonb,
  add column if not exists profile_snapshot_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='profiles_phone_length' and conrelid='public.profiles'::regclass) then
    alter table public.profiles add constraint profiles_phone_length
      check (phone is null or char_length(trim(phone)) between 7 and 40);
  end if;
  if not exists (select 1 from pg_constraint where conname='profiles_property_state_format' and conrelid='public.profiles'::regclass) then
    alter table public.profiles add constraint profiles_property_state_format
      check (property_state is null or property_state ~ '^[A-Z]{2}$');
  end if;
  if not exists (select 1 from pg_constraint where conname='profiles_property_zip_format' and conrelid='public.profiles'::regclass) then
    alter table public.profiles add constraint profiles_property_zip_format
      check (property_zip is null or property_zip ~ '^[0-9]{5}(-[0-9]{4})?$');
  end if;
  if not exists (select 1 from pg_constraint where conname='profiles_property_type_allowed' and conrelid='public.profiles'::regclass) then
    alter table public.profiles add constraint profiles_property_type_allowed
      check (property_type is null or property_type in ('house','apartment','condominium','commercial','multi-unit','other'));
  end if;
  if not exists (select 1 from pg_constraint where conname='service_requests_snapshot_shape' and conrelid='public.service_requests'::regclass) then
    alter table public.service_requests add constraint service_requests_snapshot_shape
      check (jsonb_typeof(selected_services_snapshot)='array');
  end if;
end $$;

alter table public.profiles enable row level security;
alter table public.service_requests enable row level security;

revoke all on table public.profiles from anon, authenticated;
grant select, update on table public.profiles to authenticated;

revoke all on table public.service_requests from anon, authenticated;
grant select, insert, update, delete on table public.service_requests to authenticated;

create or replace function public.validate_service_request_contact_snapshot()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  if tg_op='INSERT' and (select auth.uid()) is not null and new.customer_id=(select auth.uid()) then
    if char_length(trim(coalesce(new.customer_name,''))) < 2
      or char_length(trim(coalesce(new.customer_phone,''))) < 7
      or char_length(trim(coalesce(new.service_address_street,''))) < 2
      or char_length(trim(coalesce(new.service_address_city,''))) < 2
      or coalesce(new.service_address_state,'') !~ '^[A-Z]{2}$'
      or coalesce(new.service_address_zip,'') !~ '^[0-9]{5}(-[0-9]{4})?$'
      or coalesce(new.property_type,'') not in ('house','apartment','condominium','commercial','multi-unit','other')
      or jsonb_array_length(new.selected_services_snapshot)=0 then
      raise exception 'Complete contact, property, and selected-service information is required';
    end if;
    new.profile_snapshot_at=coalesce(new.profile_snapshot_at,now());
  elsif tg_op='UPDATE' and (
    new.customer_name is distinct from old.customer_name
    or new.customer_phone is distinct from old.customer_phone
    or new.customer_email is distinct from old.customer_email
    or new.service_address is distinct from old.service_address
    or new.service_address_street is distinct from old.service_address_street
    or new.service_address_unit is distinct from old.service_address_unit
    or new.service_address_city is distinct from old.service_address_city
    or new.service_address_state is distinct from old.service_address_state
    or new.service_address_zip is distinct from old.service_address_zip
    or new.property_type is distinct from old.property_type
    or new.selected_services_snapshot is distinct from old.selected_services_snapshot
    or new.profile_snapshot_at is distinct from old.profile_snapshot_at
  ) then
    raise exception 'Submitted request contact snapshots are immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists service_requests_contact_snapshot_guard on public.service_requests;
create trigger service_requests_contact_snapshot_guard
before insert or update on public.service_requests
for each row execute function public.validate_service_request_contact_snapshot();

revoke execute on function public.validate_service_request_contact_snapshot() from public, anon, authenticated;
