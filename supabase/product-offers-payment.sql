-- ============================================================
-- Health Elevate — Product offers + order payment payer contact.
--
-- Adds:
--   1. products: per-product offer columns (admin-controlled sale/discount):
--        * offer_is_active   — master on/off switch for the offer
--        * offer_title       — optional label ("Special Offer", "20% OFF", …)
--        * offer_percent     — discount % (admin can enter a % instead of a price)
--        * offer_start_date  — optional, inclusive ("yyyy-MM-dd", clinic time)
--        * offer_end_date    — optional, inclusive ("yyyy-MM-dd", clinic time)
--      The existing products.discount_price remains the canonical "what the
--      customer pays" when the offer is active; products.price is the original.
--   2. orders: payer contact captured on the payment step (optional phone and
--      email), stored separately from the checkout phone/email so the admin
--      can verify who actually paid.
--
-- Builds on ecommerce-system.sql. Run manually in the Supabase SQL Editor.
-- Re-runnable (IF NOT EXISTS). No orders.status CHECK changes — order statuses
-- keep their existing values (pending/confirmed/shipped/delivered/cancelled);
-- payment_status stays on its own column.
-- ============================================================

-- ============================================================
-- 1) products — per-product offer/discount (admin-controlled)
-- ============================================================
alter table public.products add column if not exists offer_is_active boolean not null default false;
alter table public.products add column if not exists offer_title text;
alter table public.products add column if not exists offer_percent numeric;
alter table public.products add column if not exists offer_start_date date;
alter table public.products add column if not exists offer_end_date date;

-- ============================================================
-- 2) orders — payer contact on the payment step (optional)
-- ============================================================
alter table public.orders add column if not exists payment_payer_phone text;
alter table public.orders add column if not exists payment_payer_email text;