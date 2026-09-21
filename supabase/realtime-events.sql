-- ============================================================
-- Health Elevate — Realtime event bus migration
-- Drives auto-updating UI + notification toasts for the whole app.
--
-- Single small table (public.realtime_events). Rows are written ONLY by
-- database triggers fired when the real tables change (and by the service
-- role). Clients can never insert/update it directly.
--
-- The table is added to the supabase_realtime publication in
-- supabase/realtime-tables.sql, so every write streams a postgres_changes
-- event to exactly the subscribers RLS allows:
--   * admins/doctors   -> everything (public.is_admin())
--   * a patient        -> only rows addressed to them (scope='patient',
--                         user_id = auth.uid())
--   * anonymous users  -> nothing (no policy) -> guest data never leaks.
--
-- Why triggers instead of publishing appointments/orders/video_sessions?
--   - public.appointments has an anon SELECT policy for guest rows
--     (appointments_read_guest / video_sessions_read_guest, see
--     appointment-flow.sql): publishing those tables would stream every
--     guest's contact details to every anonymous subscriber.
--   - This event table inverts the model: RLS is strict (admin / own-row
--     only) and every change is funnelled through it with a small payload.
--
-- Re-runnable: IF NOT EXISTS / DROP POLICY + CREATE POLICY pattern.
-- ============================================================

-- Helper: is the current user an admin or doctor?
-- Same definition as rls-policies.sql / admin-notifications.sql so this
-- migration is self-contained.
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
-- 1) realtime_events table
-- ============================================================
create table if not exists public.realtime_events (
  id uuid primary key default gen_random_uuid(),
  -- Event category, e.g. new_appointment | appointment_update | payment_update
  -- | video_ready | new_order | order_update | new_support_message | new_review.
  kind text not null,
  entity_id text,
  entity_no text,
  -- Who should receive this (and therefore be allowed to read it).
  scope text not null check (scope in ('admin', 'patient')),
  -- For scope='patient': the owning patient account. null for guests/broadcasts.
  user_id uuid references auth.users (id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Inboxes list newest-first.
create index if not exists realtime_events_scope_created_idx
  on public.realtime_events (scope, created_at desc);
create index if not exists realtime_events_user_created_idx
  on public.realtime_events (user_id, created_at desc);
create index if not exists realtime_events_kind_idx
  on public.realtime_events (kind);

alter table public.realtime_events enable row level security;

-- Patient subscriptions filter on user_id (a non-PK column), so the full row
-- must be part of the replica identity for postgres_changes filters to work.
alter table public.realtime_events replica identity full;

drop policy if exists realtime_events_read_admin on public.realtime_events;
drop policy if exists realtime_events_read_own on public.realtime_events;

-- Staff see every event.
create policy realtime_events_read_admin on public.realtime_events
  for select using (public.is_admin());

-- A patient sees only their own addressed events.
create policy realtime_events_read_own on public.realtime_events
  for select to authenticated
  using (scope = 'patient' and user_id = auth.uid());

-- There is intentionally NO insert/update/delete policy. Rows are created
-- inside the definer-rights trigger functions below (run as the function
-- owner) or by the service-role server client. No client role, anonymous or
-- authenticated, can write this table.

-- Keep the table compact: opportunistically drop events older than 30 days.
create or replace function public.realtime_events_purge()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if random() < 0.01 then
    delete from public.realtime_events
    where created_at < now() - interval '30 days';
  end if;
  return null;
end;
$$;

drop trigger if exists realtime_events_purge_trg on public.realtime_events;
create trigger realtime_events_purge_trg
after insert on public.realtime_events
for each statement execute function public.realtime_events_purge();

-- ============================================================
-- 2) Appointments -> new_appointment / appointment_update / payment_update
-- ============================================================
create or replace function public.handle_realtime_appointment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    -- Skip events for staff-created rows (their own UI already invalidates).
    if not public.is_admin() then
      insert into public.realtime_events (kind, entity_id, entity_no, scope, payload)
      values (
        'new_appointment',
        new.id::text,
        new.appointment_no,
        'admin',
        jsonb_build_object('status', new.status, 'date', new.date, 'time', new.time)
      );
    end if;
  elsif tg_op = 'UPDATE' then
    if new.status is distinct from old.status then
      insert into public.realtime_events (kind, entity_id, entity_no, scope, payload)
      values (
        'appointment_update',
        new.id::text,
        new.appointment_no,
        'admin',
        jsonb_build_object('status', new.status, 'prev_status', old.status)
      );
      if new.patient_id is not null then
        insert into public.realtime_events (kind, entity_id, entity_no, scope, user_id, payload)
        values (
          'appointment_update',
          new.id::text,
          new.appointment_no,
          'patient',
          new.patient_id,
          jsonb_build_object('status', new.status, 'prev_status', old.status)
        );
      end if;
    end if;
    if new.payment_status is distinct from old.payment_status then
      insert into public.realtime_events (kind, entity_id, entity_no, scope, payload)
      values (
        'payment_update',
        new.id::text,
        new.appointment_no,
        'admin',
        jsonb_build_object('payment_status', new.payment_status)
      );
      if new.patient_id is not null then
        insert into public.realtime_events (kind, entity_id, entity_no, scope, user_id, payload)
        values (
          'payment_update',
          new.id::text,
          new.appointment_no,
          'patient',
          new.patient_id,
          jsonb_build_object('payment_status', new.payment_status)
        );
      end if;
    end if;
    if new.date is distinct from old.date or new.time is distinct from old.time then
      insert into public.realtime_events (kind, entity_id, entity_no, scope, payload)
      values (
        'appointment_update',
        new.id::text,
        new.appointment_no,
        'admin',
        jsonb_build_object('rescheduled', true, 'date', new.date, 'time', new.time)
      );
      if new.patient_id is not null then
        insert into public.realtime_events (kind, entity_id, entity_no, scope, user_id, payload)
        values (
          'appointment_update',
          new.id::text,
          new.appointment_no,
          'patient',
          new.patient_id,
          jsonb_build_object('rescheduled', true, 'date', new.date, 'time', new.time)
        );
      end if;
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists realtime_appointment_trg on public.appointments;
create trigger realtime_appointment_trg
after insert or update on public.appointments
for each row execute function public.handle_realtime_appointment();

-- ============================================================
-- 3) Orders -> new_order / order_update
-- ============================================================
create or replace function public.handle_realtime_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if not public.is_admin() then
      insert into public.realtime_events (kind, entity_id, entity_no, scope, payload)
      values (
        'new_order',
        new.id::text,
        new.order_no,
        'admin',
        jsonb_build_object('status', new.status, 'total', new.total)
      );
    end if;
  elsif tg_op = 'UPDATE' then
    if new.status is distinct from old.status
       or new.payment_status is distinct from old.payment_status
       or new.payment_verified_at is distinct from old.payment_verified_at then
      insert into public.realtime_events (kind, entity_id, entity_no, scope, payload)
      values (
        'order_update',
        new.id::text,
        new.order_no,
        'admin',
        jsonb_build_object('status', new.status, 'payment_status', new.payment_status)
      );
      if new.patient_id is not null then
        insert into public.realtime_events (kind, entity_id, entity_no, scope, user_id, payload)
        values (
          'order_update',
          new.id::text,
          new.order_no,
          'patient',
          new.patient_id,
          jsonb_build_object('status', new.status, 'payment_status', new.payment_status)
        );
      end if;
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists realtime_order_trg on public.orders;
create trigger realtime_order_trg
after insert or update on public.orders
for each row execute function public.handle_realtime_order();

-- ============================================================
-- 4) Video sessions -> video_ready
-- ============================================================
create or replace function public.handle_realtime_video_session()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  apt_patient uuid;
begin
  if tg_op = 'INSERT' then
    select patient_id into apt_patient
    from public.appointments
    where id = new.appointment_id;

    insert into public.realtime_events (kind, entity_id, entity_no, scope, payload)
    values (
      'video_ready',
      new.id::text,
      new.vc_no,
      'admin',
      jsonb_build_object('status', new.status)
    );

    if apt_patient is not null then
      insert into public.realtime_events (kind, entity_id, entity_no, scope, user_id, payload)
      values (
        'video_ready',
        new.id::text,
        new.vc_no,
        'patient',
        apt_patient,
        jsonb_build_object('status', new.status)
      );
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists realtime_video_session_trg on public.video_sessions;
create trigger realtime_video_session_trg
after insert on public.video_sessions
for each row execute function public.handle_realtime_video_session();

-- ============================================================
-- 5) Support messages -> new_support_message (patient/guest -> admin)
-- ============================================================
create or replace function public.handle_realtime_support_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Skip when the author is staff (their own reply already invalidates).
  if tg_op = 'INSERT' and not public.is_admin() then
    insert into public.realtime_events (kind, entity_id, entity_no, scope, payload)
    values (
      'new_support_message',
      new.id::text,
      null,
      'admin',
      jsonb_build_object('status', new.status)
    );
  end if;
  return null;
end;
$$;

drop trigger if exists realtime_support_message_trg on public.support_messages;
create trigger realtime_support_message_trg
after insert on public.support_messages
for each row execute function public.handle_realtime_support_message();

-- ============================================================
-- 6) Reviews -> new_review (public review requests -> admin)
-- ============================================================
create or replace function public.handle_realtime_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' and not public.is_admin() then
    insert into public.realtime_events (kind, entity_id, entity_no, scope, payload)
    values (
      'new_review',
      new.id::text,
      null,
      'admin',
      jsonb_build_object('status', new.status)
    );
  end if;
  return null;
end;
$$;

drop trigger if exists realtime_review_trg on public.reviews;
create trigger realtime_review_trg
after insert on public.reviews
for each row execute function public.handle_realtime_review();