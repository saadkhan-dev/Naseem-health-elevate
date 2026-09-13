-- ============================================================
-- Health Elevate — Admin notifications migration (Phase 2)
-- Creates public.admin_notifications (the in-app notification
-- center for admin/doctor staff) and adds the dedup_key column to
-- the existing public.patient_notifications center.
--
-- Run once in the Supabase SQL Editor. Re-runnable: uses the
-- IF NOT EXISTS / DROP POLICY + CREATE POLICY pattern (safe to run
-- more than once). Nothing is dropped or rebuilt and existing rows
-- are preserved.
--
-- Security model (mirrors public.patient_notifications defined in
-- supabase/feature-foundation.sql):
--   * RLS is enabled.
--   * SELECT: admins/doctors via public.is_admin() (read every admin
--     notification); individual recipients via recipient_id = auth.uid().
--   * UPDATE: only recipient_id = auth.uid() (mark own rows read).
--   * There is intentionally NO INSERT policy: rows are created ONLY
--     through the trusted service-role server client
--     (createAdminNotification in src/lib/server/patient-notifications.ts),
--     which bypasses RLS. Patients and guests can never write (or read)
--     admin notification rows.
--
-- recipient_id semantics:
--   * null          -> broadcast: visible to every authorized admin/doctor.
--   * non-null uuid -> targeted to one staff member.
--
-- Deduplication:
--   * targeted rows: UNIQUE (recipient_id, dedup_key) -> an event can
--     create at most one notification per recipient.
--   * broadcasts: UNIQUE (dedup_key) -> at most one row per event for
--     all staff.
--
-- Depends on public.is_admin() (defined in supabase/rls-policies.sql).
-- It is re-created below so this migration is self-contained (same
-- definition as rls-policies.sql / chat-usage.sql).
-- ============================================================

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

-- ============================================================
-- 1) admin_notifications — in-app notification center for staff
-- ============================================================
create table if not exists public.admin_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid references auth.users (id) on delete cascade,
  type text not null default 'general',
  title text not null default '',
  body text not null default '',
  link text,
  read_at timestamptz,
  dedup_key text,
  created_at timestamptz not null default now()
);

-- Per-recipient inbox: list newest first.
create index if not exists admin_notifications_recipient_idx
  on public.admin_notifications (recipient_id, created_at desc)
  where recipient_id is not null;

-- Broadcast inbox (recipient_id is null): list newest first.
create index if not exists admin_notifications_broadcast_idx
  on public.admin_notifications (created_at desc)
  where recipient_id is null;

-- Unread queries (badges / unread counts / mark-all-read).
create index if not exists admin_notifications_unread_idx
  on public.admin_notifications (recipient_id, read_at)
  where read_at is null and recipient_id is not null;

-- Dedup for targeted notifications: one row per (recipient, event).
create unique index if not exists admin_notifications_dedup_uidx
  on public.admin_notifications (recipient_id, dedup_key)
  where dedup_key is not null and recipient_id is not null;

-- Dedup for broadcasts: one row per event visible to all staff.
create unique index if not exists admin_notifications_broadcast_dedup_uidx
  on public.admin_notifications (dedup_key)
  where dedup_key is not null and recipient_id is null;

alter table public.admin_notifications enable row level security;

drop policy if exists admin_notifications_read_admin on public.admin_notifications;
drop policy if exists admin_notifications_read_own on public.admin_notifications;
drop policy if exists admin_notifications_update_own on public.admin_notifications;

create policy admin_notifications_read_admin on public.admin_notifications
  for select to authenticated
  using (public.is_admin());

create policy admin_notifications_read_own on public.admin_notifications
  for select to authenticated
  using (recipient_id = auth.uid());

create policy admin_notifications_update_own on public.admin_notifications
  for update to authenticated
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

-- ============================================================
-- 2) patient_notifications — add dedup_key (Phase 2)
--    Existing behavior/policies preserved; the column is optional.
--    Dedup is scoped per recipient (user_id), so the same event key
--    can never create two rows for the same patient.
-- ============================================================
alter table public.patient_notifications add column if not exists dedup_key text;

create unique index if not exists patient_notifications_dedup_uidx
  on public.patient_notifications (user_id, dedup_key)
  where dedup_key is not null;