-- ============================================================
-- Health Elevate — Video Consultation offers + payment details
-- Run ONCE in the Supabase SQL Editor. Safe to re-run.
--
-- Adds:
--   1. payment_methods detail columns shown to the patient when they pick a
--      method (account_holder_name / bank_name / account_number / iban /
--      mobile_number).
--   2. appointments.payment_amount (the amount actually charged — after any
--      offer discount) and appointments.offer_id (which offer was applied).
--   3. 'waived' added to the appointments.payment_status CHECK (a waived
--      consultation needs no payment and can go straight to the video call).
--   4. video_offers table — waive / percent / fixed offers with start/end
--      dates, eligibility (all | new_patients) and terms.
--   5. video_offer_usage table — records which appointment consumed an offer,
--      so a "new patient" offer can only be used once per patient.
--   6. RLS policies for the two new tables.
--
-- Depends on `public.is_admin()` from rls-policies.sql.
-- ============================================================

-- 1) Payment method detail fields ----------------------------------
alter table public.payment_methods add column if not exists account_holder_name text;
alter table public.payment_methods add column if not exists bank_name text;
alter table public.payment_methods add column if not exists account_number text;
alter table public.payment_methods add column if not exists iban text;
alter table public.payment_methods add column if not exists mobile_number text;

-- 2) Payment snapshot on appointments -------------------------------
alter table public.appointments add column if not exists payment_amount numeric;
alter table public.appointments add column if not exists offer_id uuid;

-- 3) payment_status now also allows 'waived' (offer covers the fee) --
alter table public.appointments drop constraint if exists appointments_payment_status_check;
alter table public.appointments add constraint appointments_payment_status_check
  check (payment_status in
    ('payment_pending', 'payment_submitted', 'payment_verified', 'payment_failed', 'refunded', 'waived'));

-- 4) video_offers table ---------------------------------------------
create table if not exists public.video_offers (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  -- waive = fully free | percent = % off | fixed = flat Rs. off
  offer_type text not null check (offer_type in ('waive', 'percent', 'fixed')),
  discount_percent int check (discount_percent is null or (discount_percent between 1 and 100)),
  discount_amount numeric check (discount_amount is null or discount_amount >= 0),
  start_date date not null default current_date,
  end_date date,
  is_active boolean not null default true,
  -- all = anyone | new_patients = only patients who have never used a video offer
  eligibility text not null default 'all' check (eligibility in ('all', 'new_patients')),
  terms text,
  created_at timestamptz not null default now(),
  check (offer_type <> 'percent' or discount_percent is not null),
  check (offer_type <> 'fixed' or discount_amount is not null)
);

alter table public.video_offers enable row level security;

drop policy if exists video_offers_read_public on public.video_offers;
create policy video_offers_read_public on public.video_offers
  for select to anon, authenticated
  using (true);

drop policy if exists video_offers_admin_write on public.video_offers;
create policy video_offers_admin_write on public.video_offers
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- 5) video_offer_usage table -----------------------------------------
create table if not exists public.video_offer_usage (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.video_offers(id) on delete cascade,
  appointment_id uuid references public.appointments(id) on delete cascade,
  patient_name text,
  patient_phone text,
  patient_email text,
  used_at timestamptz not null default now()
);

create index if not exists video_offer_usage_patient_idx
  on public.video_offer_usage (patient_phone, patient_email);
create index if not exists video_offer_usage_appointment_idx
  on public.video_offer_usage (appointment_id);

alter table public.video_offer_usage enable row level security;

drop policy if exists video_offer_usage_admin_all on public.video_offer_usage;
create policy video_offer_usage_admin_all on public.video_offer_usage
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- 6) Foreign keys (idempotent) ---------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'appointments_offer_id_fkey'
  ) then
    alter table public.appointments add constraint appointments_offer_id_fkey
      foreign key (offer_id) references public.video_offers(id) on delete set null;
  end if;
end $$;
