create index if not exists businesses_created_by_idx
  on public.businesses (created_by);
create index if not exists business_memberships_user_id_idx
  on public.business_memberships (user_id);
create index if not exists business_memberships_verified_by_idx
  on public.business_memberships (verified_by)
  where verified_by is not null;
create index if not exists business_registration_reviewed_by_idx
  on public.business_registration_requests (reviewed_by)
  where reviewed_by is not null;
create index if not exists business_connect_consents_user_id_idx
  on public.business_connect_consents (user_id);

drop policy if exists business_registration_requests_read_own
  on public.business_registration_requests;
drop policy if exists business_registration_requests_read_ogreena_owner
  on public.business_registration_requests;
create policy business_registration_requests_read_authorized
on public.business_registration_requests for select to authenticated
using (
  requested_by = (select auth.uid())
  or (select public.is_ogreena_owner())
);
