-- Multi-business ownership foundation.
-- This preserves the legacy Ogreena owner/merchant mapping and does not create
-- or modify any Stripe account. Live connected-account creation stays disabled.

create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (char_length(trim(display_name)) between 2 and 150),
  status text not null default 'pending_verification'
    check (status in ('pending_verification', 'verified', 'rejected', 'suspended')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.business_memberships (
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'administrator')),
  verification_status text not null default 'pending'
    check (verification_status in ('pending', 'verified', 'rejected', 'suspended')),
  is_primary boolean not null default false,
  verified_at timestamptz,
  verified_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (business_id, user_id)
);

create unique index if not exists business_memberships_one_primary_owner
  on public.business_memberships (business_id)
  where is_primary and role = 'owner';

create table if not exists public.business_registration_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references public.businesses(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  authority_description text not null
    check (char_length(trim(authority_description)) between 10 and 2000),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists business_registration_one_open_request_per_user
  on public.business_registration_requests (requested_by)
  where status = 'pending';

create table if not exists public.business_connect_consents (
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete restrict,
  environment text not null check (environment in ('test', 'live')),
  terms_version text not null,
  consented_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (business_id, environment)
);

create table if not exists public.business_connect_accounts (
  business_id uuid not null references public.businesses(id) on delete restrict,
  environment text not null check (environment in ('test', 'live')),
  stripe_account_id text not null check (stripe_account_id ~ '^acct_[A-Za-z0-9]+$'),
  onboarding_status text not null default 'not_started'
    check (onboarding_status in ('not_started', 'in_progress', 'complete', 'restricted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (business_id, environment),
  unique (environment, stripe_account_id)
);

alter table public.businesses enable row level security;
alter table public.business_memberships enable row level security;
alter table public.business_registration_requests enable row level security;
alter table public.business_connect_consents enable row level security;
alter table public.business_connect_accounts enable row level security;

create or replace function public.is_business_member(target_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.business_memberships membership
    where membership.business_id = target_business_id
      and membership.user_id = (select auth.uid())
      and membership.verification_status in ('pending', 'verified')
  );
$$;

create or replace function public.is_verified_business_owner(target_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.business_memberships membership
    join public.businesses business on business.id = membership.business_id
    where membership.business_id = target_business_id
      and membership.user_id = (select auth.uid())
      and membership.role = 'owner'
      and membership.verification_status = 'verified'
      and business.status = 'verified'
  );
$$;

create or replace function public.is_ogreena_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = (select auth.uid()) and role = 'owner'
  );
$$;

revoke all on function public.is_business_member(uuid) from public, anon;
revoke all on function public.is_verified_business_owner(uuid) from public, anon;
revoke all on function public.is_ogreena_owner() from public, anon;
grant execute on function public.is_business_member(uuid) to authenticated;
grant execute on function public.is_verified_business_owner(uuid) to authenticated;
grant execute on function public.is_ogreena_owner() to authenticated;

revoke all on table public.businesses from anon, authenticated;
revoke all on table public.business_memberships from anon, authenticated;
revoke all on table public.business_registration_requests from anon, authenticated;
revoke all on table public.business_connect_consents from anon, authenticated;
revoke all on table public.business_connect_accounts from anon, authenticated;

grant select on table public.businesses to authenticated;
grant select on table public.business_memberships to authenticated;
grant select on table public.business_registration_requests to authenticated;
grant select, insert on table public.business_connect_consents to authenticated;
grant select on table public.business_connect_accounts to authenticated;

create policy businesses_read_membership
on public.businesses for select to authenticated
using ((select public.is_business_member(id)));

create policy business_memberships_read_own_business
on public.business_memberships for select to authenticated
using (
  user_id = (select auth.uid())
  or (select public.is_verified_business_owner(business_id))
);

create policy business_registration_requests_read_own
on public.business_registration_requests for select to authenticated
using (requested_by = (select auth.uid()));

create policy business_registration_requests_read_ogreena_owner
on public.business_registration_requests for select to authenticated
using ((select public.is_ogreena_owner()));

create policy business_connect_consents_read_own_business
on public.business_connect_consents for select to authenticated
using ((select public.is_verified_business_owner(business_id)));

create policy business_connect_consents_insert_verified_owner
on public.business_connect_consents for insert to authenticated
with check (
  user_id = (select auth.uid())
  and (select public.is_verified_business_owner(business_id))
);

create policy business_connect_accounts_read_verified_owner
on public.business_connect_accounts for select to authenticated
using ((select public.is_verified_business_owner(business_id)));

create or replace function public.request_business_registration(
  requested_name text,
  requested_authority text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  new_business_id uuid;
begin
  if actor is null then
    raise exception 'Authentication required';
  end if;
  if char_length(trim(requested_name)) not between 2 and 150 then
    raise exception 'Business name must be between 2 and 150 characters';
  end if;
  if char_length(trim(requested_authority)) not between 10 and 2000 then
    raise exception 'Authority description must be between 10 and 2000 characters';
  end if;
  if exists (
    select 1 from public.business_registration_requests
    where requested_by = actor and status = 'pending'
  ) then
    raise exception 'A business verification request is already pending';
  end if;

  insert into public.businesses (display_name, status, created_by)
  values (trim(requested_name), 'pending_verification', actor)
  returning id into new_business_id;

  insert into public.business_memberships
    (business_id, user_id, role, verification_status, is_primary)
  values (new_business_id, actor, 'owner', 'pending', true);

  insert into public.business_registration_requests
    (business_id, requested_by, authority_description)
  values (new_business_id, actor, trim(requested_authority));

  return new_business_id;
end;
$$;

revoke all on function public.request_business_registration(text, text) from public, anon;
grant execute on function public.request_business_registration(text, text) to authenticated;

create or replace function public.review_business_registration(
  request_id uuid,
  decision text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  target public.business_registration_requests%rowtype;
  approved boolean;
begin
  if not (select public.is_ogreena_owner()) then
    raise exception 'Ogreena owner access required';
  end if;
  if decision not in ('approved', 'rejected') then
    raise exception 'Decision must be approved or rejected';
  end if;
  select * into target
  from public.business_registration_requests
  where id = request_id and status = 'pending'
  for update;
  if target.id is null then
    raise exception 'Pending business request not found';
  end if;
  approved := decision = 'approved';

  update public.business_registration_requests
  set status = decision, reviewed_by = actor, reviewed_at = now(), updated_at = now()
  where id = request_id;
  update public.businesses
  set status = case when approved then 'verified' else 'rejected' end, updated_at = now()
  where id = target.business_id;
  update public.business_memberships
  set verification_status = case when approved then 'verified' else 'rejected' end,
      verified_at = case when approved then now() else null end,
      verified_by = actor,
      updated_at = now()
  where business_id = target.business_id and user_id = target.requested_by;
end;
$$;

revoke all on function public.review_business_registration(uuid, text) from public, anon;
grant execute on function public.review_business_registration(uuid, text) to authenticated;

-- Preserve and normalize the existing Ogreena owner/merchant mapping without
-- deleting or changing the legacy table used by the current Owner Dashboard.
do $$
declare
  legacy record;
  ogreena_business_id uuid;
begin
  for legacy in
    select user_id, stripe_account_id
    from public.business_stripe_accounts
  loop
    select membership.business_id into ogreena_business_id
    from public.business_memberships membership
    join public.businesses business on business.id = membership.business_id
    where membership.user_id = legacy.user_id
      and membership.is_primary
      and business.display_name = 'Ogreena LLC'
    limit 1;

    if ogreena_business_id is null then
      insert into public.businesses (display_name, status, created_by)
      values ('Ogreena LLC', 'verified', legacy.user_id)
      returning id into ogreena_business_id;

      insert into public.business_memberships
        (business_id, user_id, role, verification_status, is_primary, verified_at, verified_by)
      values
        (ogreena_business_id, legacy.user_id, 'owner', 'verified', true, now(), legacy.user_id);
    end if;

    insert into public.business_connect_accounts
      (business_id, environment, stripe_account_id, onboarding_status)
    values
      (ogreena_business_id, 'live', legacy.stripe_account_id, 'complete')
    on conflict (business_id, environment) do nothing;
  end loop;
end
$$;

comment on table public.businesses is
  'Tenant record for each independently owned business. Contains no bank, SSN, EIN, or identity-document data.';
comment on table public.business_memberships is
  'Server-verified relationship between an Ogreena user and a business tenant.';
comment on table public.business_connect_consents is
  'Auditable explicit consent recorded before any connected-account provisioning. Consent alone never creates an account.';
comment on table public.business_connect_accounts is
  'Server-managed business-to-Stripe-account mapping. Browser clients cannot create or alter mappings.';
