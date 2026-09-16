-- ============================================================
-- Health Elevate — Phase 8: separate delivery charges, product delivery
-- estimate, and recurring weekly extra availability.
--
-- Builds on the existing model and adds NOTHING that replaces it:
--   * orders / order_items / order_status_history (feature-foundation.sql)
--   * order payment columns (ecommerce-system.sql)
--   * products (feature-foundation.sql + ecommerce-system.sql)
--   * availability (regular weekly schedule) + custom_availability
--     (one-time, date-specific slots) (custom-availability.sql)
--
-- Adds:
--   1. orders.subtotal + orders.delivery_charge — the product subtotal and the
--      delivery charge are stored SEPARATELY; orders.total stays the grand
--      total (subtotal + delivery_charge). Existing orders keep working: the
--      new columns are backfilled so `subtotal = total` and
--      `delivery_charge = 0` (i.e. legacy orders show no delivery charge).
--   2. products.delivery_estimate — optional free-text estimate ("3-5 days").
--   3. store_settings — single-row store configuration the admin controls
--      (delivery charge, optional free-delivery threshold, on/off + note).
--   4. recurring_availability — weekly recurring extra slots layered on top of
--      the regular weekly schedule AND the one-time custom slots.
--
-- Run manually in the Supabase SQL Editor — this file is NOT applied
-- automatically and the application never executes migrations at runtime.
-- Re-runnable (IF NOT EXISTS / guarded DO blocks / DROP POLICY + CREATE POLICY).
--
-- Depends on public.is_admin(). All writes go through TanStack Start server
-- functions on the service-role client (RLS bypassed); the policies below are
-- defence in depth for any client-side read the app performs with the anon key.
-- No existing policy is weakened or removed.
-- ============================================================

-- ============================================================
-- 1) orders — product subtotal + delivery charge (grand total unchanged)
-- ============================================================
-- subtotal: sum of the ordered product lines (server-computed snapshot).
-- delivery_charge: the delivery fee applied to this order (snapshot, so a
-- later change to the global setting never rewrites history).
alter table public.orders add column if not exists subtotal numeric;
alter table public.orders add column if not exists delivery_charge numeric not null default 0;

-- Guarded CHECK constraints (re-runnable; added only when missing).
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.orders'::regclass and conname = 'orders_subtotal_check'
  ) then
    alter table public.orders add constraint orders_subtotal_check
      check (subtotal is null or subtotal >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.orders'::regclass and conname = 'orders_delivery_charge_check'
  ) then
    alter table public.orders add constraint orders_delivery_charge_check
      check (delivery_charge >= 0);
  end if;
end $$;

-- Backward compatibility: every pre-existing order is treated as
-- "no delivery charge", so its subtotal is simply its (already correct) total.
update public.orders
   set subtotal = total
 where subtotal is null;

-- ============================================================
-- 2) products — optional estimated delivery time ("3-5 days")
-- ============================================================
-- Nullable by design: products that never had a delivery estimate keep
-- behaving exactly as before (the field is simply not displayed).
alter table public.products add column if not exists delivery_estimate text;

-- ============================================================
-- 3) store_settings — single-row store configuration (admin controlled)
-- ============================================================
-- delivery_charge: the default delivery fee applied to new orders.
-- free_delivery_threshold: optional product-subtotal value at/above which the
-- delivery fee is waived (NULL = no free-delivery threshold).
-- delivery_is_active: master switch. FALSE (the default) = no delivery charge
-- is applied at all, which is exactly today's behaviour.
create table if not exists public.store_settings (
  id int primary key default 1,
  delivery_charge numeric not null default 0,
  free_delivery_threshold numeric,
  delivery_is_active boolean not null default false,
  delivery_note text,
  updated_at timestamptz not null default now(),
  constraint store_settings_single_row check (id = 1),
  constraint store_settings_delivery_charge_check check (delivery_charge >= 0),
  constraint store_settings_free_threshold_check
    check (free_delivery_threshold is null or free_delivery_threshold >= 0)
);

-- Ensure the single configuration row exists (charge 0 / inactive = no change).
insert into public.store_settings (id) values (1) on conflict (id) do nothing;

alter table public.store_settings enable row level security;

-- Public read: patients must be able to see the delivery charge BEFORE
-- ordering (the same shop configuration is shown on cart + checkout).
drop policy if exists store_settings_read_public on public.store_settings;
create policy store_settings_read_public on public.store_settings
  for select to anon, authenticated
  using (true);

drop policy if exists store_settings_admin_write on public.store_settings;
create policy store_settings_admin_write on public.store_settings
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ============================================================
-- 4) recurring_availability — weekly recurring EXTRA slots
-- ============================================================
-- A separate table (rather than extra columns on custom_availability) so the
-- existing one-time table, its NOT NULL specific_date and its unique
-- constraint are completely untouched — no regression for Phase 1 slots.
-- doctor_id NULL = clinic-wide. These windows are merged with the regular
-- weekly `availability` rows and with the one-time `custom_availability` rows
-- for the exact date, so the patient only ever sees deduplicated slots.
create table if not exists public.recurring_availability (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid references public.profiles (id) on delete set null,
  -- 0 = Sunday, 1 = Monday … 6 = Saturday (same convention as `availability`).
  day_of_week int not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  is_available boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recurring_availability_valid_range check (end_time > start_time),
  constraint recurring_availability_unique_slot
    unique (doctor_id, day_of_week, start_time, end_time)
);

create index if not exists recurring_availability_day_idx
  on public.recurring_availability (day_of_week);

alter table public.recurring_availability enable row level security;

-- Mirrors custom_availability exactly: public read, admin write.
drop policy if exists recurring_availability_read_public on public.recurring_availability;
create policy recurring_availability_read_public on public.recurring_availability
  for select to anon, authenticated
  using (true);

drop policy if exists recurring_availability_admin_write on public.recurring_availability;
create policy recurring_availability_admin_write on public.recurring_availability
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
