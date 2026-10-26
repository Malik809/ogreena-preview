alter table public.payment_transactions
  add column if not exists stripe_account_id text,
  add column if not exists refund_stripe_account_id text;

alter table public.orders
  add column if not exists stripe_account_id text;

alter table public.estimates
  add column if not exists stripe_account_id text;

alter table public.payment_transactions
  add constraint payment_transactions_stripe_account_id_format
  check (stripe_account_id is null or stripe_account_id ~ '^acct_[A-Za-z0-9]+$') not valid;

alter table public.payment_transactions
  add constraint payment_transactions_refund_account_id_format
  check (refund_stripe_account_id is null or refund_stripe_account_id ~ '^acct_[A-Za-z0-9]+$') not valid;

alter table public.orders
  add constraint orders_stripe_account_id_format
  check (stripe_account_id is null or stripe_account_id ~ '^acct_[A-Za-z0-9]+$') not valid;

alter table public.estimates
  add constraint estimates_stripe_account_id_format
  check (stripe_account_id is null or stripe_account_id ~ '^acct_[A-Za-z0-9]+$') not valid;

update public.payment_transactions
set stripe_account_id = 'acct_1UTpIlI19b4U0AqM'
where livemode = true and stripe_account_id is null;

update public.orders o
set stripe_account_id = t.stripe_account_id
from public.payment_transactions t
where t.order_id = o.id and t.livemode = true and o.stripe_account_id is null;

update public.estimates e
set stripe_account_id = t.stripe_account_id
from public.payment_transactions t
where t.estimate_id = e.id and t.livemode = true and e.stripe_account_id is null;

create index if not exists payment_transactions_account_created_idx
  on public.payment_transactions (stripe_account_id, created_at desc);

comment on column public.payment_transactions.stripe_account_id is
  'Stripe merchant that owns the direct charge; immutable routing audit field.';
comment on column public.payment_transactions.refund_stripe_account_id is
  'Stripe merchant context used for the refund request.';
