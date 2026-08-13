-- ============================================================
-- Health Elevate — SECURITY FIX: appointments UPDATE RLS
-- Run ONCE in the Supabase SQL Editor. Safe to re-run.
--
-- Root cause (found by e2e testing):
--   The live database had an owner-scoped UPDATE policy on
--   `appointments` that let ANY logged-in patient modify their
--   OWN appointment's columns — including `payment_status` and
--   `status`. A patient could therefore mark their video
--   consultation payment "payment_verified" (skipping admin
--   verification) and cancel/reject their own booking.
--
--   A stranger/guest could NOT modify other rows, so the policy
--   was owner-scoped (`patient_id = auth.uid()`) — but that is
--   still a vulnerability because the app's ONLY legitimate
--   writer of appointment rows is the admin/doctor (all app
--   writes go through server functions on the service-role
--   client; there is no patient-side update feature).
--
-- Fix:
--   Drop EVERY update policy on public.appointments except the
--   admin/doctor one, then (re)create that admin policy. After
--   this, only `public.is_admin()` (admin/doctor profile role)
--   can UPDATE appointments — patients can read their own rows
--   but never write payment/status columns.
-- ============================================================

do $$
declare
  p record;
begin
  for p in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'appointments'
      and cmd = 'UPDATE'
      and policyname <> 'appointments_admin_update'
  loop
    execute format('drop policy %I on public.appointments', p.policyname);
    raise notice 'Dropped appointments UPDATE policy %', p.policyname;
  end loop;
end $$;

-- (Re)create the single allowed update policy: admin/doctor only.
drop policy if exists appointments_admin_update on public.appointments;
create policy appointments_admin_update on public.appointments
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());
