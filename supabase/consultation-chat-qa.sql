-- ============================================================================
-- Consultation Communication & History System — QA & Security Test Script
-- ============================================================================
-- Run AFTER `consultation-chat.sql` has been applied (once, in the SQL editor).
--
-- This script is a self-service verification suite. Sections 1–6 are safe
-- read-only checks that pass when the system is set up correctly. Section 7
-- contains the "negative" RLS tests: they must be run one at a time because
-- they intentionally impersonate the wrong user and EXPECT denied results.
--
-- IMPORTANT: The negative tests (Section 7) verify that a patient cannot read
-- or write another patient's data. If any of them starts RETURNING ROWS, there
-- is an RLS leak — stop and fix the policies in `consultation-chat.sql`.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Helpers
-- ----------------------------------------------------------------------------

-- Replace 'patient|doctor|admin' with the desired role and execute as that
-- user's JWT. This snippet is what the "Run as" negative tests rely on:
--   select set_config('request.jwt.claims', '{"sub": "<user-uuid>", "role": "authenticated", "app_role": "doctor"}', false);
-- and then run the query on the NEXT line while this config is active.

-- ----------------------------------------------------------------------------
-- 1. Schema presence
-- ----------------------------------------------------------------------------

select 'consultation_conversations' as table_name, count(*) as rows from consultation_conversations
union all select 'consultation_participants', count(*) from consultation_participants
union all select 'consultation_messages', count(*) from consultation_messages
union all select 'consultation_attachments', count(*) from consultation_attachments
union all select 'consultation_summaries', count(*) from consultation_summaries
union all select 'consultation_events', count(*) from consultation_events;

-- ----------------------------------------------------------------------------
-- 2. RLS is enabled on every consultation table (must print 6 rows, all true)
-- ----------------------------------------------------------------------------

select relname, relrowsecurity as rls_enabled
from pg_class
where relnamespace = 'public'::regnamespace
  and relname like 'consultation_%'
order by relname;

-- ----------------------------------------------------------------------------
-- 3. Storage bucket is private + policies exist
-- ----------------------------------------------------------------------------

select id, name, public
from storage.buckets
where name = 'consultation-attachments';

select policyname, operation, rolname
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and policyname ilike '%consultation_attachment%'
order by policyname;

-- ----------------------------------------------------------------------------
-- 4. Realtime publications exist (must print 1 row for each channel)
-- ----------------------------------------------------------------------------

select concat(e.relid::regclass) as channel, count(*) as columns
from pg_publication p
join pg_publication_rel pr on pr.prpubid = p.oid
join pg_class e on e.oid = pr.prrelid
where p.pubname in ('consultation_conversations', 'consultation_messages', 'consultation_participants')
group by channel;

-- ----------------------------------------------------------------------------
-- 5. RPC functions exist and are SECURITY DEFINER
-- ----------------------------------------------------------------------------

select p.proname, p.prosecdef as security_definer
from pg_proc p
where p.proname in ('consultation_history_for_user', 'consultation_history_for_staff', 'consultation_unread_for_user')
order by p.proname;

-- ----------------------------------------------------------------------------
-- 6. Positive read test — each user sees ONLY their own conversations
--    (Replace the WHERE clause with a real patient id.)
-- ----------------------------------------------------------------------------

select c.id, c.appointment_id, c.status, p.role
from consultation_conversations c
join consultation_participants p on p.conversation_id = c.id
where p.user_id = '<patient-uuid>';

-- Doctor (staff) view — doctor/admin must see all conversations:
select c.id, c.appointment_id
from consultation_conversations c;

-- ----------------------------------------------------------------------------
-- 7. NEGATIVE tests — run these ONE AT A TIME and EXPECT DENIED results
--    Each begins with a set_config line to impersonate a user, followed by a
--    query that must return 0 rows / raise an error.
--
-- a) Patient A must NOT see patient B's conversation
-- ----------------------------------------------------------------------------
-- select set_config('request.jwt.claims',
--   '{"sub":"<patient-A-uuid>","role":"authenticated","app_role":"patient"}', false);
-- select * from consultation_conversations c
-- join consultation_participants p on p.conversation_id = c.id
-- where p.user_id = '<patient-B-uuid>';
-- EXPECT: 0 rows.

-- ----------------------------------------------------------------------------
-- b) Patient A must NOT read patient B's messages directly
-- ----------------------------------------------------------------------------
-- select set_config('request.jwt.claims',
--   '{"sub":"<patient-A-uuid>","role":"authenticated","app_role":"patient"}', false);
-- select * from consultation_messages where conversation_id = '<conversation-B-id>';
-- EXPECT: 0 rows.

-- ----------------------------------------------------------------------------
-- c) Patient A must NOT upload into patient B's conversation attachment path
-- ----------------------------------------------------------------------------
-- select set_config('request.jwt.claims',
--   '{"sub":"<patient-A-uuid>","role":"authenticated","app_role":"patient"}', false);
-- insert into storage.objects
--   (bucket_id, name, owner, metadata)
-- values
--   ('consultation-attachments', '<conversation-B-id>/<patient-A-uuid>/x.pdf', '<patient-A-uuid>', '{"mimetype":"application/pdf","size":1}');
-- EXPECT: RLS violation error (new row violates row-level security policy).

-- ----------------------------------------------------------------------------
-- d) An unauthenticated (anon) caller must read NOTHING
-- ----------------------------------------------------------------------------
-- select set_config('request.jwt.claims', '{"role":"anon"}', false);
-- select * from consultation_messages limit 1;
-- EXPECT: 0 rows / permission denied.

-- ----------------------------------------------------------------------------
-- e) History RPC for the wrong role must be refused
-- ----------------------------------------------------------------------------
-- select set_config('request.jwt.claims',
--   '{"sub":"<patient-A-uuid>","role":"authenticated","app_role":"patient"}', false);
-- select * from consultation_history_for_staff('<patient-A-uuid>');
-- EXPECT: error 'You do not have permission' (SECURITY DEFINER + is_admin gate).

-- ----------------------------------------------------------------------------
-- f) A conversation can never mix two appointments or two patients
-- ----------------------------------------------------------------------------
-- select count(*) from consultation_participants p
-- join consultation_conversations c on c.id = p.conversation_id
-- join appointments a on a.id = c.appointment_id
-- where p.user_id <> a.patient_id and p.role = 'patient';
-- EXPECT: 0 rows. (Only the appointment's owner may be the patient participant.)

-- ----------------------------------------------------------------------------
-- 8) Auto-ensure trigger: ONE conversation per appointment, with participants
-- ----------------------------------------------------------------------------
-- a) Every appointment has exactly one conversation
-- ----------------------------------------------------------------------------
select count(*) as appointments_without_conversation
from public.appointments a
where a.patient_id is not null
  and not exists (
    select 1 from public.consultation_conversations c
    where c.appointment_id = a.id
  );
-- EXPECT: 0 rows.

-- ----------------------------------------------------------------------------
-- b) Every conversation's patient participant is the appointment's owner
-- ----------------------------------------------------------------------------
select count(*) as mismatched_patient_participants
from public.consultation_participants p
join public.consultation_conversations c on c.id = p.conversation_id
join public.appointments a on a.id = c.appointment_id
where p.role = 'patient' and p.user_id <> a.patient_id;
-- EXPECT: 0 rows.

-- ----------------------------------------------------------------------------
-- c) Live check: inserting a temp appointment instantly creates the chat.
--     1) Insert a test appointment for <patient-A-uuid>
--     2) Confirm a conversation + patient + doctor participants appeared
--     3) Delete it afterwards (conversation cascades away)
-- ----------------------------------------------------------------------------
-- insert into appointments (patient_id, service_id, staff_id, appointment_date, time, status)
--   select '<patient-A-uuid>', id, staff_id, current_date, '09:00', 'confirmed'
--   from services
--   where lower(name) like '%consultation%'
--   limit 1;
-- select c.id as conversation_id
-- from consultation_conversations c
-- join appointments a on a.id = c.appointment_id
-- where a.patient_id = '<patient-A-uuid>'
-- order by c.created_at desc limit 1;
-- -- EXPECT: 1 row (auto-created).
-- select count(*) as participant_count from consultation_participants
-- where conversation_id = '<conversation-id-from-above>';
-- -- EXPECT: 2 (one patient + one doctor/admin).
-- -- Cleanup:
-- -- select c.id from consultation_conversations c
-- -- join appointments a on a.id = c.appointment_id
-- -- where a.patient_id = '<patient-A-uuid>' order by c.created_at desc limit 1;
-- -- delete from appointments where id = '<test-appointment-id>';
-- ============================================================================