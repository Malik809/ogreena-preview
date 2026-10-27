drop policy if exists service_conversations_customer_read on public.service_conversations;
drop policy if exists service_conversations_owner_read on public.service_conversations;
create policy service_conversations_participant_read on public.service_conversations
for select to authenticated using (customer_id=(select auth.uid()) or private.is_owner());

create index if not exists service_conversations_request_idx
on public.service_conversations(request_id) where request_id is not null;
