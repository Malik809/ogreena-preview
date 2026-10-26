create index if not exists service_profile_media_updated_by_idx
  on public.service_profile_media (updated_by)
  where updated_by is not null;
