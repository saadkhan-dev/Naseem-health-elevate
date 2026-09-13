-- Appointment reschedule request flow
--
-- Adds a pending-request layer so rescheduling is two-sided:
--   - Admin reschedules → patient sees "Reschedule pending" with the proposed
--     new date/time and can Accept or Decline.
--   - Patient requests reschedule → admin sees "Reschedule request" with the
--     proposed new date/time and can Approve or Reject.
--
-- In both cases, the appointment's existing date/time only change after the
-- other side accepts, preventing surprise slot moves.
--
-- Columns added (all nullable / sensible defaults — safe on existing rows):
--   reschedule_status       'none' | 'pending'  (default 'none')
--   reschedule_requested_by 'patient' | 'staff'  (nullable — null when status='none')
--   reschedule_date         date                 (nullable — proposed new date)
--   reschedule_time         time                 (nullable — proposed new time, null=flexible)
--   reschedule_requested_at timestamptz          (nullable — when request was created)
--   last_rescheduled_at     timestamptz          (nullable — when last accepted reschedule)
--
-- Run manually in the Supabase SQL Editor. Re-runnable.

-- Add columns (safe: IF NOT EXISTS / nullable / default)
alter table public.appointments
  add column if not exists reschedule_status text not null default 'none';

alter table public.appointments
  add column if not exists reschedule_requested_by text;

alter table public.appointments
  add column if not exists reschedule_date date;

alter table public.appointments
  add column if not exists reschedule_time time;

alter table public.appointments
  add column if not exists reschedule_requested_at timestamptz;

alter table public.appointments
  add column if not exists last_rescheduled_at timestamptz;

-- CHECK constraint (re-runnable)
do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'appointments_reschedule_status_check'
  ) then
    alter table public.appointments drop constraint appointments_reschedule_status_check;
  end if;
end $$;

alter table public.appointments
  add constraint appointments_reschedule_status_check
  check (reschedule_status in ('none', 'pending'));

-- Partial index for fast "pending reschedule requests" queries on the admin
-- dashboard and patient card (very few rows match at any given time).
create index if not exists appointments_reschedule_pending_idx
  on public.appointments (reschedule_requested_at)
  where reschedule_status = 'pending';

-- ---------------------------------------------------------------------------
-- QA (run after applying):
--
--   select column_name, is_nullable, column_default
--     from information_schema.columns
--    where table_schema='public' and table_name='appointments'
--      and column_name like 'reschedule%';
--
--   select count(*) as pending_requests
--     from public.appointments where reschedule_status = 'pending';