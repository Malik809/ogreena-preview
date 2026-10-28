-- Promote the Stripe account already verified for Ogreena LLC to the active
-- owner/business mapping. Historical payment rows retain their own merchant IDs.

update public.business_stripe_accounts
set stripe_account_id = 'acct_1UUtHREjIGxDre3j',
    account_label = 'Ogreena LLC live merchant',
    updated_at = now()
where user_id = '6ad822e8-5e52-4871-a288-80f4c5300995'
  and stripe_account_id = 'acct_1UTpIlI19b4U0AqM';

update public.business_connect_accounts
set stripe_account_id = 'acct_1UUtHREjIGxDre3j',
    onboarding_status = 'complete',
    updated_at = now()
where business_id = '12f16722-ed4d-4d5c-b631-f59bd4449699'
  and environment = 'live'
  and stripe_account_id = 'acct_1UTpIlI19b4U0AqM';

update public.ogreena_replacement_connect_candidates
set status = 'verified',
    updated_at = now()
where id = true
  and replacement_stripe_account_id = 'acct_1UUtHREjIGxDre3j'
  and status = 'onboarding';
