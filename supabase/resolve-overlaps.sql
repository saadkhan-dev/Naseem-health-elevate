-- ============================================================
-- Health Elevate — STEP 1 of 2: resolve the blocking overlap
--
-- Run THIS script first, then run `booking-overlap-guard.sql`.
--
-- Why:
--   The overlap guard migration aborts in pre-flight while the
--   two conflicting confirmed appointments below exist. Cancelling
--   the Physiotherapy appointment clears BOTH conflicts with one
--   change (it overlaps the 19:30 Video Consultation AND the 20:00
--   Home Visit on 2026-08-11). The other two appointments are left
--   untouched.
--
--   This is a plain UPDATE (status -> 'cancelled'), NOT a DELETE,
--   so the appointment row and its history are preserved.
--
-- Safety scoping on the UPDATE so it can never hit the wrong row:
--   * id = '8a17d321-...'  (the exact conflicting appointment)
--   * date = 2026-08-11 AND time = 19:45:00
--   * status = 'confirmed'  (if it is already cancelled/rejected,
--     the UPDATE matches 0 rows and the script ABORTS with a notice)
-- ============================================================

begin;

-- 0) Re-check (READ-ONLY): the current conflicting ACTIVE pairs.
--    Uses the same effective intervals the migration guard enforces:
--    service duration (post-backfill), 30-min fallback when unknown.
select
  a1.id as a1_id,
  a1.date,
  to_char(a1.time, 'HH24:MI') as a1_time,
  coalesce(a1.duration_minutes, s1.duration_minutes, 30) as a1_eff_min,
  s1.name as a1_service,
  a1.status as a1_status,
  a2.id as a2_id,
  to_char(a2.time, 'HH24:MI') as a2_time,
  coalesce(a2.duration_minutes, s2.duration_minutes, 30) as a2_eff_min,
  s2.name as a2_service,
  a2.status as a2_status,
  '[' || to_char(a1.time, 'HH24:MI') || ', ' || to_char(
        a1.date::date + a1.time::time
          + make_interval(mins => coalesce(a1.duration_minutes, s1.duration_minutes, 30)),
        'HH24:MI') || ') overlaps [' || to_char(a2.time, 'HH24:MI') || ', ' || to_char(
        a2.date::date + a2.time::time
          + make_interval(mins => coalesce(a2.duration_minutes, s2.duration_minutes, 30)),
        'HH24:MI') || ')' as overlap_explanation
from public.appointments a1
join public.appointments a2
  on a2.id > a1.id
 and a2.date = a1.date
 and a1.status not in ('cancelled', 'rejected')
 and a2.status not in ('cancelled', 'rejected')
 and a1.time is not null
 and a2.time is not null
left join public.services s1 on s1.id = a1.service_id
left join public.services s2 on s2.id = a2.service_id
where tsrange(
        a1.date::date + a1.time::time,
        a1.date::date + a1.time::time
          + make_interval(mins => coalesce(a1.duration_minutes, s1.duration_minutes, 30)),
        '[)'
      ) &&
      tsrange(
        a2.date::date + a2.time::time,
        a2.date::date + a2.time::time
          + make_interval(mins => coalesce(a2.duration_minutes, s2.duration_minutes, 30)),
        '[)'
      )
order by a1.date, a1_time, a2_time;

-- 1) Cancel the Physiotherapy appointment that blocks the guard.
do $$
declare
  v_id uuid := '8a17d321-cf89-448c-867f-be583a42985a';
  v_updated int;
begin
  update public.appointments
     set status = 'cancelled'
   where id = v_id
     and date = date '2026-08-11'
     and time = time '19:45:00'
     and status = 'confirmed';

  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    raise exception
      'No row updated. Expected id=% (Physiotherapy, 2026-08-11 19:45, status=confirmed) — it may already be cancelled/rejected. Aborting without changes.',
      v_id;
  end if;

  raise notice 'Cancelled % row(s): id=% (Physiotherapy Session, 2026-08-11 19:45).', v_updated, v_id;
end $$;

-- 2) Confirm (READ-ONLY): remaining active overlapping pairs — should be 0.
select count(*) as remaining_active_overlapping_pairs
from public.appointments a1
join public.appointments a2
  on a2.id > a1.id
 and a2.date = a1.date
 and a1.status not in ('cancelled', 'rejected')
 and a2.status not in ('cancelled', 'rejected')
 and a1.time is not null
 and a2.time is not null
left join public.services s1 on s1.id = a1.service_id
left join public.services s2 on s2.id = a2.service_id
where tsrange(
        a1.date::date + a1.time::time,
        a1.date::date + a1.time::time
          + make_interval(mins => coalesce(a1.duration_minutes, s1.duration_minutes, 30)),
        '[)'
      ) &&
      tsrange(
        a2.date::date + a2.time::time,
        a2.date::date + a2.time::time
          + make_interval(mins => coalesce(a2.duration_minutes, s2.duration_minutes, 30)),
        '[)'
      );

commit;
