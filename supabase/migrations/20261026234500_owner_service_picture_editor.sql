-- Owner-managed public service pictures and expanded price editor options.

alter table public.service_price_items
  add column if not exists description text not null default '';

alter table public.service_price_items
  drop constraint if exists service_price_items_pricing_type_check;
alter table public.service_price_items
  add constraint service_price_items_pricing_type_check
  check (pricing_type in ('fixed','per_unit','hourly','per_square_foot'));

create table if not exists public.service_profile_media (
  service_slug text primary key check (service_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  current_path text not null,
  previous_path text,
  draft_path text,
  position_x smallint not null default 50 check (position_x between 0 and 100),
  position_y smallint not null default 50 check (position_y between 0 and 100),
  draft_position_x smallint check (draft_position_x between 0 and 100),
  draft_position_y smallint check (draft_position_y between 0 and 100),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

alter table public.service_profile_media enable row level security;
revoke all on table public.service_profile_media from anon, authenticated;
grant select on table public.service_profile_media to anon, authenticated;
grant insert, update, delete on table public.service_profile_media to authenticated;

drop policy if exists service_profile_media_public_read on public.service_profile_media;
create policy service_profile_media_public_read
on public.service_profile_media for select to anon, authenticated using (true);

drop policy if exists service_profile_media_owner_insert on public.service_profile_media;
create policy service_profile_media_owner_insert
on public.service_profile_media for insert to authenticated
with check ((select public.is_ogreena_owner()) and updated_by = (select auth.uid()));

drop policy if exists service_profile_media_owner_update on public.service_profile_media;
create policy service_profile_media_owner_update
on public.service_profile_media for update to authenticated
using ((select public.is_ogreena_owner()))
with check ((select public.is_ogreena_owner()) and updated_by = (select auth.uid()));

drop policy if exists service_profile_media_owner_delete on public.service_profile_media;
create policy service_profile_media_owner_delete
on public.service_profile_media for delete to authenticated
using ((select public.is_ogreena_owner()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('service-images','service-images',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public=true,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists service_images_owner_insert on storage.objects;
create policy service_images_owner_insert on storage.objects
for insert to authenticated
with check (bucket_id='service-images' and (select public.is_ogreena_owner()));

drop policy if exists service_images_owner_update on storage.objects;
create policy service_images_owner_update on storage.objects
for update to authenticated
using (bucket_id='service-images' and (select public.is_ogreena_owner()))
with check (bucket_id='service-images' and (select public.is_ogreena_owner()));

drop policy if exists service_images_owner_delete on storage.objects;
create policy service_images_owner_delete on storage.objects
for delete to authenticated
using (bucket_id='service-images' and (select public.is_ogreena_owner()));

drop policy if exists service_images_owner_select on storage.objects;
create policy service_images_owner_select on storage.objects
for select to authenticated
using (bucket_id='service-images' and (select public.is_ogreena_owner()));

insert into public.service_profile_media (service_slug,current_path)
values
('carpet-cleaning','assets/service-covers/carpet-cleaning.jpg'),
('commercial-cleaning','assets/service-covers/commercial-cleaning.jpg'),
('deep-cleaning','assets/service-covers/deep-cleaning.jpg'),
('electrical-services','assets/service-covers/electrical-services.jpg'),
('facilities-maintenance','assets/service-covers/facilities-maintenance.jpg'),
('floor-polishing','assets/service-covers/tile-grout-cleaning.jpg'),
('house-cleaning','assets/service-covers/house-cleaning.jpg'),
('janitorial-services','assets/service-covers/janitorial-services.jpg'),
('mattress-cleaning','assets/service-covers/upholstery-cleaning.jpg'),
('move-in-move-out-cleaning','assets/service-covers/move-in-move-out-cleaning.jpg'),
('pressure-washing','assets/service-covers/pressure-washing.jpg'),
('tile-grout-cleaning','assets/service-covers/tile-grout-cleaning.jpg'),
('upholstery-cleaning','assets/service-covers/upholstery-cleaning.jpg'),
('window-cleaning','assets/service-covers/window-cleaning.jpg')
on conflict (service_slug) do nothing;

create or replace function public.publish_service_picture(target_slug text)
returns public.service_profile_media
language plpgsql
security invoker
set search_path = public
as $$
declare result public.service_profile_media;
begin
  if not (select public.is_ogreena_owner()) then raise exception 'owner access required'; end if;
  update public.service_profile_media
  set previous_path=current_path,
      current_path=draft_path,
      position_x=coalesce(draft_position_x,position_x),
      position_y=coalesce(draft_position_y,position_y),
      draft_path=null,
      draft_position_x=null,
      draft_position_y=null,
      updated_at=now(),
      updated_by=(select auth.uid())
  where service_slug=target_slug and draft_path is not null
  returning * into result;
  if result.service_slug is null then raise exception 'no picture draft is ready to publish'; end if;
  return result;
end $$;

create or replace function public.restore_service_picture(target_slug text)
returns public.service_profile_media
language plpgsql
security invoker
set search_path = public
as $$
declare result public.service_profile_media;
begin
  if not (select public.is_ogreena_owner()) then raise exception 'owner access required'; end if;
  update public.service_profile_media
  set current_path=previous_path,
      previous_path=current_path,
      draft_path=null,
      draft_position_x=null,
      draft_position_y=null,
      updated_at=now(),
      updated_by=(select auth.uid())
  where service_slug=target_slug and previous_path is not null
  returning * into result;
  if result.service_slug is null then raise exception 'no previous picture is available'; end if;
  return result;
end $$;

revoke all on function public.publish_service_picture(text) from public, anon;
revoke all on function public.restore_service_picture(text) from public, anon;
grant execute on function public.publish_service_picture(text) to authenticated;
grant execute on function public.restore_service_picture(text) to authenticated;
