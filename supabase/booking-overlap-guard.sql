-- ============================================================
-- Health Elevate — Duration-aware overlap protection
-- Run in the Supabase SQL Editor. Safe to re-run.
--
-- Why:
--   `appointments_slot_uidx` only blocks ACTIVE appointments with the EXACT
--   same (date, time). It cannot express duration-aware overlap: a 40-minute
--   Physiotherapy at 19:00 (19:00–19:40) and a 15-minute Homeopathic
--   appointment at 19:15 (19:15–19:30) have different `time` values, so the
--   old unique index lets them both in. The app-level overlap scan was the
--   only guard and it is not atomic — under concurrency two overlapping
--   different-start bookings could both be accepted.
--
-- What this adds:
--   1. appointments.duration_minutes — snapshot of the service duration at
--      booking time (NULL = flexible, e.g. Home Visit).
--   2. appointments.slot_range — a GENERATED [start, start+duration) range
--      from date + time. NULL time (Home Visit) => NULL range => never
--      conflicts; a time with no recorded duration gets a 30-minute guard.
--   3. appointments_overlap_excl — an EXCLUDE USING gist constraint on
--      (date WITH =, slot_range WITH &&) that atomically rejects ANY two
--      active appointments whose intervals overlap, for the same status set
--      the old index used (cancelled/rejected rows are free again).
--
-- The old exact-time index `appointments_slot_uidx` is KEPT as defense in
-- depth (it is fully subsumed by the exclusion constraint but costs nothing).
-- No existing appointments are deleted or modified (only backfilled with the
-- service duration). A failed pre-flight aborts the whole script in the SQL
-- editor's single transaction, so nothing is left half-applied.
--
-- Pre-flight: if existing ACTIVE appointments already overlap (legacy data),
-- the migration ABORTS without touching anything and lists the conflicting
-- rows so they can be rescheduled/cancelled first.
--
-- Intervals are half-open [start, end):
--   19:00–19:40 and 19:40–20:20 = ALLOWED (adjacent)
--   19:00–19:40 and 19:30–19:45 = REJECTED (overlap)
-- ============================================================

-- 1) Denormalized duration snapshot ------------------------------------
alter table public.appointments add column if not exists duration_minutes int;

update public.appointments a
set duration_minutes = s.duration_minutes
from public.services s
where s.id = a.service_id
  and a.duration_minutes is null;

-- 2) Generated slot range ------------------------------------------------
-- tsrange (in clinic-local time, Asia/Karachi — the same wall-clock date+time
-- the rest of the app uses; no timezone conversion). Explicit casts keep this
-- correct even if the dashboard-created columns were typed loosely.
alter table public.appointments
  add column if not exists slot_range tsrange
  generated always as (
    case
      when time is null then null
      when duration_minutes is null
        then tsrange(date::date + time::time, date::date + time::time + interval '30 minutes', '[)')
      else tsrange(
        date::date + time::time,
        date::date + time::time + make_interval(mins => duration_minutes),
        '[)')
    end
  ) stored;

-- 3) btree_gist for `date WITH =` in the exclusion constraint -------------
create extension if not exists btree_gist;

-- 4) Pre-flight: refuse to create the guard while existing data violates it.
-- NO rows are modified or deleted here — existing appointments are preserved.
-- Uses the SAME effective intervals the constraint enforces: the generated
-- `slot_range` semantics, i.e. tsrange(date + time, date + time + duration,
-- '[)') with a 30-minute fallback when duration is unknown. The join already
-- restricts to the same date (mirroring the constraint's `date WITH =`) and
-- to the same status set (mirroring its partial WHERE predicate).
do $$
declare
  overlap record;
  found boolean := false;
begin
  for overlap in
    select
      a1.id as a1_id,
      a1.date,
      to_char(a1.time, 'HH24:MI') as a1_time,
      coalesce(a1.duration_minutes, 30) as a1_dur,
      a2.id as a2_id,
      to_char(a2.time, 'HH24:MI') as a2_time,
      coalesce(a2.duration_minutes, 30) as a2_dur
    from public.appointments a1
    join public.appointments a2
      on a2.id > a1.id
      and a2.date = a1.date
      and a1.status not in ('cancelled', 'rejected')
      and a2.status not in ('cancelled', 'rejected')
      and a1.time is not null
      and a2.time is not null
      and tsrange(
            a1.date::date + a1.time::time,
            a1.date::date + a1.time::time + make_interval(mins => coalesce(a1.duration_minutes, 30)),
            '[)'
          ) &&
          tsrange(
            a2.date::date + a2.time::time,
            a2.date::date + a2.time::time + make_interval(mins => coalesce(a2.duration_minutes, 30)),
            '[)'
          )
  loop
    if not found then
      found := true;
      raise notice 'Existing overlapping active appointments must be resolved before the overlap guard can be created:';
    end if;
    raise notice '  % on % at % (% min) overlaps % at % (% min)',
      overlap.a1_id, overlap.date, overlap.a1_time, overlap.a1_dur,
      overlap.a2_id, overlap.a2_time, overlap.a2_dur;
  end loop;

  if found then
    raise exception
      'Cannot create appointments_overlap_excl: existing active appointments already overlap (see notices above). Reschedule or cancel one of each conflicting pair, then re-run this migration. No data was modified.';
  end if;
end $$;

-- 5) Race-safe overlap guard ----------------------------------------------
-- Re-runnable: drop the (non-existent or previous) constraint first, then add.
alter table public.appointments drop constraint if exists appointments_overlap_excl;

alter table public.appointments
  add constraint appointments_overlap_excl
  exclude using gist (date with =, slot_range with &&)
  where (status not in ('cancelled', 'rejected'));

-- 6) booked_slots_with_duration now prefers the denormalized duration -------
create or replace function public.booked_slots_with_duration(p_date date)
returns table(slot text, duration_minutes int)
language sql
security definer
set search_path = public
stable
as $$
  select
    to_char(a.time, 'HH24:MI') as slot,
    coalesce(a.duration_minutes, s.duration_minutes, 0) as duration_minutes
  from appointments a
  join services s on s.id = a.service_id
  where a.date = p_date
    and a.time is not null
    and a.status not in ('cancelled', 'rejected')
  order by a.time;
$$;
