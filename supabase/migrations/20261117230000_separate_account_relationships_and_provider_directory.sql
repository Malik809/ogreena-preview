-- Future-facing account relationships and private service-provider directory.
-- This migration intentionally does not backfill, delete, or reclassify existing accounts.

create table if not exists public.account_relationships (
  user_id uuid not null references auth.users(id) on delete cascade,
  relationship text not null check (relationship in ('customer','worker','service_provider')),
  created_at timestamptz not null default now(),
  primary key (user_id, relationship)
);
alter table public.account_relationships enable row level security;
revoke all on table public.account_relationships from anon, authenticated;
grant select on table public.account_relationships to authenticated;
create policy account_relationships_read_self on public.account_relationships for select to authenticated using (user_id=(select auth.uid()));
create policy account_relationships_owner_read on public.account_relationships for select to authenticated using ((select public.is_ogreena_owner()));

create table if not exists public.provider_directory_staff_access (
  employee_id uuid primary key references auth.users(id) on delete cascade,
  granted_by uuid not null references auth.users(id) on delete restrict,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.provider_directory_staff_access enable row level security;
revoke all on table public.provider_directory_staff_access from anon,authenticated;
grant select on table public.provider_directory_staff_access to authenticated;
create policy provider_directory_staff_access_owner_read on public.provider_directory_staff_access
for select to authenticated using ((select public.is_ogreena_owner()));

create or replace function private.has_provider_directory_access()
returns boolean language sql stable security definer set search_path='' as $$
  select coalesce((select public.is_ogreena_owner()),false) or exists(
    select 1 from public.provider_directory_staff_access a
    join public.user_roles r on r.user_id=a.employee_id and r.role='employee'
    where a.employee_id=(select auth.uid()) and a.active
  );
$$;
revoke all on function private.has_provider_directory_access() from public,anon;
grant execute on function private.has_provider_directory_access() to authenticated;

alter table public.job_applications
  add column if not exists contact_email text,
  add column if not exists service_area text not null default '',
  add column if not exists license_details text not null default '';
alter table public.job_applications drop constraint if exists job_applications_contact_email_valid;
alter table public.job_applications add constraint job_applications_contact_email_valid check (contact_email is null or (contact_email=lower(contact_email) and char_length(contact_email) between 5 and 320));
alter table public.job_applications drop constraint if exists job_applications_service_area_length;
-- NOT VALID preserves historical applications that predate this field. The submission
-- function enforces the requirement for every new or edited provider profile.
alter table public.job_applications add constraint job_applications_service_area_length check (char_length(service_area) between 2 and 1000) not valid;
alter table public.job_applications drop constraint if exists job_applications_license_details_length;
alter table public.job_applications add constraint job_applications_license_details_length check (char_length(license_details) <= 2000);
alter table public.job_applications drop constraint if exists job_applications_status_check;
alter table public.job_applications add constraint job_applications_status_check check (status in ('submitted','reviewing','approved','hired','rejected'));
drop policy if exists job_applications_read_own on public.job_applications;
drop policy if exists job_applications_owner_read on public.job_applications;
drop policy if exists job_applications_authorized_staff_read on public.job_applications;
create policy job_applications_private_read on public.job_applications
for select to authenticated using (
  user_id=(select auth.uid()) or (select private.has_provider_directory_access())
);

-- Only future applicant registrations skip the customer role. Existing rows remain untouched.
create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path='' as $$
declare requested_type text := coalesce(new.raw_user_meta_data ->> 'requested_account_type','');
begin
  insert into public.profiles (id,display_name) values (new.id,coalesce(new.raw_user_meta_data ->> 'display_name',''));
  if requested_type='messenger_guest' then
    insert into public.messenger_guest_identities(user_id,verified_email,display_name)
    values(new.id,lower(coalesce(new.email,'')),left(coalesce(new.raw_user_meta_data ->> 'display_name',''),120));
  elsif requested_type='job_applicant' then
    insert into public.account_relationships(user_id,relationship) values(new.id,'service_provider') on conflict do nothing;
  else
    insert into public.user_roles(user_id,role) values(new.id,'customer');
    insert into public.account_relationships(user_id,relationship) values(new.id,'customer') on conflict do nothing;
  end if;
  return new;
end $$;
revoke all on function private.handle_new_user() from public,anon,authenticated;

create function public.submit_job_application(
  applicant_name text, applicant_phone text, requested_position text,
  requested_availability text, applicant_experience text,
  requested_service_categories text[], requested_specialties text[],
  requested_service_area text, requested_license_details text,
  requested_job_key text
) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid := (select auth.uid()); actor_email text; application_id uuid;
begin
  if actor is null then raise exception 'Authentication required'; end if;
  if exists(select 1 from public.user_roles where user_id=actor and role='employee') then raise exception 'Current employees do not submit provider applications'; end if;
  if cardinality(requested_service_categories) not between 1 and 14 or not (requested_service_categories <@ array['carpet-cleaning','commercial-cleaning','deep-cleaning','electrical-services','facilities-maintenance','house-cleaning','janitorial-services','move-in-move-out-cleaning','pressure-washing','tile-grout-cleaning','upholstery-cleaning','window-cleaning','landscaping','hauling']::text[]) then raise exception 'Invalid Ogreena service category'; end if;
  if not (coalesce(requested_specialties,'{}') <@ array['hvac-installation']::text[]) then raise exception 'Invalid professional specialty'; end if;
  if char_length(trim(requested_service_area)) not between 2 and 1000 then raise exception 'Service area is required'; end if;
  if char_length(trim(coalesce(requested_license_details,''))) > 2000 then raise exception 'License details are too long'; end if;
  if requested_job_key is not null and requested_job_key<>'hvac-installer' then raise exception 'Invalid job opening'; end if;
  select lower(email) into actor_email from auth.users where id=actor;
  insert into public.account_relationships(user_id,relationship) values(actor,'service_provider') on conflict do nothing;
  insert into public.job_applications(user_id,full_name,phone,contact_email,position_interest,availability,experience,service_categories,specialties,service_area,license_details,job_key)
  values(actor,trim(applicant_name),trim(applicant_phone),actor_email,trim(requested_position),trim(requested_availability),trim(applicant_experience),requested_service_categories,coalesce(requested_specialties,'{}'),trim(requested_service_area),trim(coalesce(requested_license_details,'')),requested_job_key)
  on conflict(user_id) do update set full_name=excluded.full_name,phone=excluded.phone,contact_email=excluded.contact_email,position_interest=excluded.position_interest,availability=excluded.availability,experience=excluded.experience,service_categories=excluded.service_categories,specialties=excluded.specialties,service_area=excluded.service_area,license_details=excluded.license_details,job_key=excluded.job_key,updated_at=now()
  where public.job_applications.status in ('submitted','reviewing','approved') returning id into application_id;
  if application_id is null then raise exception 'This application has already received a final decision'; end if;
  return application_id;
end $$;

-- Compatibility for already-open/cached pages using the prior eight-argument RPC.
create or replace function public.submit_job_application(
  applicant_name text, applicant_phone text, requested_position text,
  requested_availability text, applicant_experience text,
  requested_service_categories text[], requested_specialties text[],
  requested_job_key text default null
) returns uuid language sql security definer set search_path='' as $$
  select public.submit_job_application(
    applicant_name,applicant_phone,requested_position,requested_availability,
    applicant_experience,requested_service_categories,requested_specialties,
    'Not provided (legacy client)','',requested_job_key
  );
$$;

create or replace function public.review_job_application(application_id uuid,decision text,approved_job_role text default 'Employee')
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid := (select auth.uid()); target public.job_applications%rowtype;
begin
  if not coalesce((select public.is_ogreena_owner()),false) then raise exception 'Owner access required'; end if;
  if decision not in ('reviewing','approved','hired','rejected') then raise exception 'Invalid application decision'; end if;
  select * into target from public.job_applications where id=application_id and status in ('submitted','reviewing','approved') for update;
  if target.id is null then raise exception 'Open provider application not found'; end if;
  update public.job_applications set status=decision,reviewed_by=actor,reviewed_at=case when decision in ('approved','hired','rejected') then now() else null end,updated_at=now() where id=target.id;
  insert into public.account_relationships(user_id,relationship) values(target.user_id,'service_provider') on conflict do nothing;
  if decision='hired' then
    insert into public.user_roles(user_id,role,updated_at) values(target.user_id,'employee',now()) on conflict(user_id) do update set role='employee',updated_at=now();
    insert into public.account_relationships(user_id,relationship) values(target.user_id,'worker') on conflict do nothing;
    insert into public.employee_profiles(user_id,job_role,active) values(target.user_id,trim(approved_job_role),true) on conflict(user_id) do update set job_role=excluded.job_role,active=true;
  end if;
end $$;

create or replace function public.set_provider_directory_staff_access(target_employee_id uuid,allow_access boolean)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid := (select auth.uid());
begin
  if not coalesce((select public.is_ogreena_owner()),false) then raise exception 'Owner access required'; end if;
  if not exists(select 1 from public.user_roles where user_id=target_employee_id and role='employee') then raise exception 'Active Ogreena worker not found'; end if;
  insert into public.provider_directory_staff_access(employee_id,granted_by,active,updated_at)
  values(target_employee_id,actor,allow_access,now())
  on conflict(employee_id) do update set active=excluded.active,granted_by=excluded.granted_by,updated_at=now();
end $$;

revoke all on function public.submit_job_application(text,text,text,text,text,text[],text[],text,text,text) from public,anon;
grant execute on function public.submit_job_application(text,text,text,text,text,text[],text[],text,text,text) to authenticated;
revoke all on function public.submit_job_application(text,text,text,text,text,text[],text[],text) from public,anon;
grant execute on function public.submit_job_application(text,text,text,text,text,text[],text[],text) to authenticated;
revoke all on function public.set_provider_directory_staff_access(uuid,boolean) from public,anon;
grant execute on function public.set_provider_directory_staff_access(uuid,boolean) to authenticated;
