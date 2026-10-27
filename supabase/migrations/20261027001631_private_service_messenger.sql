create table if not exists public.service_conversations (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id) on delete cascade,
  service_slug text not null check (service_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  request_id uuid references public.service_requests(id) on delete set null,
  status text not null default 'open' check (status in ('open','archived')),
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (customer_id, service_slug)
);

alter table public.service_conversations enable row level security;
grant select, insert, update on public.service_conversations to authenticated;

create policy service_conversations_customer_read on public.service_conversations
for select to authenticated using (customer_id = (select auth.uid()));
create policy service_conversations_customer_insert on public.service_conversations
for insert to authenticated with check (
  customer_id = (select auth.uid())
  and exists (select 1 from public.user_roles r where r.user_id=(select auth.uid()) and r.role='customer')
);
create policy service_conversations_owner_read on public.service_conversations
for select to authenticated using (private.is_owner());
create policy service_conversations_owner_update on public.service_conversations
for update to authenticated using (private.is_owner()) with check (private.is_owner());

alter table public.messages alter column recipient_id drop not null;
alter table public.messages add column if not exists conversation_id uuid references public.service_conversations(id) on delete cascade;
alter table public.messages add column if not exists message_type text not null default 'text' check (message_type in ('text','photo','estimate','appointment'));
alter table public.messages add column if not exists attachment_path text;
alter table public.messages add column if not exists attachment_name text;
create index if not exists messages_conversation_created_idx on public.messages(conversation_id, created_at);
create index if not exists service_conversations_customer_last_idx on public.service_conversations(customer_id, last_message_at desc);

drop policy if exists messages_read on public.messages;
drop policy if exists messages_insert on public.messages;
drop policy if exists messages_recipient_update on public.messages;
create policy messages_read on public.messages for select to authenticated using (
  sender_id=(select auth.uid()) or recipient_id=(select auth.uid()) or private.is_owner()
  or exists (select 1 from public.service_conversations c where c.id=conversation_id and c.customer_id=(select auth.uid()))
);
create policy messages_insert on public.messages for insert to authenticated with check (
  sender_id=(select auth.uid()) and (
    (conversation_id is null and private.can_message(recipient_id, request_id))
    or exists (
      select 1 from public.service_conversations c where c.id=conversation_id and (
        (c.customer_id=(select auth.uid()) and recipient_id is null)
        or (private.is_owner() and recipient_id=c.customer_id)
      )
    )
  )
);
create policy messages_recipient_update on public.messages for update to authenticated
using (recipient_id=(select auth.uid()) or private.is_owner())
with check (recipient_id=(select auth.uid()) or private.is_owner());

create or replace function private.touch_service_conversation()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if new.conversation_id is not null then
    update public.service_conversations set last_message_at=new.created_at, updated_at=now() where id=new.conversation_id;
  end if;
  return new;
end $$;
revoke all on function private.touch_service_conversation() from public, anon, authenticated;
drop trigger if exists messages_touch_conversation on public.messages;
create trigger messages_touch_conversation after insert on public.messages
for each row execute function private.touch_service_conversation();

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('message-photos','message-photos',false,8388608,array['image/jpeg','image/png','image/webp','image/heic','image/heif'])
on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create policy message_photos_read on storage.objects for select to authenticated using (
  bucket_id='message-photos' and exists (
    select 1 from public.service_conversations c
    where c.id=((storage.foldername(name))[1])::uuid
      and (c.customer_id=(select auth.uid()) or private.is_owner())
  )
);
create policy message_photos_insert on storage.objects for insert to authenticated with check (
  bucket_id='message-photos'
  and (storage.foldername(name))[2]=(select auth.uid())::text
  and storage.extension(name) in ('jpg','jpeg','png','webp','heic','heif')
  and exists (
    select 1 from public.service_conversations c
    where c.id=((storage.foldername(name))[1])::uuid
      and (c.customer_id=(select auth.uid()) or private.is_owner())
  )
);
create policy message_photos_delete on storage.objects for delete to authenticated using (
  bucket_id='message-photos' and (owner_id=(select auth.uid())::text or private.is_owner())
);

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='messages') then
    alter publication supabase_realtime add table public.messages;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='service_conversations') then
    alter publication supabase_realtime add table public.service_conversations;
  end if;
end $$;
