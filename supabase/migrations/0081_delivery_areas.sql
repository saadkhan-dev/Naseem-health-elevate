-- ============================================================
-- Health Elevate — Phase 8.1: Delivery Areas / Zones + order snapshot.
--
-- Adds the admin/doctor-managed delivery-zone table and the per-order snapshot
-- columns so a later change to an area's price NEVER rewrites historical
-- orders.
--
--   * delivery_areas          — zones (name, charge, optional free-delivery
--                               threshold override, active/inactive, note).
--   * orders.delivery_area_id / delivery_area_name
--                             — snapshot of which area/charge an order used.
--   * orders.delivery_charge_override
--                             — explicit per-order admin adjustment.
--
-- Builds on Phase 8 (`phase8-delivery-and-recurring-availability.sql`):
--   * store_settings / orders.subtotal / orders.delivery_charge.
--
-- Run manually in the Supabase SQL Editor — this file is NOT applied
-- automatically and the application never executes migrations at runtime.
-- Re-runnable (CREATE/ADD COLUMN IF NOT EXISTS + guarded DROP/CREATE policies).
--
-- RLS: patients (anon + authenticated) can read active-area metadata so the
-- checkout dropdown works with the public key; only authenticated admins are
-- allowed to write. All writes in the app go through TanStack Start server
-- functions (service-role client); these policies are defence in depth and do
-- not weaken any existing policy.
-- ============================================================

-- Admin/doctor-managed delivery zones (charge, optional free threshold,
-- active/inactive, optional note). No Karachi areas are hardcoded — the clinic
-- creates its own zones later.
create table if not exists delivery_areas (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  delivery_charge numeric not null default 0,
  free_delivery_threshold numeric null,
  is_active boolean not null default true,
  delivery_note text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One snapshot of which area an order was placed with, so later edits to areas
-- never rewrite historical orders.
alter table public.orders
  add column if not exists delivery_area_id uuid null references delivery_areas(id),
  add column if not exists delivery_area_name text null,
  add column if not exists delivery_charge_override numeric null;

-- Keep the admin + patient views clean when no area exists yet: an active
-- area's name must be unique, while disabled/reused names can repeat.
create unique index if not exists delivery_areas_name_key on delivery_areas(name) where is_active;

comment on table delivery_areas is 'Admin/doctor-managed delivery zones (charge, optional free threshold, active/inactive, note).';

-- Guarded sanity constraints (re-runnable; added only when missing).
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'delivery_areas'::regclass and conname = 'delivery_areas_charge_check'
  ) then
    alter table public.delivery_areas add constraint delivery_areas_charge_check
      check (delivery_charge >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'delivery_areas'::regclass and conname = 'delivery_areas_free_threshold_check'
  ) then
    alter table public.delivery_areas add constraint delivery_areas_free_threshold_check
      check (free_delivery_threshold is null or free_delivery_threshold >= 0);
  end if;
end $$;

-- ============================================================
-- RLS
-- ============================================================
alter table public.delivery_areas enable row level security;

-- Public read: patients must see the areas they can pick at checkout.
drop policy if exists delivery_areas_read_public on public.delivery_areas;
create policy delivery_areas_read_public on public.delivery_areas
  for select to anon, authenticated
  using (true);

-- Admin/doctor write only (defence in depth — the app writes via server
-- functions on the service-role client).
drop policy if exists delivery_areas_admin_write on public.delivery_areas;
create policy delivery_areas_admin_write on public.delivery_areas
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());