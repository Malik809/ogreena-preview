-- Owner consent and isolated mapping foundation for one Ogreena LLC
-- replacement-candidate connected account. This migration creates no Stripe
-- account and does not modify the active merchant or payment routing.

create table if not exists public.ogreena_replacement_connect_consents (
  id boolean primary key default true check (id),
  owner_id uuid not null references auth.users(id) on delete restrict,
  existing_merchant_account_id text not null default 'acct_1UTpIlI19b4U0AqM'
    check (existing_merchant_account_id = 'acct_1UTpIlI19b4U0AqM'),
  terms_version text not null check (terms_version = 'ogreena-replacement-live-v1'),
  consented_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.ogreena_replacement_connect_candidates (
  id boolean primary key default true check (id),
  existing_merchant_account_id text not null default 'acct_1UTpIlI19b4U0AqM'
    check (existing_merchant_account_id = 'acct_1UTpIlI19b4U0AqM'),
  replacement_stripe_account_id text unique
    check (replacement_stripe_account_id is null or replacement_stripe_account_id ~ '^acct_[A-Za-z0-9]+$'),
  status text not null default 'not_created'
    check (status in ('not_created','created','onboarding','verified','rejected')),
  created_from_consent_owner_id uuid references auth.users(id) on delete restrict,
  created_at timestamptz,
  updated_at timestamptz not null default now(),
  check (replacement_stripe_account_id is null or replacement_stripe_account_id <> existing_merchant_account_id)
);

alter table public.ogreena_replacement_connect_consents enable row level security;
alter table public.ogreena_replacement_connect_candidates enable row level security;
revoke all on table public.ogreena_replacement_connect_consents from anon, authenticated;
revoke all on table public.ogreena_replacement_connect_candidates from anon, authenticated;
grant select, insert on table public.ogreena_replacement_connect_consents to authenticated;
grant select on table public.ogreena_replacement_connect_candidates to authenticated;

create policy ogreena_replacement_consent_owner_read
on public.ogreena_replacement_connect_consents for select to authenticated
using (owner_id = (select auth.uid()) and (select public.is_ogreena_owner()));

create policy ogreena_replacement_consent_owner_insert
on public.ogreena_replacement_connect_consents for insert to authenticated
with check (
  id and owner_id = (select auth.uid())
  and existing_merchant_account_id = 'acct_1UTpIlI19b4U0AqM'
  and terms_version = 'ogreena-replacement-live-v1'
  and revoked_at is null and (select public.is_ogreena_owner())
);

create policy ogreena_replacement_candidate_owner_read
on public.ogreena_replacement_connect_candidates for select to authenticated
using ((select public.is_ogreena_owner()));

comment on table public.ogreena_replacement_connect_consents is
  'Owner-only auditable consent. Inserting consent never creates a Stripe account or changes payment routing.';
comment on table public.ogreena_replacement_connect_candidates is
  'Server-managed replacement-candidate mapping kept separate from Ogreena LLC active merchant routing.';
