create table if not exists public.business_stripe_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_account_id text not null unique check (stripe_account_id ~ '^acct_[A-Za-z0-9]+$'),
  account_label text not null default 'Business payout account',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.business_stripe_accounts enable row level security;

revoke all on table public.business_stripe_accounts from anon, authenticated;
grant select on table public.business_stripe_accounts to authenticated;

drop policy if exists business_stripe_accounts_read_own on public.business_stripe_accounts;
create policy business_stripe_accounts_read_own
on public.business_stripe_accounts
for select
to authenticated
using ((select auth.uid()) = user_id);

comment on table public.business_stripe_accounts is
  'Server-managed ownership map for Stripe connected accounts. Clients may read only their own mapping and may never insert, update, or delete mappings.';
