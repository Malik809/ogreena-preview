-- Owner-confirmed tax treatment is required before a service invoice can be paid.
begin;

alter table public.estimates
  add column if not exists conversation_id uuid references public.service_conversations(id) on delete set null,
  add column if not exists tax_treatment text not null default 'review_required',
  add column if not exists tax_confirmed_at timestamptz,
  add column if not exists tax_confirmed_by uuid references auth.users(id) on delete set null;

alter table public.estimates alter column request_id drop not null;
alter table public.estimates drop constraint if exists estimates_service_context_check;
alter table public.estimates add constraint estimates_service_context_check
  check (request_id is not null or conversation_id is not null);

alter table public.estimates drop constraint if exists estimates_tax_treatment_check;
alter table public.estimates add constraint estimates_tax_treatment_check
  check (tax_treatment in ('service_only_nontaxable','materials_or_products','review_required'));

create index if not exists estimates_conversation_created_idx
  on public.estimates (conversation_id, created_at desc)
  where conversation_id is not null;

create or replace function private.validate_service_invoice_tax_treatment()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
  if tg_op = 'UPDATE' and (
    new.tax_treatment is distinct from old.tax_treatment
    or new.tax_confirmed_at is distinct from old.tax_confirmed_at
    or new.tax_confirmed_by is distinct from old.tax_confirmed_by
  ) and not private.is_owner() then
    raise exception 'Only the verified owner can classify an invoice';
  end if;

  if new.tax_confirmed_at is not null then
    if not private.is_owner() or new.tax_confirmed_by is distinct from (select auth.uid()) then
      raise exception 'Verified owner confirmation is required';
    end if;
  end if;

  if new.status in ('sent','accepted') and (
    new.tax_treatment <> 'service_only_nontaxable'
    or new.tax_confirmed_at is null
    or new.tax_confirmed_by is null
  ) then
    raise exception 'Only owner-confirmed service-only invoices can be sent for payment';
  end if;
  return new;
end $$;

revoke all on function private.validate_service_invoice_tax_treatment() from public, anon, authenticated;
drop trigger if exists estimates_validate_tax_treatment on public.estimates;
create trigger estimates_validate_tax_treatment
before insert or update on public.estimates
for each row execute function private.validate_service_invoice_tax_treatment();

comment on column public.estimates.tax_treatment is
  'Owner classification. Only service_only_nontaxable is eligible for Checkout; other values remain blocked.';

commit;
