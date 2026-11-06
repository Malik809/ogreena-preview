-- Keep the existing employee job controls, appointment controls, customer
-- request status, and customer history consistent in both directions.

create or replace function public.sync_service_request_calendar_status()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  if new.status is distinct from old.status and new.status in (
    'completed'::public.request_status,'cancelled'::public.request_status
  ) then
    update public.appointments set
      status=case new.status
        when 'completed'::public.request_status then 'completed'::public.appointment_status
        else 'cancelled'::public.appointment_status
      end,
      updated_at=now()
    where request_id=new.id and status is distinct from (case new.status
      when 'completed'::public.request_status then 'completed'::public.appointment_status
      else 'cancelled'::public.appointment_status
    end);
  end if;
  return new;
end;
$$;

revoke execute on function public.sync_service_request_calendar_status() from public,anon,authenticated;
drop trigger if exists service_requests_sync_calendar_status on public.service_requests;
create trigger service_requests_sync_calendar_status
after update of status on public.service_requests
for each row execute function public.sync_service_request_calendar_status();

create or replace function public.sync_calendar_service_request_status()
returns trigger
language plpgsql
set search_path=''
as $$
declare
  request_state public.request_status;
begin
  if new.request_id is null or new.status is not distinct from old.status then return new; end if;
  request_state := case new.status
    when 'completed'::public.appointment_status then 'completed'::public.request_status
    when 'cancelled'::public.appointment_status then 'cancelled'::public.request_status
    else 'scheduled'::public.request_status
  end;
  update public.service_requests set status=request_state,updated_at=now()
  where id=new.request_id and status is distinct from request_state;
  return new;
end;
$$;

revoke execute on function public.sync_calendar_service_request_status() from public,anon,authenticated;
drop trigger if exists appointments_sync_request_status on public.appointments;
create trigger appointments_sync_request_status
after update of status on public.appointments
for each row execute function public.sync_calendar_service_request_status();
