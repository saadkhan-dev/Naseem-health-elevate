-- ============================================================================
-- Consultation communication system — end-to-end debug / QA (READ-ONLY).
--
-- The app loads the patient history with:
--   /patient/consultations
--     -> src/hooks/useConsultation.ts  (usePatientConsultationHistory)
--     -> src/lib/consultation-data.ts   (getPatientConsultationHistory)
--     -> server fn consultationGetPatientHistory (src/lib/consultation.functions.ts)
--     -> src/lib/server/consultation.ts getPatientHistory
--     -> supabase-admin `rpc("consultation_history_for_user", { p_user_id })`
--
-- Run EVERYTHING in the Supabase SQL editor (needs postgres/owner privileges).
-- It only SELECTs / introspects — it changes nothing.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Do the read-model functions exist, are they SECURITY DEFINER, and who
--    can EXECUTE them? Empty result here = the migration was not fully applied.
-- ---------------------------------------------------------------------------
select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as args,
  p.prosecdef as security_definer,
  pg_get_function_result(p.oid) as returns
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'consultation_history_for_user',
    'consultation_history_for_staff',
    'consultation_unread_for_user',
    'consultation_ensure_for_appointment'
  )
order by p.proname;

select
  p.proname,
  p.prosecdef as security_definer,
  p.provolatile as volatility,
  (select string_agg(distinct grantee::text, ', ' order by grantee::text)
   from information_schema.role_routine_grants g
   where g.specific_schema = n.nspname
     and g.specific_name = p.oid::text
     and g.privilege_type = 'EXECUTE') as execute_grantees
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname like 'consultation\\_%'
order by p.proname;

-- If a function is missing entirely, re-run the full supabase/consultation-chat.sql
-- file (it is idempotent and does not change existing data beyond the AUTO-ENSURE
-- backfill, which is also idempotent).

-- ---------------------------------------------------------------------------
-- 2) RLS: is it enabled and are the policies present on all 6 consultation
--    tables? We must NOT weaken any of these.
-- ---------------------------------------------------------------------------
select
  c.relname,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
where c.relnamespace = 'public'::regnamespace
  and c.relkind = 'r'
  and c.relname like 'consultation\\_%'
order by c.relname;

select tablename, policyname, permissive, roles, cmd, qual
from pg_policies
where schemaname = 'public'
  and tablename like 'consultation\\_%'
order by tablename, policyname;

-- ---------------------------------------------------------------------------
-- 3) Data health: conversation / appointment / participant coverage.
-- ---------------------------------------------------------------------------
select
  count(*) as total_conversations,
  count(distinct appointment_id) as appointments_with_conversation
from public.consultation_conversations;

with cv as (
  select
    con.conversation_id,
    con.appointment_id,
    a.patient_id,
    con.status as convo_status,
    a.status as appt_status
  from public.consultation_conversations con
  join public.appointments a on a.id = con.appointment_id
)
select
  cv.conversation_id,
  cv.appointment_id,
  cv.patient_id,
  cv.convo_status,
  cv.appt_status,
  (select count(*) from public.consultation_participants p
    where p.conversation_id = cv.conversation_id) as participants,
  (select count(*) from public.consultation_participants p
    where p.conversation_id = cv.conversation_id and p.role = 'patient') as patient_participants,
  (select count(*) from public.consultation_participants p
    where p.conversation_id = cv.conversation_id and p.user_id = cv.patient_id
      and p.role = 'patient') as patient_bound_to_appointment,
  (select string_agg(p.role, ', ' order by p.role)
    from public.consultation_participants p
    where p.conversation_id = cv.conversation_id) as participant_roles
from cv
order by cv.appointment_id;

-- Orphan check: appointments in the consultation table with NO patient AND NO
-- doctor participant (a conversation no one can open -> "Forbidden").
select count(*) as orphan_conversations
from public.consultation_conversations con
left join public.consultation_participants p on p.conversation_id = con.conversation_id
group by con.conversation_id
having count(p.user_id) = 0;

-- ---------------------------------------------------------------------------
-- 4) The specific conversation you tested by direct URL.
-- ---------------------------------------------------------------------------
select
  con.conversation_id,
  con.appointment_id,
  a.appointment_no,
  a.patient_id,
  a.patient_email,
  pr.full_name as patient_name,
  con.status
from public.consultation_conversations con
join public.appointments a on a.id = con.appointment_id
left join public.profiles pr on pr.id = a.patient_id
where con.conversation_id = '7b2e135a-8594-4f5b-8fd1-afc427642553';

select * from public.consultation_participants
where conversation_id = '7b2e135a-8594-4f5b-8fd1-afc427642553';

select count(*) as messages
from public.consultation_messages
where conversation_id = '7b2e135a-8594-4f5b-8fd1-afc427642553';

-- ---------------------------------------------------------------------------
-- 5) Every patient profile (to copy the UUID into section 6).
-- ---------------------------------------------------------------------------
select id, full_name, role, created_at
from public.profiles
where role = 'patient'
order by full_name;

-- ---------------------------------------------------------------------------
-- 6) LIVE SIMULATION OF THE PATIENT CALL (the definitive test).
--
-- Replace <PATIENT_ID> with one of the UUIDs printed in section 5 and run
-- this whole block. It switches to the `authenticated` role, sets the JWT so
-- RLS sees the real patient, then calls the EXACT function the app uses.
-- A success prints the patient's rows; a failure prints the real error.
-- ---------------------------------------------------------------------------
begin;

set local role authenticated;

select set_config(
  'request.jwt.claims',
  '{"role": "authenticated", "sub": "<PATIENT_ID>"}',
  true
);

select
  conversation_id,
  appointment_id,
  appointment_no,
  status,
  appointment_date,
  service_name,
  unread_count,
  last_body,
  has_attachments
from public.consultation_history_for_user('<PATIENT_ID>');

rollback;