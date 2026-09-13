-- ============================================================
-- reminders-claim.sql — atomic claim support for reminder sending
-- ============================================================
-- Adds:
--   1. reminders.updated_at — stamped whenever a run claims a row
--      (`scheduled` -> `processing`) and on every terminal update, so a
--      row stuck mid-claim can be recovered once the stamp goes stale.
--   2. 'processing' to the reminders.status CHECK.
--   3. A partial index for the stale-`processing` recovery scan.
--
-- Re-runnable: safe to run more than once in the Supabase SQL console.
-- Existing due lookups keep using reminders_due_idx (status, remind_at).
-- ============================================================

alter table public.reminders
  add column if not exists updated_at timestamptz;

update public.reminders
set updated_at = created_at
where updated_at is null;

alter table public.reminders
  alter column updated_at set default now();

alter table public.reminders
  alter column updated_at set not null;

-- Re-runnable CHECK constraint including the interim 'processing' status.
alter table public.reminders
  drop constraint if exists reminders_status_check;

alter table public.reminders
  add constraint reminders_status_check
  check (status in ('scheduled', 'processing', 'sent', 'failed', 'cancelled'));

-- Partial index: stale `processing` rows are claimed by `updated_at <= cut-off`.
create index if not exists reminders_processing_due_idx
  on public.reminders (updated_at)
  where status = 'processing';