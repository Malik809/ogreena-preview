create table if not exists public.community_events (
  id uuid primary key default gen_random_uuid(), organizer_id uuid not null references auth.users(id) on delete cascade,
  event_name text not null check (char_length(event_name) between 3 and 120), event_location text not null check (char_length(event_location) between 3 and 240),
  event_date date not null, start_time time, end_time time, description text not null check (char_length(description) between 10 and 3000),
  organizer_name text not null check (char_length(organizer_name) between 2 and 120), contact_information text check (contact_information is null or char_length(contact_information) <= 240),
  flyer_path text not null unique, flyer_mime_type text not null check (flyer_mime_type in ('image/jpeg','image/png','image/webp')),
  moderation_status text not null default 'pending' check (moderation_status in ('pending','approved','rejected')), moderation_note text check (moderation_note is null or char_length(moderation_note) <= 500),
  approved_by uuid references auth.users(id) on delete set null, approved_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint community_event_times_ordered check (end_time is null or start_time is null or end_time > start_time),
  constraint community_event_owned_path check (flyer_path like organizer_id::text || '/' || id::text || '/%')
);
create index if not exists community_events_public_upcoming_idx on public.community_events(event_date,start_time) where moderation_status='approved';
create index if not exists community_events_organizer_idx on public.community_events(organizer_id,created_at desc);
alter table public.community_events enable row level security;
grant select on public.community_events to authenticated;
grant select(id,event_name,event_location,event_date,start_time,end_time,description,organizer_name,flyer_path,flyer_mime_type,moderation_status,created_at,updated_at) on public.community_events to anon;
grant insert,update,delete on public.community_events to authenticated;
create policy community_events_public_read on public.community_events for select to anon,authenticated using (moderation_status='approved');
create policy community_events_organizer_read on public.community_events for select to authenticated using (organizer_id=(select auth.uid()));
create policy community_events_owner_read on public.community_events for select to authenticated using ((select private.is_owner()));
create policy community_events_organizer_insert on public.community_events for insert to authenticated with check (organizer_id=(select auth.uid()) and moderation_status='pending' and approved_by is null and approved_at is null);
create policy community_events_organizer_update on public.community_events for update to authenticated using (organizer_id=(select auth.uid())) with check (organizer_id=(select auth.uid()));
create policy community_events_organizer_delete on public.community_events for delete to authenticated using (organizer_id=(select auth.uid()));
create or replace function private.secure_community_event_write() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare recent_count integer;
begin
  if tg_op='INSERT' then
    if new.organizer_id is distinct from (select auth.uid()) then raise exception 'Event ownership is invalid'; end if;
    select count(*) into recent_count from public.community_events where organizer_id=(select auth.uid()) and created_at>now()-interval '1 hour';
    if recent_count>=3 then raise exception 'Please wait before submitting another event'; end if;
    new.moderation_status='pending';new.moderation_note=null;new.approved_by=null;new.approved_at=null;
  elsif not (select private.is_owner()) then
    if old.organizer_id is distinct from (select auth.uid()) or new.organizer_id is distinct from old.organizer_id then raise exception 'Event ownership cannot be changed'; end if;
    new.moderation_status='pending';new.moderation_note=null;new.approved_by=null;new.approved_at=null;
  end if;
  new.updated_at=now();return new;
end $$;
revoke all on function private.secure_community_event_write() from public,anon,authenticated;
drop trigger if exists secure_community_event_write on public.community_events;
create trigger secure_community_event_write before insert or update on public.community_events for each row execute function private.secure_community_event_write();
create or replace function public.moderate_community_event(event_id uuid,decision text,note text default null) returns public.community_events language plpgsql security definer set search_path=pg_catalog,public as $$
declare result public.community_events;
begin
  if not (select private.is_owner()) then raise exception 'Owner access required'; end if;
  if decision not in ('approved','rejected') then raise exception 'Choose approved or rejected'; end if;
  update public.community_events set moderation_status=decision,moderation_note=nullif(left(trim(note),500),''),approved_by=case when decision='approved' then (select auth.uid()) else null end,approved_at=case when decision='approved' then now() else null end,updated_at=now() where id=event_id returning * into result;
  if result.id is null then raise exception 'Event not found'; end if;return result;
end $$;
revoke all on function public.moderate_community_event(uuid,text,text) from public,anon;
grant execute on function public.moderate_community_event(uuid,text,text) to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('community-event-flyers','community-event-flyers',false,5242880,array['image/jpeg','image/png','image/webp']) on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy community_event_flyers_read on storage.objects for select to anon,authenticated using (bucket_id='community-event-flyers' and exists(select 1 from public.community_events e where e.flyer_path=name and (e.moderation_status='approved' or e.organizer_id=(select auth.uid()) or (select private.is_owner()))));
create policy community_event_flyers_delete on storage.objects for delete to authenticated using (bucket_id='community-event-flyers' and (owner_id=(select auth.uid())::text or (select private.is_owner())));
