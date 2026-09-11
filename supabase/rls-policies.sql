-- ============================================================
-- Health Elevate - Row Level Security policies
-- Policy names use NO double quotes so copy-paste is safe.
-- Re-runnable: safe to run more than once.
-- ============================================================

-- Make sure content tables exist before adding policies to them.
create table if not exists public.conditions (
  id uuid primary key default gen_random_uuid(),
  category text not null default 'homeopathic' check (category in ('homeopathic', 'physiotherapy')),
  title text not null,
  description text not null default '',
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  rating int not null default 5 check (rating between 1 and 5),
  text text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Helper: is the current user an admin or doctor?
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid()
      and role in ('admin', 'doctor')
  );
$$;

-- Helper: booked time slots for a date (returns only times, no patient data).
create or replace function public.booked_slots(p_date date)
returns table(slot text)
language sql
security definer
set search_path = public
stable
as $$
  select to_char(a.time, 'HH24:MI') as slot
  from appointments a
  where a.date = p_date
    and a.status not in ('cancelled', 'rejected')
  order by a.time;
$$;

-- ============================================================
-- profiles
-- ============================================================
alter table public.profiles enable row level security;
drop policy if exists profiles_read_own on public.profiles;
drop policy if exists profiles_read_all_admin on public.profiles;
drop policy if exists profiles_insert_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;

create policy profiles_read_own on public.profiles
  for select to authenticated
  using (id = auth.uid());

create policy profiles_read_all_admin on public.profiles
  for select to authenticated
  using (public.is_admin());

create policy profiles_insert_own on public.profiles
  for insert to authenticated
  with check (id = auth.uid());

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ============================================================
-- services (public read; admin write)
-- ============================================================
alter table public.services enable row level security;
drop policy if exists services_read_public on public.services;
drop policy if exists services_admin_write on public.services;

create policy services_read_public on public.services
  for select to anon, authenticated
  using (true);

create policy services_admin_write on public.services
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ============================================================
-- availability (public read; admin write)
-- ============================================================
alter table public.availability enable row level security;
drop policy if exists availability_read_public on public.availability;
drop policy if exists availability_admin_write on public.availability;

create policy availability_read_public on public.availability
  for select to anon, authenticated
  using (true);

create policy availability_admin_write on public.availability
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ============================================================
-- appointments (admin all; patient own; insert own)
-- ============================================================
alter table public.appointments enable row level security;
drop policy if exists appointments_read_own on public.appointments;
drop policy if exists appointments_read_all_admin on public.appointments;
drop policy if exists appointments_insert_own on public.appointments;
drop policy if exists appointments_admin_update on public.appointments;
drop policy if exists appointments_admin_delete on public.appointments;

create policy appointments_read_own on public.appointments
  for select to authenticated
  using (patient_id = auth.uid());

create policy appointments_read_all_admin on public.appointments
  for select to authenticated
  using (public.is_admin());

create policy appointments_insert_own on public.appointments
  for insert to authenticated
  with check (patient_id = auth.uid());

create policy appointments_admin_update on public.appointments
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy appointments_admin_delete on public.appointments
  for delete to authenticated
  using (public.is_admin());

-- ============================================================
-- products (public read; admin write)
-- ============================================================
alter table public.products enable row level security;
drop policy if exists products_read_public on public.products;
drop policy if exists products_admin_write on public.products;

create policy products_read_public on public.products
  for select to anon, authenticated
  using (true);

create policy products_admin_write on public.products
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ============================================================
-- videos (published public; admin all/write)
-- ============================================================
alter table public.videos enable row level security;
drop policy if exists videos_read_published on public.videos;
drop policy if exists videos_read_all_admin on public.videos;
drop policy if exists videos_admin_write on public.videos;

create policy videos_read_published on public.videos
  for select to anon, authenticated
  using (is_published = true);

create policy videos_read_all_admin on public.videos
  for select to authenticated
  using (public.is_admin());

create policy videos_admin_write on public.videos
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ============================================================
-- video_sessions (admin all; patient of the appointment; admin write)
-- ============================================================
alter table public.video_sessions enable row level security;
drop policy if exists video_sessions_read_patient on public.video_sessions;
drop policy if exists video_sessions_read_all_admin on public.video_sessions;
drop policy if exists video_sessions_admin_write on public.video_sessions;

create policy video_sessions_read_patient on public.video_sessions
  for select to authenticated
  using (
    exists (
      select 1 from appointments a
      where a.id = video_sessions.appointment_id
        and a.patient_id = auth.uid()
    )
  );

create policy video_sessions_read_all_admin on public.video_sessions
  for select to authenticated
  using (public.is_admin());

create policy video_sessions_admin_write on public.video_sessions
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ============================================================
-- conditions (public read; admin write)
-- ============================================================
alter table public.conditions enable row level security;
drop policy if exists conditions_read_public on public.conditions;
drop policy if exists conditions_admin_write on public.conditions;

create policy conditions_read_public on public.conditions
  for select to anon, authenticated
  using (true);

create policy conditions_admin_write on public.conditions
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ============================================================
-- reviews (public read; admin write)
-- ============================================================
alter table public.reviews enable row level security;
drop policy if exists reviews_read_public on public.reviews;
drop policy if exists reviews_admin_write on public.reviews;

create policy reviews_read_public on public.reviews
  for select to anon, authenticated
  using (true);

create policy reviews_admin_write on public.reviews
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
