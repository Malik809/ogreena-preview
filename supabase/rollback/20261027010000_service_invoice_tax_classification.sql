-- Emergency rollback for 20261027010000_service_invoice_tax_classification.sql.
-- Run only before creating conversation-only invoices. This preserves estimates,
-- payment transactions, Stripe references, amounts, descriptions, and histories.
begin;

do $$
begin
  if exists (select 1 from public.estimates where request_id is null) then
    raise exception 'Rollback blocked: conversation-only invoices exist';
  end if;
end $$;

drop trigger if exists estimates_validate_tax_treatment on public.estimates;
drop function if exists private.validate_service_invoice_tax_treatment();
alter table public.estimates drop constraint if exists estimates_service_context_check;
alter table public.estimates drop constraint if exists estimates_tax_treatment_check;
drop index if exists public.estimates_conversation_created_idx;
alter table public.estimates alter column request_id set not null;
alter table public.estimates
  drop column if exists tax_confirmed_by,
  drop column if exists tax_confirmed_at,
  drop column if exists tax_treatment,
  drop column if exists conversation_id;

commit;
