-- ============================================================
-- Order support: patient order queries, cancellation/return
-- requests, and order status history (timeline).
--
-- Reuses the existing `orders` status model
-- (placed/processing/shipped/delivered/cancelled) — no new order statuses.
-- Cancellation/return is a REQUEST flow, never a direct delete.
--
-- Run manually in the Supabase SQL Editor.
-- ============================================================

-- Patient-facing requests against a specific order.
create table if not exists public.order_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  patient_id uuid references auth.users (id) on delete set null,
  kind text not null check (kind in ('query', 'cancel', 'return')),
  message text not null default '',
  status text not null default 'new'
    check (status in ('new', 'in_progress', 'resolved', 'closed')),
  admin_notes text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists order_requests_order_idx on public.order_requests (order_id);
create index if not exists order_requests_patient_idx on public.order_requests (patient_id, created_at desc);
create index if not exists order_requests_status_idx on public.order_requests (status, created_at desc);

alter table public.order_requests enable row level security;

drop policy if exists order_requests_read_own on public.order_requests;
drop policy if exists order_requests_insert_own on public.order_requests;
drop policy if exists order_requests_admin_all on public.order_requests;

create policy order_requests_read_own on public.order_requests
  for select to authenticated
  using (patient_id = auth.uid());

create policy order_requests_insert_own on public.order_requests
  for insert to authenticated
  with check (patient_id = auth.uid());

create policy order_requests_admin_all on public.order_requests
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Immutable status-change log for the patient-facing timeline.
create table if not exists public.order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  status text not null,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists order_status_history_order_idx
  on public.order_status_history (order_id, created_at);

alter table public.order_status_history enable row level security;

drop policy if exists order_status_history_read_own on public.order_status_history;
drop policy if exists order_status_history_admin_all on public.order_status_history;

create policy order_status_history_read_own on public.order_status_history
  for select to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_status_history.order_id
        and o.patient_id = auth.uid()
    )
  );

create policy order_status_history_admin_all on public.order_status_history
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());