-- =============================================================================
-- Health Elevate — Phase 2: Product gallery, packing/size, condition
--
-- Adds (all OPTIONAL, backward-compatible with existing product rows):
--   1. products.pack_size           — optional packing/size (e.g. "50g", "100ml")
--   2. products.product_condition   — optional condition (e.g. "Fresh Condition")
--   3. product_images               — optional ordered gallery (position 0 = primary)
--      * Legacy rows keep using products.image_url; the app falls back to
--        image_url when a product has no product_images rows, so existing
--        products need NO migration of their data.
--   4. storage bucket `product-images` (PUBLIC so patient/anon browsers can
--      render the primary + gallery images). Writes stay admin-only via RLS.
--
-- RLS: nothing existing is weakened. products keeps its existing policies.
--      product_images: public read, admin-only write (is_admin()).
--      storage: public read on `product-images`, admin-only insert/update/delete.
--
-- This file is NOT executed automatically. Review, then run in the Supabase
-- SQL editor (mirrors products/categories/custom-availability convention).
-- =============================================================================

-- 1) Optional packing / size on products -------------------------------------
alter table public.products add column if not exists pack_size text;
alter table public.products add column if not exists product_condition text;

-- 2) product_images — ordered gallery, position 0 = primary ------------------
create table if not exists public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  position int not null default 0,
  url text not null,
  created_at timestamptz not null default now(),
  constraint product_images_product_position_uidx unique (product_id, position)
);

create index if not exists product_images_product_idx
  on public.product_images (product_id, position);

alter table public.product_images enable row level security;

drop policy if exists product_images_read_public on public.product_images;
drop policy if exists product_images_admin_write on public.product_images;

create policy product_images_read_public on public.product_images
  for select using (true);

create policy product_images_admin_write on public.product_images
  for all using (public.is_admin()) with check (public.is_admin());

-- 3) Public storage bucket for product images --------------------------------
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do update set public = true;

-- Public read (anon + authenticated) so patients/galleries can render them.
drop policy if exists product_images_storage_read_public on storage.objects;
create policy product_images_storage_read_public on storage.objects
  for select using (bucket_id = 'product-images');

-- Admin-only insert / update / delete (uploads happen from the staff client).
drop policy if exists product_images_storage_admin_all on storage.objects;
create policy product_images_storage_admin_all on storage.objects
  for all using (bucket_id = 'product-images' and public.is_admin())
  with check (bucket_id = 'product-images' and public.is_admin());