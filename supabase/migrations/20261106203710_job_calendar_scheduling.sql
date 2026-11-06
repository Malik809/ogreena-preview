-- Atomic owner scheduling for the private job calendar. Appointments remain
-- readable only through the existing customer/assigned-employee/owner RLS.

create extension if not exists btree_gist with schema extensions;

create index if not exists appointments_calendar_start_idx
  on public.appointments (starts_at, status);
create index if not exists appointments_request_idx
  on public.appointments (request_id);

update public.appointments set ends_at=starts_at+interval '1 hour' where ends_at is null;
alter table public.appointments alter column ends_at set not null;

create unique index if not exists appointments_one_active_per_request_idx
  on public.appointments (request_id)
  where request_id is not null and status <> 'cancelled'::public.appointment_status;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='appointments_prevent_employee_overlap'
      and conrelid='public.appointments'::regclass
  ) then
    alter table public.appointments add constraint appointments_prevent_employee_overlap
      exclude using gist (
        employee_id with =,
        tstzrange(starts_at,ends_at,'[)') with &&
      ) where (
        employee_id is not null
        and status in ('requested'::public.appointment_status,'confirmed'::public.appointment_status)
      );
  end if;
end $$;

create or replace function private.manage_job_schedule_internal(
  schedule_id uuid,
  target_request_id uuid,
  assigned_worker_id uuid,
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  schedule_status public.appointment_status
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  actor uuid := (select auth.uid());
  customer uuid;
  saved_id uuid;
begin
  if actor is null or not (select private.is_owner()) then
    raise exception 'Owner access required';
  end if;
  if scheduled_start is null or scheduled_end is null or scheduled_end <= scheduled_start then
    raise exception 'A valid start and end time are required';
  end if;
  if assigned_worker_id is not null and not exists (
    select 1 from public.user_roles
    where user_id=assigned_worker_id and role='employee'::public.account_role
  ) then raise exception 'Assigned worker is not an authorized employee'; end if;

  select customer_id into customer from public.service_requests where id=target_request_id;
  if not found then raise exception 'Service request not found'; end if;

  if schedule_id is null then
    insert into public.appointments(request_id,customer_id,employee_id,starts_at,ends_at,status)
    values(target_request_id,customer,assigned_worker_id,scheduled_start,scheduled_end,schedule_status)
    returning id into saved_id;
  else
    update public.appointments set
      employee_id=assigned_worker_id, starts_at=scheduled_start, ends_at=scheduled_end,
      status=schedule_status, updated_at=now()
    where id=schedule_id and request_id=target_request_id
    returning id into saved_id;
    if saved_id is null then raise exception 'Scheduled job not found'; end if;
  end if;

  update public.service_requests set
    assigned_employee_id=assigned_worker_id,
    status=case schedule_status
      when 'completed'::public.appointment_status then 'completed'::public.request_status
      when 'cancelled'::public.appointment_status then 'cancelled'::public.request_status
      else 'scheduled'::public.request_status
    end,
    updated_at=now()
  where id=target_request_id;

  return saved_id;
exception
  when exclusion_violation then
    raise exception 'That worker is already booked during this time';
  when unique_violation then
    raise exception 'This request already has an active scheduled job';
end;
$$;

revoke all on function private.manage_job_schedule_internal(uuid,uuid,uuid,timestamptz,timestamptz,public.appointment_status)
  from public,anon;
grant execute on function private.manage_job_schedule_internal(uuid,uuid,uuid,timestamptz,timestamptz,public.appointment_status)
  to authenticated;

create or replace function public.manage_job_schedule(
  schedule_id uuid,
  target_request_id uuid,
  assigned_worker_id uuid,
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  schedule_status public.appointment_status
) returns uuid
language sql
security invoker
set search_path=''
as $$
  select private.manage_job_schedule_internal(
    schedule_id,target_request_id,assigned_worker_id,scheduled_start,scheduled_end,schedule_status
  );
$$;

revoke all on function public.manage_job_schedule(uuid,uuid,uuid,timestamptz,timestamptz,public.appointment_status)
  from public,anon;
grant execute on function public.manage_job_schedule(uuid,uuid,uuid,timestamptz,timestamptz,public.appointment_status)
  to authenticated;
