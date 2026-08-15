-- ============================================================
-- Doctor → patient test recommendations
--
-- When a doctor/admin reviews a patient's report in the Reports
-- section and recommends a test, a row is created here and the
-- recommendation automatically shows up on that patient's dashboard.
--
-- Run manually in the Supabase SQL Editor. Re-runnable (IF NOT
-- EXISTS / DROP POLICY + CREATE POLICY — safe to run more than once).
-- Depends on public.is_admin() (defined in rls-policies.sql).
-- ============================================================

create table if not exists public.test_recommendations (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references auth.users (id) on delete cascade,
  test_name text not null,
  notes text not null default '',
  status text not null default 'pending'
    check (status in ('pending', 'completed')),
  created_at timestamptz not null default now()
);

create index if not exists test_recommendations_patient_idx
  on public.test_recommendations (patient_id, created_at desc);

alter table public.test_recommendations enable row level security;

drop policy if exists test_recommendations_read_own on public.test_recommendations;
drop policy if exists test_recommendations_read_all_admin on public.test_recommendations;
drop policy if exists test_recommendations_update_own on public.test_recommendations;
drop policy if exists test_recommendations_admin_write on public.test_recommendations;

-- Patients can only read their own recommendations.
create policy test_recommendations_read_own on public.test_recommendations
  for select to authenticated
  using (patient_id = auth.uid());

-- Admins/doctors can read every recommendation.
create policy test_recommendations_read_all_admin on public.test_recommendations
  for select to authenticated
  using (public.is_admin());

-- Patients may confirm their own recommended test is done.
create policy test_recommendations_update_own on public.test_recommendations
  for update to authenticated
  using (patient_id = auth.uid())
  with check (patient_id = auth.uid() and status in ('pending', 'completed'));

-- Only admins/doctors create/update recommendations (service-role client is
-- the primary writer; this is defence in depth for any client-side write).
create policy test_recommendations_admin_write on public.test_recommendations
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());