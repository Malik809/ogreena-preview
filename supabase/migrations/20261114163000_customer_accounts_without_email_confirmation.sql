-- Customer accounts no longer require signup-email confirmation.
-- The Supabase Auth "Confirm Email" provider setting must be disabled during
-- the coordinated release. This migration stops the legacy resend campaign;
-- it does not delete or modify any auth.users records.

do $$
begin
  perform cron.unschedule('ogreena-auth-verification-resend');
exception
  when others then null;
end;
$$;

update private.auth_verification_resend_queue
set status = 'suppressed',
    provider_status = 'policy_disabled',
    last_error = 'Customer signup email confirmation is no longer required.',
    updated_at = now()
where status in ('queued', 'sending', 'failed');

update public.customer_email_jobs
set status = 'cancelled',
    last_error = 'Customer verification-email management was retired by policy.',
    updated_at = now()
where email_type = 'verification'
  and status in ('queued', 'sending', 'failed');
