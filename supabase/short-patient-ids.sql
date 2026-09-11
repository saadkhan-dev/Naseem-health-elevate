-- ============================================================
-- Health Elevate — Short patient-facing IDs migration
-- Run ONCE in the Supabase SQL Editor. Safe to re-run.
--
-- Adds:
--   1. appointments.appointment_no  -> short patient-facing number (e.g. APT-7K4M92)
--   2. video_sessions.vc_no         -> short patient-facing consultation number (e.g. VC-8F3K21)
--   3. Unique (partial) indexes so the server can retry on collision and
--      guarantee uniqueness at the database level.
--
-- Internal UUID primary keys and foreign keys are NOT touched. Existing rows
-- keep working: lookups fall back to the row UUID when appointment_no/vc_no is
-- null (i.e. for appointments created before this migration).
-- ============================================================

alter table public.appointments add column if not exists appointment_no text;
alter table public.video_sessions add column if not exists vc_no text;

-- Partial indexes: NULL (legacy rows) are allowed to repeat; generated codes
-- must be unique. The server generates codes and retries when it sees the
-- "appointments_appointment_no_uidx" / "video_sessions_vc_no_uidx" conflict.
create unique index if not exists appointments_appointment_no_uidx
  on public.appointments (appointment_no)
  where appointment_no is not null;

create unique index if not exists video_sessions_vc_no_uidx
  on public.video_sessions (vc_no)
  where vc_no is not null;
