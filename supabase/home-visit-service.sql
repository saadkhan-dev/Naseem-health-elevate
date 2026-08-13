-- ============================================================
-- Health Elevate — Home Visit service
-- Run once in the Supabase SQL Editor. Safe to re-run.
--
-- Adds a single "Home Visit" service row. It is idempotent and never deletes
-- or modifies existing services, appointments, RLS, notifications or auth.
--
--   * price = 0            → flexible fee, quoted per visit (never a fixed price)
--   * duration_minutes = 60 → nominal value required by the schema; the public
--                             UI shows "Flexible duration" and the slot grid
--                             uses it only to lay out 60-minute visit slots.
-- ============================================================

insert into public.services (name, description, duration_minutes, price, is_active)
select 'Home Visit',
       'In-home consultation with Dr. Naseem Ahmed Khan. The fee is flexible and depends on time and distance.',
       60,
       0,
       true
where not exists (
  select 1 from public.services where lower(name) = lower('Home Visit')
);
