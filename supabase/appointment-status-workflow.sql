-- Appointment status workflow
--
-- Extends the appointment lifecycle with two new statuses:
--   'arrived'  -> normal in-clinic appointment: patient physically arrived
--   'no_show'  -> patient did not attend (normal or video consultation)
--
-- It does NOT drop the CHECK constraint blindly — it redefines it to the
-- previous allowed set plus the two new values, so existing rows are never
-- rejected (the constraint is only relaxed).
--
-- Video consultation "Verified" / "Waived" are NOT statuses: they live on the
-- existing `payment_status` column ('payment_verified' / 'waived'), so the
-- payment system is untouched.
--
-- Rerunnable: safe to run more than once.

-- 1) Re-runnable CHECK constraint on status -----------------------------
do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'appointments_status_check'
  ) then
    alter table public.appointments drop constraint appointments_status_check;
  end if;
end $$;

alter table public.appointments add constraint appointments_status_check
  check (status in
    ('pending', 'confirmed', 'rejected', 'completed', 'cancelled', 'arrived', 'no_show'));

-- 2) A no-show patient never used the slot, so free it for rebooking ------
create or replace function public.booked_slots_with_duration(p_date date)
returns table(slot text, duration_minutes int)
language sql
security definer
set search_path = public
stable
as $$
  select to_char(a.time, 'HH24:MI') as slot, coalesce(s.duration_minutes, 0) as duration_minutes
  from appointments a
  join services s on s.id = a.service_id
  where a.date = p_date
    and a.time is not null
    and a.status not in ('cancelled', 'rejected', 'no_show')
  order by a.time;
$$;
