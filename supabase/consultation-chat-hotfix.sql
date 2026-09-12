-- consultation-chat-hotfix.sql
--
-- Fixes the patient-side chat send failure.
--
-- ROOT CAUSE
-- -----------
-- consultation_messages.sender_id had no column default, so every direct
-- client insert omitted it (NULL).  The RLS INSERT policy requires
-- `sender_id = auth.uid()` → NULL = uid evaluates to UNKNOWN/FAIL →
-- every message send was silently rejected.
--
-- WHAT THIS DOES
-- ---------------
-- 1. Restores the sender_id column default to auth.uid().
-- 2. Grants the required privileges on the consultation tables to
--    `authenticated` (new tables do not inherit Supabase bootstrap grants).
--
-- HOW TO APPLY
-- ------------
-- 1. Open the Supabase dashboard.
-- 2. Go to SQL Editor and paste this entire file.
-- 3. Click "Run".
--
-- Everything is idempotent and safe to run repeatedly.
-- ---------------------------------------------------------------------------

-- 1) Restore sender_id default ---------------------------------------------
alter table public.consultation_messages
  alter column sender_id set default auth.uid();

-- 2) Table privileges -------------------------------------------------------
grant usage on schema public to authenticated;

grant select, insert, update, delete
  on public.consultation_conversations,
      public.consultation_participants,
      public.consultation_messages,
      public.consultation_attachments,
      public.consultation_summaries,
      public.consultation_events
  to authenticated;
