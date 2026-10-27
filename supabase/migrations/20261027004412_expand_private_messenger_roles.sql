-- Extend the existing private Messenger without widening account permissions.
-- Passwordless guests are authenticated by Supabase Auth but intentionally receive no Ogreena role.
create table if not exists public.messenger_guest_identities (
  user_id uuid primary key references auth.users(id) on delete cascade,
  verified_email text not null,
  display_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(verified_email) between 3 and 320),
  check (length(display_name) <= 120)
);

alter table public.messenger_guest_identities enable row level security;
revoke all on table public.messenger_guest_identities from anon, authenticated;
grant select, update on table public.messenger_guest_identities to authenticated;

create policy messenger_guests_read_self_or_owner on public.messenger_guest_identities
for select to authenticated using (user_id=(select auth.uid()) or private.is_owner());
create policy messenger_guests_update_self on public.messenger_guest_identities
for update to authenticated using (user_id=(select auth.uid()))
with check (user_id=(select auth.uid()));

-- The auth trigger is the only place where the requested guest marker is trusted. All later
-- authorization is based on this table, never on editable user metadata.
create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', ''));

  if coalesce(new.raw_user_meta_data ->> 'requested_account_type','') = 'messenger_guest' then
    insert into public.messenger_guest_identities (user_id, verified_email, display_name)
    values (new.id, lower(coalesce(new.email,'')), left(coalesce(new.raw_user_meta_data ->> 'display_name',''),120));
  else
    insert into public.user_roles (user_id, role) values (new.id, 'customer');
  end if;
  return new;
end $$;
revoke all on function private.handle_new_user() from public, anon, authenticated;

alter table public.service_conversations
  add column if not exists participant_kind text not null default 'customer',
  add column if not exists assigned_employee_id uuid references auth.users(id) on delete set null;

alter table public.service_conversations drop constraint if exists service_conversations_participant_kind_check;
alter table public.service_conversations add constraint service_conversations_participant_kind_check
  check (participant_kind in ('customer','guest','employee'));
create index if not exists service_conversations_employee_idx
  on public.service_conversations(assigned_employee_id,last_message_at desc) where assigned_employee_id is not null;

drop policy if exists service_conversations_participant_read on public.service_conversations;
drop policy if exists service_conversations_customer_insert on public.service_conversations;
drop policy if exists service_conversations_owner_update on public.service_conversations;

create policy service_conversations_authorized_read on public.service_conversations
for select to authenticated using (
  customer_id=(select auth.uid()) or private.is_owner()
  or (
    assigned_employee_id=(select auth.uid())
    and exists (select 1 from public.user_roles r where r.user_id=(select auth.uid()) and r.role='employee')
  )
);

create policy service_conversations_participant_insert on public.service_conversations
for insert to authenticated with check (
  customer_id=(select auth.uid()) and assigned_employee_id is null and (
    (participant_kind='customer' and exists (
      select 1 from public.user_roles r where r.user_id=(select auth.uid()) and r.role='customer'
    ))
    or (participant_kind='guest' and exists (
      select 1 from public.messenger_guest_identities g where g.user_id=(select auth.uid())
    ))
    or (participant_kind='employee' and service_slug='employee-owner' and exists (
      select 1 from public.user_roles r where r.user_id=(select auth.uid()) and r.role='employee'
    ))
  )
);

create policy service_conversations_owner_update on public.service_conversations
for update to authenticated using (private.is_owner()) with check (
  private.is_owner() and (
    assigned_employee_id is null or exists (
      select 1 from public.user_roles r where r.user_id=assigned_employee_id and r.role='employee'
    )
  )
);

drop policy if exists messages_read on public.messages;
drop policy if exists messages_insert on public.messages;
drop policy if exists messages_recipient_update on public.messages;

create policy messages_conversation_read on public.messages for select to authenticated using (
  (conversation_id is null and (sender_id=(select auth.uid()) or recipient_id=(select auth.uid()) or private.is_owner()))
  or exists (
    select 1 from public.service_conversations c where c.id=conversation_id and (
      c.customer_id=(select auth.uid()) or private.is_owner()
      or (c.assigned_employee_id=(select auth.uid()) and exists (
        select 1 from public.user_roles r where r.user_id=(select auth.uid()) and r.role='employee'
      ))
    )
  )
);

create policy messages_conversation_insert on public.messages for insert to authenticated with check (
  sender_id=(select auth.uid()) and (
    (conversation_id is null and private.can_message(recipient_id, request_id))
    or exists (
      select 1 from public.service_conversations c where c.id=conversation_id and (
        (c.customer_id=(select auth.uid()) and (recipient_id is null or (c.participant_kind='employee' and recipient_id=c.customer_id)))
        or (private.is_owner() and recipient_id=c.customer_id)
        or (c.assigned_employee_id=(select auth.uid()) and recipient_id=c.customer_id and exists (
          select 1 from public.user_roles r where r.user_id=(select auth.uid()) and r.role='employee'
        ))
      )
    )
  )
);

create policy messages_conversation_update on public.messages for update to authenticated
using (
  recipient_id=(select auth.uid()) or private.is_owner()
  or exists (select 1 from public.service_conversations c where c.id=conversation_id and c.customer_id=(select auth.uid()))
  or exists (select 1 from public.service_conversations c where c.id=conversation_id and c.assigned_employee_id=(select auth.uid()))
)
with check (
  recipient_id=(select auth.uid()) or private.is_owner()
  or exists (select 1 from public.service_conversations c where c.id=conversation_id and c.customer_id=(select auth.uid()))
  or exists (select 1 from public.service_conversations c where c.id=conversation_id and c.assigned_employee_id=(select auth.uid()))
);

drop policy if exists message_photos_read on storage.objects;
drop policy if exists message_photos_insert on storage.objects;
create policy message_photos_read on storage.objects for select to authenticated using (
  bucket_id='message-photos' and exists (
    select 1 from public.service_conversations c
    where c.id=((storage.foldername(name))[1])::uuid and (
      c.customer_id=(select auth.uid()) or private.is_owner()
      or (c.assigned_employee_id=(select auth.uid()) and exists (
        select 1 from public.user_roles r where r.user_id=(select auth.uid()) and r.role='employee'
      ))
    )
  )
);
create policy message_photos_insert on storage.objects for insert to authenticated with check (
  bucket_id='message-photos'
  and (storage.foldername(name))[2]=(select auth.uid())::text
  and storage.extension(name) in ('jpg','jpeg','png','webp','heic','heif')
  and exists (
    select 1 from public.service_conversations c where c.id=((storage.foldername(name))[1])::uuid and (
      c.customer_id=(select auth.uid()) or private.is_owner()
      or (c.assigned_employee_id=(select auth.uid()) and exists (
        select 1 from public.user_roles r where r.user_id=(select auth.uid()) and r.role='employee'
      ))
    )
  )
);
