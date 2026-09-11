-- ============================================================
-- Health Elevate — READ-ONLY diagnostic: overlapping active appointments
--
-- This script does NOT modify anything. It only SELECTs.
-- No UPDATE / DELETE / CANCEL / constraint changes.
--
-- It uses the exact same overlap logic as `booking-overlap-guard.sql`:
--   * same date
--   * status NOT IN ('cancelled', 'rejected')
--   * time IS NOT NULL
--   * effective duration = duration_minutes, otherwise a 30-minute fallback
--   * half-open intervals [start, end)
--   * tsrange(...) && tsrange(...)
--
-- Requires the `appointments.duration_minutes` column. If a previously
-- rolled-back migration removed it, re-run `booking-overlap-guard.sql` once
-- (it will stop at the pre-flight again but leaves the column behind), then
-- run this script.
-- ============================================================

-- ------------------------------------------------------------------
-- QUERY 1 — every conflicting ACTIVE appointment pair (one row per pair)
-- ------------------------------------------------------------------
with conf as (
  select
    a1.id as a1_id,
    a1.date as a1_date,
    to_char(a1.time, 'HH24:MI') as a1_time,
    coalesce(a1.duration_minutes, 30) as a1_eff_min,
    a1.duration_minutes as a1_snapshot_min,
    s1.duration_minutes as a1_service_min,
    s1.name as a1_service,
    a1.status as a1_status,
    a2.id as a2_id,
    a2.date as a2_date,
    to_char(a2.time, 'HH24:MI') as a2_time,
    coalesce(a2.duration_minutes, 30) as a2_eff_min,
    a2.duration_minutes as a2_snapshot_min,
    s2.duration_minutes as a2_service_min,
    s2.name as a2_service,
    a2.status as a2_status,
    '[' || to_char(a1.time, 'HH24:MI') || ', ' || to_char(
        a1.date::date + a1.time::time
          + make_interval(mins => coalesce(a1.duration_minutes, 30)),
        'HH24:MI') || ') overlaps [' || to_char(a2.time, 'HH24:MI') || ', ' || to_char(
        a2.date::date + a2.time::time
          + make_interval(mins => coalesce(a2.duration_minutes, 30)),
        'HH24:MI') || ')' as overlap_explanation
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
          a1.date::date + a1.time::time
            + make_interval(mins => coalesce(a1.duration_minutes, 30)),
          '[)'
        ) &&
        tsrange(
          a2.date::date + a2.time::time,
          a2.date::date + a2.time::time
            + make_interval(mins => coalesce(a2.duration_minutes, 30)),
          '[)'
        )
  left join public.services s1 on s1.id = a1.service_id
  left join public.services s2 on s2.id = a2.service_id
)
select
  a1_id, a1_date, a1_time, a1_eff_min, a1_snapshot_min, a1_service_min,
  a1_service, a1_status,
  a2_id, a2_date, a2_time, a2_eff_min, a2_snapshot_min, a2_service_min,
  a2_service, a2_status,
  overlap_explanation
from conf
order by a1_date, a1_time, a2_time;

-- ------------------------------------------------------------------
-- QUERY 2 — are these conflicts caused by durations inferred from the
-- CURRENT service duration (i.e. the migration's backfill)?
--
-- aX_snapshot_min  = appointments.duration_minutes (what the overlap logic
--                    used; backfilled from the service for legacy rows)
-- aX_service_min   = services.duration_minutes (current value)
--
-- "inferred from current service" = snapshot IS NOT DISTINCT FROM service.
-- ------------------------------------------------------------------
with conf as (
  select
    a1.duration_minutes as a1_snapshot_min,
    s1.duration_minutes as a1_service_min,
    a2.duration_minutes as a2_snapshot_min,
    s2.duration_minutes as a2_service_min,
    a1.time, a2.time,
    a1.date, a2.date,
    a1.id, a2.id,
    a1.status, a2.status,
    a1.service_id, a2.service_id
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
          a1.date::date + a1.time::time
            + make_interval(mins => coalesce(a1.duration_minutes, 30)),
          '[)'
        ) &&
        tsrange(
          a2.date::date + a2.time::time,
          a2.date::date + a2.time::time
            + make_interval(mins => coalesce(a2.duration_minutes, 30)),
          '[)'
        )
  left join public.services s1 on s1.id = a1.service_id
  left join public.services s2 on s2.id = a2.service_id
)
select
  count(*) as total_conflicting_pairs,
  count(*) filter (
    where a1_snapshot_min is not distinct from a1_service_min
      and a2_snapshot_min is not distinct from a2_service_min
  ) as pairs_both_durations_from_current_service,
  count(*) filter (
    where a1_snapshot_min is not distinct from a1_service_min
  ) as pairs_side1_duration_from_current_service,
  count(*) filter (
    where a2_snapshot_min is not distinct from a2_service_min
  ) as pairs_side2_duration_from_current_service,
  count(*) filter (
    where a1_snapshot_min is null or a2_snapshot_min is null
  ) as pairs_with_null_snapshot_duration,
  count(*) filter (
    where (a1_snapshot_min is not distinct from a1_service_min)
      is not true
      and (a2_snapshot_min is not distinct from a2_service_min)
      is not true
  ) as pairs_both_durations_from_booking_time
from conf;

-- ------------------------------------------------------------------
-- QUERY 3 — pair listing focused on the legacy/backfill question:
-- same conflicting pairs, plus two booleans showing whether EACH side's
-- effective duration was inferred from the current service duration.
-- ------------------------------------------------------------------
with conf as (
  select
    a1.id as a1_id,
    to_char(a1.time, 'HH24:MI') as a1_time,
    coalesce(a1.duration_minutes, 30) as a1_eff_min,
    a1.duration_minutes as a1_snapshot_min,
    s1.duration_minutes as a1_service_min,
    s1.name as a1_service,
    a2.id as a2_id,
    to_char(a2.time, 'HH24:MI') as a2_time,
    coalesce(a2.duration_minutes, 30) as a2_eff_min,
    a2.duration_minutes as a2_snapshot_min,
    s2.duration_minutes as a2_service_min,
    s2.name as a2_service,
    a1.date as a1_date,
    a1.status as a1_status,
    a2.status as a2_status
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
          a1.date::date + a1.time::time
            + make_interval(mins => coalesce(a1.duration_minutes, 30)),
          '[)'
        ) &&
        tsrange(
          a2.date::date + a2.time::time,
          a2.date::date + a2.time::time
            + make_interval(mins => coalesce(a2.duration_minutes, 30)),
          '[)'
        )
  left join public.services s1 on s1.id = a1.service_id
  left join public.services s2 on s2.id = a2.service_id
)
select
  a1_date, a1_time, a1_eff_min, a1_service, a1_status,
  a2_time, a2_eff_min, a2_service, a2_status,
  (a1_snapshot_min is not distinct from a1_service_min) as a1_duration_from_current_service,
  (a2_snapshot_min is not distinct from a2_service_min) as a2_duration_from_current_service,
  a1_snapshot_min, a1_service_min, a2_snapshot_min, a2_service_min
from conf
order by a1_date, a1_time, a2_time;
