-- ============================================================
-- Health Elevate — Appointment flow migration
-- Run ONCE in the Supabase SQL Editor. Safe to re-run.
--
-- Adds:
--   1. patient_email column on appointments (status lookup)
--   2. DB-level double-booking guard (unique active slot per date+time)
--   3. Guest booking/read RLS policies (re-runnable)
--   4. booked_slots now frees Rejected slots too
--   5. Resets availability to clinic hours:
--      Mon–Sat 7:00 PM – 11:00 PM, Sunday 11:00 AM – 1:00 PM
--
-- NOTE: The patient-facing Appointment ID is the `appointment_no` short code
-- (e.g. APT-7K4M92) added by `short-patient-ids.sql`. The appointment row id
-- (a UUID) remains the internal primary key and is never shown to patients.
-- ============================================================

-- 1) Columns ----------------------------------------------------
alter table public.appointments add column if not exists patient_email text;

-- 2) Unique indexes ----------------------------------------------

-- One active (non-cancelled/non-rejected) appointment per date+time.
create unique index if not exists appointments_slot_uidx
  on public.appointments (date, time)
  where status not in ('cancelled', 'rejected');

-- 3) Guest booking RLS policies (re-runnable) ---------------------
drop policy if exists appointments_insert_guest on public.appointments;
create policy appointments_insert_guest on public.appointments
  for insert to anon
  with check (patient_id is null);

-- NOTE: the SELECT policy below must reference ONLY the row's own columns.
-- Using a subquery/function that scans `appointments` (as the old
-- is_guest_appointment(id) helper did) makes Postgres unable to evaluate the
-- policy during `INSERT ... RETURNING` — the just-inserted row is not yet
-- visible to subqueries in the same statement — so guest bookings that used
-- `.insert(...).select()` failed with 42501 "new row violates RLS". The direct
-- `patient_id is null` check has identical access semantics (anon reads only
-- guest rows) and evaluates fine on both plain SELECTs and INSERT ... RETURNING.
drop policy if exists appointments_read_guest on public.appointments;
create policy appointments_read_guest on public.appointments
  for select to anon
  using (patient_id is null);

create or replace function public.is_guest_session(sid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from video_sessions s
    join appointments a on a.id = s.appointment_id
    where s.id = sid
      and a.patient_id is null
  );
$$;

drop policy if exists video_sessions_read_guest on public.video_sessions;
create policy video_sessions_read_guest on public.video_sessions
  for select to anon
  using (public.is_guest_session(id));

-- 4) booked_slots: Rejected slots are free again -------------------
create or replace function public.booked_slots(p_date date)
returns table(slot text)
language sql
security definer
set search_path = public
stable
as $$
  select to_char(a.time, 'HH24:MI') as slot
  from appointments a
  where a.date = p_date
    and a.status not in ('cancelled', 'rejected')
  order by a.time;
$$;

-- 5) Reset availability to clinic hours ----------------------------
delete from public.availability;
insert into public.availability (day_of_week, start_time, end_time, is_available)
values
  (0, '11:00', '13:00', true),  -- Sunday   11:00 AM – 1:00 PM
  (1, '19:00', '23:00', true),  -- Monday   7:00 PM – 11:00 PM
  (2, '19:00', '23:00', true),  -- Tuesday  7:00 PM – 11:00 PM
  (3, '19:00', '23:00', true),  -- Wednesday 7:00 PM – 11:00 PM
  (4, '19:00', '23:00', true),  -- Thursday 7:00 PM – 11:00 PM
  (5, '19:00', '23:00', true),  -- Friday   7:00 PM – 11:00 PM
  (6, '19:00', '23:00', true);  -- Saturday 7:00 PM – 11:00 PM
