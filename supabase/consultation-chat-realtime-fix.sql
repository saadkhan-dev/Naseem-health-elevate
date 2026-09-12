-- Make Realtime delivery reliable for the consultation chat.
--
-- postgres_changes filters (e.g. `conversation_id=eq.<id>`) need the filtered
-- columns to be included in the WAL for UPDATE/DELETE events. With the DEFAULT
-- replica identity only the primary key is carried, so an UPDATE to
-- `consultation_participants.last_read_at` or a message edit/delete would not
-- reach the subscribed chat channel even though the table is in
-- `supabase_realtime`. `REPLICA IDENTITY FULL` forces the whole row into the
-- WAL, which makes the filters work for every event type.
--
-- Run this ONCE in the Supabase SQL Editor. It is idempotent.

alter table public.consultation_messages replica identity full;
alter table public.consultation_conversations replica identity full;
alter table public.consultation_participants replica identity full;