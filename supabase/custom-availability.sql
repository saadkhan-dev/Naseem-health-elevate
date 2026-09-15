-- ============================================================
-- Health Elevate — Extra / custom availability slots
--
-- One-time availability for a SPECIFIC date, layered on top of the
-- regular weekly `availability` schedule. Used e.g. when the doctor
-- normally rests on Sunday but wants to see patients one Sunday
-- (4:00–7:00 PM), or so a second doctor/provider can publish their
-- own one-off slots.
--
-- The regular `availability` table is left completely untouched, so
-- existing recurring timings keep working as before. Custom slots are
-- merged in at booking/slot-listing time.
--
-- Re-runnable: safe to run more than once.
-- ============================================================

create table if not exists public.custom_availability (
  id uuid primary key default gen_random_uuid(),
  -- Optional doctor/provider this slot belongs to (NULL = clinic-wide).
  -- The booking flow is single-provider today, so this is metadata that
  -- lets a newly hired provider own their slots without breaking it.
  doctor_id uuid references public.profiles(id) on delete set null,
  specific_date date not null,
  start_time time not null,
  end_time time not null,
  is_available boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint custom_availability_valid_range check (end_time > start_time),
  constraint custom_availability_unique_slot unique (doctor_id, specific_date, start_time, end_time)
);

create index if not exists custom_availability_date_idx
  on public.custom_availability (specific_date);

-- ============================================================
-- RLS: public read; admin/doctor write (mirrors `availability`)
-- ============================================================
alter table public.custom_availability enable row level security;

drop policy if exists custom_availability_read_public on public.custom_availability;
create policy custom_availability_read_public on public.custom_availability
  for select to anon, authenticated
  using (true);

drop policy if exists custom_availability_admin_write on public.custom_availability;
create policy custom_availability_admin_write on public.custom_availability
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());