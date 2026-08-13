-- ============================================================
-- Health Elevate — Service durations + prepaid Video Consultation payments
-- Run ONCE in the Supabase SQL Editor. Safe to re-run.
--
-- Adds:
--   1. Service-specific durations:
--        Physiotherapy Session       45 → 40 min
--        Homeopathic Consultation    30 → 15 min
--        Online Video Consultation   20 → 15 min, price 1000 → 500 (prepaid)
--        Home Visit                  60 → NULL (flexible; doctor confirms time)
--   2. appointments.time made nullable (Home Visit has no fixed slot)
--   3. Prepaid payment tracking columns on appointments
--      (payment_status / payment_method / payment_reference /
--       payment_payer_name / payment_submitted_at / payment_verified_at)
--   4. booked_slots_with_duration(date) RPC — returns each booked slot with
--      its service duration so the UI/server can prevent overlapping bookings
--      (the existing booked_slots RPC still returns only times and is kept).
--   5. payment_methods table (seeded with Bank Transfer / Easypaisa
--      placeholders) + public read / admin write RLS policies.
--
-- Depends on `public.is_admin()` from rls-policies.sql.
-- ============================================================

-- 1) Service durations + video price --------------------------------
update public.services set duration_minutes = 40 where lower(name) like '%physiotherapy%';
update public.services set duration_minutes = 15 where lower(name) like '%homeopathic%';
update public.services set duration_minutes = 15, price = 500 where lower(name) like '%video%';
update public.services set duration_minutes = null where lower(name) like '%home visit%';

-- 2) Home Visit has no fixed slot → allow NULL time -------------------
alter table public.appointments alter column time drop not null;

-- 3) Prepaid payment tracking on appointments -------------------------
alter table public.appointments add column if not exists payment_status text not null default 'payment_pending';
alter table public.appointments add column if not exists payment_method text;
alter table public.appointments add column if not exists payment_reference text;
alter table public.appointments add column if not exists payment_payer_name text;
alter table public.appointments add column if not exists payment_submitted_at timestamptz;
alter table public.appointments add column if not exists payment_verified_at timestamptz;

-- Re-runnable CHECK constraint on payment_status.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'appointments_payment_status_check'
  ) then
    alter table public.appointments add constraint appointments_payment_status_check
      check (payment_status in
        ('payment_pending', 'payment_submitted', 'payment_verified', 'payment_failed', 'refunded'));
  end if;
end $$;

-- 4) booked_slots_with_duration RPC ------------------------------------
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
    and a.status not in ('cancelled', 'rejected')
  order by a.time;
$$;

-- 5) payment_methods table ----------------------------------------------
create table if not exists public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  instructions text not null default '',
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.payment_methods enable row level security;

drop policy if exists payment_methods_read_public on public.payment_methods;
create policy payment_methods_read_public on public.payment_methods
  for select to anon, authenticated
  using (true);

drop policy if exists payment_methods_admin_write on public.payment_methods;
create policy payment_methods_admin_write on public.payment_methods
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

insert into public.payment_methods (name, description, instructions, is_active, sort_order)
select v.name, v.description, v.instructions, v.is_active, v.sort_order
from (
  values
    ('Bank Transfer',
     'Pay by direct bank transfer to the clinic account.',
     'Bank account details: To be configured by admin.',
     true, 1),
    ('Easypaisa',
     'Pay using the Easypaisa mobile wallet.',
     'Easypaisa account / number: To be configured by admin.',
     true, 2)
) as v(name, description, instructions, is_active, sort_order)
where not exists (select 1 from public.payment_methods);
