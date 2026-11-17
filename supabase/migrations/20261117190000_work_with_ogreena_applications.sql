-- Add owner-reviewed professional skills to private job applications.
-- Existing customer profiles and customer roles are not changed.

alter table public.job_applications
  add column if not exists service_categories text[] not null default '{}',
  add column if not exists specialties text[] not null default '{}',
  add column if not exists job_key text;

alter table public.job_applications drop constraint if exists job_applications_service_categories_allowed;
alter table public.job_applications add constraint job_applications_service_categories_allowed check (
  cardinality(service_categories) between 1 and 14
  and service_categories <@ array[
    'carpet-cleaning','commercial-cleaning','deep-cleaning','electrical-services',
    'facilities-maintenance','house-cleaning','janitorial-services','move-in-move-out-cleaning',
    'pressure-washing','tile-grout-cleaning','upholstery-cleaning','window-cleaning',
    'landscaping','hauling'
  ]::text[]
);

alter table public.job_applications drop constraint if exists job_applications_specialties_allowed;
alter table public.job_applications add constraint job_applications_specialties_allowed check (
  specialties <@ array['hvac-installation']::text[]
);

alter table public.job_applications drop constraint if exists job_applications_job_key_allowed;
alter table public.job_applications add constraint job_applications_job_key_allowed check (
  job_key is null or job_key = 'hvac-installer'
);

drop function if exists public.submit_job_application(text,text,text,text,text);

create function public.submit_job_application(
  applicant_name text, applicant_phone text, requested_position text,
  requested_availability text, applicant_experience text,
  requested_service_categories text[], requested_specialties text[],
  requested_job_key text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := (select auth.uid()); application_id uuid;
begin
  if actor is null then raise exception 'Authentication required'; end if;
  if exists (select 1 from public.user_roles where user_id=actor and role='employee') then raise exception 'Current employees do not submit job applications'; end if;
  if cardinality(requested_service_categories) not between 1 and 14
    or not (requested_service_categories <@ array[
      'carpet-cleaning','commercial-cleaning','deep-cleaning','electrical-services',
      'facilities-maintenance','house-cleaning','janitorial-services','move-in-move-out-cleaning',
      'pressure-washing','tile-grout-cleaning','upholstery-cleaning','window-cleaning',
      'landscaping','hauling'
    ]::text[]) then raise exception 'Invalid Ogreena service category'; end if;
  if not (coalesce(requested_specialties,'{}') <@ array['hvac-installation']::text[]) then raise exception 'Invalid professional specialty'; end if;
  if requested_job_key is not null and requested_job_key <> 'hvac-installer' then raise exception 'Invalid job opening'; end if;
  insert into public.job_applications (user_id,full_name,phone,position_interest,availability,experience,service_categories,specialties,job_key)
  values (actor,trim(applicant_name),trim(applicant_phone),trim(requested_position),trim(requested_availability),trim(applicant_experience),requested_service_categories,coalesce(requested_specialties,'{}'),requested_job_key)
  on conflict (user_id) do update set
    full_name=excluded.full_name,phone=excluded.phone,position_interest=excluded.position_interest,
    availability=excluded.availability,experience=excluded.experience,
    service_categories=excluded.service_categories,specialties=excluded.specialties,
    job_key=excluded.job_key,updated_at=now()
  where public.job_applications.status in ('submitted','reviewing')
  returning id into application_id;
  if application_id is null then raise exception 'This application has already received a final decision'; end if;
  return application_id;
end; $$;

revoke all on function public.submit_job_application(text,text,text,text,text,text[],text[],text) from public, anon;
grant execute on function public.submit_job_application(text,text,text,text,text,text[],text[],text) to authenticated;
