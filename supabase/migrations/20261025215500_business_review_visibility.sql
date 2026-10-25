drop policy if exists businesses_read_membership on public.businesses;
create policy businesses_read_authorized
on public.businesses for select to authenticated
using (
  (select public.is_business_member(id))
  or (select public.is_ogreena_owner())
);
