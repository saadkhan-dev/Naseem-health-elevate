-- ============================================================
-- Health Elevate — STEP 1 of 2: final service durations + cancel
-- the three old/test conflicting appointments (2026-08-11)
--
-- Run THIS script first, then run `booking-overlap-guard.sql` (STEP 2).
--
-- What it does:
--   1. Updates the four service durations to the final requirements:
--        Physiotherapy Session      45 -> 40 min
--        Homeopathic Consultation   30 -> 15 min
--        Online Video Consultation  20 -> 15 min
--        Home Visit                 60 -> NULL (flexible; doctor confirms)
--      Prices are NOT changed.
--   2. Cancels (status = 'cancelled', NOT deleted) the three old/test
--      conflicting appointments from 2026-08-11. Rows are preserved for
--      history; cancelled/rejected appointments no longer block slots.
--        Video Consultation  9e3bafab-5fd6-4bab-b40d-2f927cd5081f @ 19:30
--        Physiotherapy       8a17d321-cf89-448c-867f-be583a42985a @ 19:45
--        Home Visit          b2ff60d0-1c5b-4688-aa0a-2c59b51614e1 @ 20:00
--   3. Ends with a READ-ONLY check that ZERO active overlaps remain.
--
-- Safety: the cancellation is scoped to exactly those 3 ids + the date and
-- ABORTS (in the editor's transaction) if anything other than exactly those
-- rows is matched, so it can never touch unrelated appointments.
-- ============================================================

begin;

-- 1) Final service durations ---------------------------------------------
update public.services set duration_minutes = 40 where lower(name) like '%physiotherapy%';
update public.services set duration_minutes = 15 where lower(name) like '%homeopathic%';
update public.services set duration_minutes = 15 where lower(name) like '%video%';
update public.services set duration_minutes = null where lower(name) like '%home visit%';

-- 2) Cancel exactly the three old/test appointments -----------------------
do $$
declare
  v_updated int;
begin
  update public.appointments
     set status = 'cancelled'
   where id in (
     '9e3bafab-5fd6-4bab-b40d-2f927cd5081f',
     '8a17d321-cf89-448c-867f-be583a42985a',
     'b2ff60d0-1c5b-4688-aa0a-2c59b51614e1'
   )
     and date = date '2026-08-11'
     and status in ('confirmed', 'pending');

  get diagnostics v_updated = row_count;

  if v_updated <> 3 then
    raise exception
      'Expected exactly 3 appointments (the 2026-08-11 old/test bookings) to be cancelled, but % matched. Aborting — nothing was changed.',
      v_updated;
  end if;

  raise notice 'Cancelled % old/test appointments on 2026-08-11.', v_updated;
end $$;

-- 3) READ-ONLY verification ----------------------------------------------
-- Remaining active overlapping pairs using the FINAL service durations
-- (same semantics the migration's exclusion constraint will enforce:
--   service duration, 30-minute guard when flexible/unknown, half-open [)).
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
          + make_interval(mins => coalesce(s1.duration_minutes, 30)),
        '[)'
      ) &&
      tsrange(
        a2.date::date + a2.time::time,
        a2.date::date + a2.time::time
          + make_interval(mins => coalesce(s2.duration_minutes, 30)),
        '[)'
      );

commit;
