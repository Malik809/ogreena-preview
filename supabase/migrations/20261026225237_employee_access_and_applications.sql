-- Separate existing-employee verification from new job applications.
-- Neither path grants employee access until the verified Ogreena owner approves it.

create table if not exists public.employee_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email = lower(email) and char_length(email) between 5 and 320),
  job_role text not null default 'Employee' check (char_length(trim(job_role)) between 2 and 100),
  status text not null default 'pending' check (status in ('pending','claimed','cancelled')),
  created_by uuid not null references auth.users(id) on delete restrict,
  claimed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  claimed_at timestamptz
);

create unique index if not exists employee_invites_one_pending_email
  on public.employee_invites (email) where status = 'pending';
create index if not exists employee_invites_created_by_idx on public.employee_invites (created_by);
create index if not exists employee_invites_claimed_by_idx on public.employee_invites (claimed_by) where claimed_by is not null;

create table if not exists public.employee_access_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  invite_id uuid references public.employee_invites(id) on delete set null,
  contact_phone text not null check (char_length(trim(contact_phone)) between 7 and 40),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists employee_access_requests_invite_idx on public.employee_access_requests (invite_id) where invite_id is not null;
create index if not exists employee_access_requests_reviewed_by_idx on public.employee_access_requests (reviewed_by) where reviewed_by is not null;

create table if not exists public.job_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  full_name text not null check (char_length(trim(full_name)) between 2 and 100),
  phone text not null check (char_length(trim(phone)) between 7 and 40),
  position_interest text not null check (char_length(trim(position_interest)) between 2 and 120),
  availability text not null check (char_length(trim(availability)) between 2 and 1000),
  experience text not null check (char_length(trim(experience)) between 10 and 4000),
  status text not null default 'submitted' check (status in ('submitted','reviewing','hired','rejected')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists job_applications_reviewed_by_idx on public.job_applications (reviewed_by) where reviewed_by is not null;

alter table public.employee_profiles add column if not exists availability_note text not null default '';

alter table public.employee_invites enable row level security;
alter table public.employee_access_requests enable row level security;
alter table public.job_applications enable row level security;
alter table public.employee_profiles enable row level security;

revoke all on table public.employee_invites from anon, authenticated;
revoke all on table public.employee_access_requests from anon, authenticated;
revoke all on table public.job_applications from anon, authenticated;
grant select on table public.employee_invites to authenticated;
grant select on table public.employee_access_requests to authenticated;
grant select on table public.job_applications to authenticated;
grant select on table public.employee_profiles to authenticated;

drop policy if exists employee_profiles_employee_read_self on public.employee_profiles;
create policy employee_profiles_employee_read_self on public.employee_profiles for select to authenticated
using (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.user_roles
    where user_id = (select auth.uid()) and role = 'employee'
  )
);

drop policy if exists employee_invites_owner_read on public.employee_invites;
create policy employee_invites_owner_read on public.employee_invites for select to authenticated
using ((select public.is_ogreena_owner()));

drop policy if exists employee_access_requests_read_own on public.employee_access_requests;
create policy employee_access_requests_read_own on public.employee_access_requests for select to authenticated
using (user_id = (select auth.uid()));
drop policy if exists employee_access_requests_owner_read on public.employee_access_requests;
create policy employee_access_requests_owner_read on public.employee_access_requests for select to authenticated
using ((select public.is_ogreena_owner()));

drop policy if exists job_applications_read_own on public.job_applications;
create policy job_applications_read_own on public.job_applications for select to authenticated
using (user_id = (select auth.uid()));
drop policy if exists job_applications_owner_read on public.job_applications;
create policy job_applications_owner_read on public.job_applications for select to authenticated
using ((select public.is_ogreena_owner()));

drop policy if exists service_requests_employee_read_assigned on public.service_requests;
create policy service_requests_employee_read_assigned on public.service_requests for select to authenticated
using (
  assigned_employee_id = (select auth.uid())
  and exists (select 1 from public.user_roles where user_id = (select auth.uid()) and role = 'employee')
);

drop policy if exists appointments_employee_read_assigned on public.appointments;
create policy appointments_employee_read_assigned on public.appointments for select to authenticated
using (
  employee_id = (select auth.uid())
  and exists (select 1 from public.user_roles where user_id = (select auth.uid()) and role = 'employee')
);

create or replace function public.request_existing_employee_access(requested_phone text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  actor_email text;
  matched_invite public.employee_invites%rowtype;
  request_id uuid;
begin
  if actor is null then raise exception 'Authentication required'; end if;
  if char_length(trim(requested_phone)) not between 7 and 40 then raise exception 'A valid phone number is required'; end if;
  if exists (select 1 from public.user_roles where user_id = actor and role = 'employee') then
    raise exception 'Employee access is already active';
  end if;
  select lower(email) into actor_email from auth.users where id = actor;
  select * into matched_invite from public.employee_invites
    where email = actor_email and status = 'pending' order by created_at desc limit 1 for update;
  insert into public.employee_access_requests (user_id, invite_id, contact_phone, status, updated_at)
  values (actor, matched_invite.id, trim(requested_phone), 'pending', now())
  on conflict (user_id) do update set contact_phone = excluded.contact_phone, updated_at = now()
  returning id into request_id;
  if matched_invite.id is not null then
    update public.employee_invites set status='claimed', claimed_by=actor, claimed_at=now() where id=matched_invite.id;
  end if;
  return request_id;
end; $$;

create or replace function public.submit_job_application(
  applicant_name text, applicant_phone text, requested_position text,
  requested_availability text, applicant_experience text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := (select auth.uid()); application_id uuid;
begin
  if actor is null then raise exception 'Authentication required'; end if;
  if exists (select 1 from public.user_roles where user_id=actor and role='employee') then raise exception 'Current employees do not submit job applications'; end if;
  insert into public.job_applications (user_id, full_name, phone, position_interest, availability, experience)
  values (actor, trim(applicant_name), trim(applicant_phone), trim(requested_position), trim(requested_availability), trim(applicant_experience))
  on conflict (user_id) do update set
    full_name=excluded.full_name, phone=excluded.phone, position_interest=excluded.position_interest,
    availability=excluded.availability, experience=excluded.experience, updated_at=now()
  where public.job_applications.status in ('submitted','reviewing')
  returning id into application_id;
  if application_id is null then raise exception 'This application has already received a final decision'; end if;
  return application_id;
end; $$;

create or replace function public.create_employee_invite(invited_email text, invited_job_role text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := (select auth.uid()); invite_id uuid;
begin
  if not coalesce((select public.is_ogreena_owner()), false) then raise exception 'Owner access required'; end if;
  insert into public.employee_invites(email,job_role,created_by)
  values(lower(trim(invited_email)),trim(invited_job_role),actor) returning id into invite_id;
  return invite_id;
end; $$;

create or replace function public.review_employee_access(request_id uuid, decision text, approved_job_role text default 'Employee')
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := (select auth.uid()); target public.employee_access_requests%rowtype;
begin
  if not coalesce((select public.is_ogreena_owner()), false) then raise exception 'Owner access required'; end if;
  if decision not in ('approved','rejected') then raise exception 'Decision must be approved or rejected'; end if;
  select * into target from public.employee_access_requests where id=request_id and status='pending' for update;
  if target.id is null then raise exception 'Pending employee request not found'; end if;
  update public.employee_access_requests set status=decision,reviewed_by=actor,reviewed_at=now(),updated_at=now() where id=target.id;
  if decision='approved' then
    insert into public.user_roles(user_id,role,updated_at) values(target.user_id,'employee',now())
      on conflict(user_id) do update set role='employee',updated_at=now();
    insert into public.employee_profiles(user_id,job_role,active) values(target.user_id,trim(approved_job_role),true)
      on conflict(user_id) do update set job_role=excluded.job_role,active=true;
  end if;
end; $$;

create or replace function public.review_job_application(application_id uuid, decision text, approved_job_role text default 'Employee')
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := (select auth.uid()); target public.job_applications%rowtype;
begin
  if not coalesce((select public.is_ogreena_owner()), false) then raise exception 'Owner access required'; end if;
  if decision not in ('reviewing','hired','rejected') then raise exception 'Invalid application decision'; end if;
  select * into target from public.job_applications where id=application_id and status in ('submitted','reviewing') for update;
  if target.id is null then raise exception 'Open application not found'; end if;
  update public.job_applications set status=decision,reviewed_by=actor,reviewed_at=case when decision in ('hired','rejected') then now() else null end,updated_at=now() where id=target.id;
  if decision='hired' then
    insert into public.user_roles(user_id,role,updated_at) values(target.user_id,'employee',now())
      on conflict(user_id) do update set role='employee',updated_at=now();
    insert into public.employee_profiles(user_id,job_role,active) values(target.user_id,trim(approved_job_role),true)
      on conflict(user_id) do update set job_role=excluded.job_role,active=true;
  end if;
end; $$;

create or replace function public.update_employee_contact_availability(new_phone text, new_availability text)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := (select auth.uid());
begin
  if not exists(select 1 from public.user_roles where user_id=actor and role='employee') then raise exception 'Employee access required'; end if;
  update public.profiles set phone=trim(new_phone),updated_at=now() where id=actor;
  update public.employee_profiles set availability_note=left(trim(new_availability),1000) where user_id=actor and active;
end; $$;

create or replace function public.update_employee_job_status(request_id uuid, new_status text)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := (select auth.uid());
begin
  if new_status not in ('in_progress','completed') then raise exception 'Employees may only mark assigned work in progress or completed'; end if;
  if not exists(select 1 from public.user_roles where user_id=actor and role='employee') then raise exception 'Employee access required'; end if;
  update public.service_requests set status=new_status where id=request_id and assigned_employee_id=actor;
  if not found then raise exception 'Assigned job not found'; end if;
end; $$;

revoke all on function public.request_existing_employee_access(text) from public, anon;
revoke all on function public.submit_job_application(text,text,text,text,text) from public, anon;
revoke all on function public.create_employee_invite(text,text) from public, anon;
revoke all on function public.review_employee_access(uuid,text,text) from public, anon;
revoke all on function public.review_job_application(uuid,text,text) from public, anon;
revoke all on function public.update_employee_contact_availability(text,text) from public, anon;
revoke all on function public.update_employee_job_status(uuid,text) from public, anon;
grant execute on function public.request_existing_employee_access(text) to authenticated;
grant execute on function public.submit_job_application(text,text,text,text,text) to authenticated;
grant execute on function public.create_employee_invite(text,text) to authenticated;
grant execute on function public.review_employee_access(uuid,text,text) to authenticated;
grant execute on function public.review_job_application(uuid,text,text) to authenticated;
grant execute on function public.update_employee_contact_availability(text,text) to authenticated;
grant execute on function public.update_employee_job_status(uuid,text) to authenticated;
