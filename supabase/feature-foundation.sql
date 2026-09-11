-- ============================================================
-- Health Elevate — Feature foundation migration
-- Patients, FAQ, support, medical documents, orders, reminders,
-- doctor profile and review moderation.
--
-- Run once in the Supabase SQL Editor. Re-runnable (IF NOT EXISTS /
-- DROP POLICY + CREATE POLICY pattern — safe to run more than once).
--
-- Section 7 additionally hardens against a PRE-EXISTING public.orders /
-- public.order_items table (created before this migration, e.g. manually).
-- CREATE TABLE IF NOT EXISTS leaves an existing table untouched, so any
-- missing columns are backfilled with ADD COLUMN IF NOT EXISTS BEFORE the
-- indexes/policies reference them. Nothing is dropped or rebuilt and all
-- existing rows are preserved.
--
-- Depends on public.is_admin() (defined in rls-policies.sql / chat-usage.sql).
-- All app writes go through TanStack Start server functions on the
-- service-role client (RLS is bypassed) — policies below are defence in
-- depth for any client-side read/insert the app performs with the anon key.
-- ============================================================

-- ============================================================
-- 1) profiles — extra patient profile fields
-- ============================================================
alter table public.profiles add column if not exists date_of_birth date;
alter table public.profiles add column if not exists gender text;
alter table public.profiles add column if not exists address text;

-- ============================================================
-- 2) reviews — patient submission + moderation queue
-- ============================================================
alter table public.reviews add column if not exists patient_id uuid references auth.users (id) on delete set null;
alter table public.reviews add column if not exists status text not null default 'approved'
  check (status in ('pending', 'approved', 'rejected'));

-- Public reads: only active AND approved (moderation enforced at the DB level).
drop policy if exists reviews_read_public on public.reviews;
create policy reviews_read_public on public.reviews
  for select to anon, authenticated
  using (is_active = true and status = 'approved');

-- Admins see every row (including pending submissions).
drop policy if exists reviews_read_all_admin on public.reviews;
create policy reviews_read_all_admin on public.reviews
  for select to authenticated
  using (public.is_admin());

-- A logged-in patient may submit their own review; it lands in the pending
-- queue (server functions are the primary writer via the service-role key).
drop policy if exists reviews_insert_patient on public.reviews;
create policy reviews_insert_patient on public.reviews
  for insert to authenticated
  with check (patient_id = auth.uid() and status = 'pending' and is_active = false);

-- ============================================================
-- 3) patient_notifications — in-app notification center
-- ============================================================
create table if not exists public.patient_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null default 'general',
  title text not null default '',
  body text not null default '',
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists patient_notifications_user_idx
  on public.patient_notifications (user_id, created_at desc);

alter table public.patient_notifications enable row level security;

drop policy if exists patient_notifications_read_own on public.patient_notifications;
drop policy if exists patient_notifications_read_all_admin on public.patient_notifications;
drop policy if exists patient_notifications_update_own on public.patient_notifications;
drop policy if exists patient_notifications_delete_own on public.patient_notifications;

create policy patient_notifications_read_own on public.patient_notifications
  for select to authenticated
  using (user_id = auth.uid());

create policy patient_notifications_read_all_admin on public.patient_notifications
  for select to authenticated
  using (public.is_admin());

create policy patient_notifications_update_own on public.patient_notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy patient_notifications_delete_own on public.patient_notifications
  for delete to authenticated
  using (user_id = auth.uid());

-- ============================================================
-- 4) faqs
-- ============================================================
create table if not exists public.faqs (
  id uuid primary key default gen_random_uuid(),
  category text not null default 'general',
  question text not null,
  answer text not null default '',
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists faqs_sort_idx on public.faqs (category, sort_order);

alter table public.faqs enable row level security;

drop policy if exists faqs_read_public on public.faqs;
drop policy if exists faqs_admin_write on public.faqs;

create policy faqs_read_public on public.faqs
  for select to anon, authenticated
  using (true);

create policy faqs_admin_write on public.faqs
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ============================================================
-- 5) support_messages — public support form + admin inbox
-- ============================================================
create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  phone text,
  subject text not null default '',
  message text not null,
  status text not null default 'new' check (status in ('new', 'in_progress', 'resolved', 'closed')),
  admin_notes text not null default '',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists support_messages_status_idx
  on public.support_messages (status, created_at desc);

alter table public.support_messages enable row level security;

drop policy if exists support_messages_insert_public on public.support_messages;
drop policy if exists support_messages_admin_all on public.support_messages;

create policy support_messages_insert_public on public.support_messages
  for insert to anon, authenticated
  with check (true);

create policy support_messages_admin_all on public.support_messages
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ============================================================
-- 6) documents — patient medical document uploads
-- ============================================================
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references auth.users (id) on delete cascade,
  title text not null default '',
  file_name text not null,
  file_url text not null,
  file_type text not null default '',
  file_size int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists documents_patient_idx
  on public.documents (patient_id, created_at desc);

alter table public.documents enable row level security;

drop policy if exists documents_read_own on public.documents;
drop policy if exists documents_read_all_admin on public.documents;
drop policy if exists documents_insert_own on public.documents;
drop policy if exists documents_delete_own on public.documents;

create policy documents_read_own on public.documents
  for select to authenticated
  using (patient_id = auth.uid());

create policy documents_read_all_admin on public.documents
  for select to authenticated
  using (public.is_admin());

create policy documents_insert_own on public.documents
  for insert to authenticated
  with check (patient_id = auth.uid());

create policy documents_delete_own on public.documents
  for delete to authenticated
  using (patient_id = auth.uid());

-- Private storage bucket for uploaded files. Objects are stored under
-- {patient_id}/{file} so the RLS policies can scope them per patient.
insert into storage.buckets (id, name, public)
values ('patient-documents', 'patient-documents', false)
on conflict (id) do nothing;

drop policy if exists patient_documents_insert on storage.objects;
drop policy if exists patient_documents_read on storage.objects;
drop policy if exists patient_documents_select_admin on storage.objects;
drop policy if exists patient_documents_delete on storage.objects;

create policy patient_documents_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'patient-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy patient_documents_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'patient-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy patient_documents_select_admin on storage.objects
  for select to authenticated
  using (bucket_id = 'patient-documents' and public.is_admin());

create policy patient_documents_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'patient-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================================
-- 7) orders + order_items — product ordering
-- ============================================================
-- These tables may ALREADY exist in the live DB from an earlier setup, and
-- CREATE TABLE IF NOT EXISTS leaves an existing table untouched. We therefore
-- backfill any missing columns with ADD COLUMN IF NOT EXISTS (each statement
-- is a no-op when the column already exists, and all additions carry a
-- DEFAULT or are nullable so existing rows are preserved) BEFORE creating any
-- index, constraint or policy that references them.
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_no text,
  patient_id uuid references auth.users (id) on delete set null,
  name text not null,
  phone text not null,
  email text,
  address text not null default '',
  total numeric not null default 0 check (total >= 0),
  status text not null default 'placed' check (status in ('placed', 'processing', 'shipped', 'delivered', 'cancelled')),
  notes text not null default '',
  created_at timestamptz not null default now()
);

-- Defensive column backfill for a pre-existing orders table. Runs before any
-- index/constraint below so order_no (and every other column the app writes)
-- is guaranteed to exist.
alter table public.orders add column if not exists order_no text;
alter table public.orders add column if not exists patient_id uuid references auth.users (id) on delete set null;
alter table public.orders add column if not exists name text not null default '';
alter table public.orders add column if not exists phone text not null default '';
alter table public.orders add column if not exists email text;
alter table public.orders add column if not exists address text not null default '';
alter table public.orders add column if not exists total numeric not null default 0;
alter table public.orders add column if not exists status text not null default 'placed';
alter table public.orders add column if not exists notes text not null default '';
alter table public.orders add column if not exists created_at timestamptz not null default now();

-- order_no now guaranteed to exist -> the unique index is safe to create.
create unique index if not exists orders_order_no_uidx
  on public.orders (order_no) where order_no is not null;

create index if not exists orders_patient_idx on public.orders (patient_id, created_at desc);
create index if not exists orders_status_idx on public.orders (status, created_at desc);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  product_name text not null,
  price numeric not null default 0 check (price >= 0),
  quantity int not null default 1 check (quantity > 0)
);

-- Same defensive backfill for a pre-existing order_items table.
alter table public.order_items add column if not exists order_id uuid;
alter table public.order_items add column if not exists product_id uuid;
alter table public.order_items add column if not exists product_name text not null default '';
alter table public.order_items add column if not exists price numeric not null default 0;
alter table public.order_items add column if not exists quantity int not null default 1;

create index if not exists order_items_order_idx on public.order_items (order_id);

alter table public.orders enable row level security;
alter table public.order_items enable row level security;

drop policy if exists orders_read_own on public.orders;
drop policy if exists orders_read_all_admin on public.orders;
drop policy if exists orders_admin_all on public.orders;
drop policy if exists order_items_read_own on public.order_items;
drop policy if exists order_items_admin_all on public.order_items;

create policy orders_read_own on public.orders
  for select to authenticated
  using (patient_id = auth.uid());

create policy orders_read_all_admin on public.orders
  for select to authenticated
  using (public.is_admin());

create policy orders_admin_all on public.orders
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy order_items_read_own on public.order_items
  for select to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and o.patient_id = auth.uid()
    )
  );

create policy order_items_admin_all on public.order_items
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ============================================================
-- 8) reminders — appointment reminders
-- ============================================================
create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid references public.appointments (id) on delete cascade,
  channel text not null default 'email' check (channel in ('email', 'sms', 'whatsapp')),
  remind_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'sent', 'failed', 'cancelled')),
  sent_at timestamptz,
  error text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists reminders_due_idx on public.reminders (status, remind_at);

alter table public.reminders enable row level security;

drop policy if exists reminders_admin_all on public.reminders;

create policy reminders_admin_all on public.reminders
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ============================================================
-- 9) doctor_profile — single-row doctor/about content
-- ============================================================
create table if not exists public.doctor_profile (
  id int primary key default 1 check (id = 1),
  full_name text not null default 'Dr. Naseem Ahmed Khan',
  title text not null default 'Homeopath & Physiotherapist',
  tagline text not null default '',
  bio text not null default '',
  credentials text not null default '',
  education text not null default '',
  experience_years int not null default 0,
  languages text not null default '',
  specialties text not null default '',
  photo_url text,
  phone text,
  email text,
  address text,
  social_links jsonb not null default '{}',
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.doctor_profile enable row level security;

drop policy if exists doctor_profile_read_public on public.doctor_profile;
drop policy if exists doctor_profile_admin_write on public.doctor_profile;

create policy doctor_profile_read_public on public.doctor_profile
  for select to anon, authenticated
  using (true);

create policy doctor_profile_admin_write on public.doctor_profile
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

insert into public.doctor_profile (id, full_name, title, tagline, languages, specialties)
values (
  1,
  'Dr. Naseem Ahmed Khan',
  'Homeopath & Physiotherapist',
  'Natural, patient-centred healthcare for the whole family.',
  'Urdu, English, Pashto',
  'Homeopathy, Physiotherapy'
)
on conflict (id) do nothing;
