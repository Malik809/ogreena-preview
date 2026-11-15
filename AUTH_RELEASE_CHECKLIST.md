# Customer authentication release checklist

These production settings must be coordinated with the website and migration deployment. Do not change them before final approval.

1. In Supabase Authentication → Sign In / Providers → Email, disable **Confirm Email**. Supabase will then return a session immediately after `signUp()` and will not send a signup-confirmation email.
2. Keep email/password sign-in enabled. Owner and employee authorization remains enforced by server-managed `user_roles`, verified business memberships, Edge Function checks, and RLS—not by customer-facing menu visibility.
3. Keep the production Site URL and allowed redirect `https://ogreena.com/auth/`.
4. Keep the email OTP/link expiry at 3,600 seconds or less. The same limit applies to password-recovery links.
5. Deploy `20261114163000_customer_accounts_without_email_confirmation.sql` to stop the legacy automatic verification-resend schedule and suppress pending verification jobs. This migration does not modify `auth.users`.
6. Deploy the website and Edge Functions together, then run the signup, sign-in, recovery-link, owner-access, employee-access, and RLS tests before publishing the release.
