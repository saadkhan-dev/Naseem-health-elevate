-- ============================================================
-- Health Elevate — E-commerce: order payments, product catalog
-- enhancements, product reviews, and extended order requests.
--
-- Builds on the existing product ordering model:
--   * orders / order_items / order_status_history (feature-foundation.sql)
--   * order_requests — queries, cancellation, returns (order-support.sql)
--   * payment_methods + manual payment + admin verification (video flow)
--   * products (public read; admin write)
--
-- Adds:
--   1. Orders: prepaid payment columns (payment_status / method / reference /
--      payer name / submitted_at / verified_at / amount / receipt URL),
--      mirroring the video-consultation payment model.
--   2. Products: category, stock_quantity, discount_price, cached rating.
--   3. product_reviews — patient reviews with an admin moderation queue.
--   4. order_requests.kind extended to complaint + replacement.
--
-- Run manually in the Supabase SQL Editor. Re-runnable (IF NOT EXISTS /
-- DROP POLICY + CREATE POLICY / guarded triggers).
--
-- Depends on public.is_admin() and the existing orders/order_items tables.
-- All writes go through TanStack Start server functions on the service-role
-- client (RLS bypassed) — policies below are defence in depth for any
-- client-side read/insert the app performs with the anon key.
-- ============================================================

-- ============================================================
-- 1) orders — prepaid order payment (manual payment + admin verification)
-- ============================================================
alter table public.orders add column if not exists payment_status text not null default 'payment_pending';
alter table public.orders add column if not exists payment_method text;
alter table public.orders add column if not exists payment_reference text;
alter table public.orders add column if not exists payment_payer_name text;
alter table public.orders add column if not exists payment_submitted_at timestamptz;
alter table public.orders add column if not exists payment_verified_at timestamptz;
alter table public.orders add column if not exists payment_amount numeric;
alter table public.orders add column if not exists payment_receipt_url text;

-- Re-runnable CHECK constraint on orders.payment_status.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.orders'::regclass and conname = 'orders_payment_status_check'
  ) then
    alter table public.orders add constraint orders_payment_status_check
      check (payment_status in
        ('payment_pending', 'payment_submitted', 'payment_verified', 'payment_failed', 'refunded', 'waived'));
  end if;
end $$;

-- ============================================================
-- 2) products — category, stock quantity, discount, cached rating
-- ============================================================
alter table public.products add column if not exists category text not null default 'general';
alter table public.products add column if not exists stock_quantity int;
alter table public.products add column if not exists discount_price numeric;
alter table public.products add column if not exists rating_avg numeric;
alter table public.products add column if not exists rating_count int not null default 0;

-- ============================================================
-- 3) product_reviews — patient reviews + moderation queue
-- ============================================================
create table if not exists public.product_reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  patient_id uuid references auth.users (id) on delete set null,
  name text not null default '',
  rating int not null default 5 check (rating between 1 and 5),
  comment text not null default '',
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  is_active boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists product_reviews_product_idx on public.product_reviews (product_id, created_at desc);
create index if not exists product_reviews_status_idx on public.product_reviews (status, created_at desc);

alter table public.product_reviews enable row level security;

drop policy if exists product_reviews_read_public on public.product_reviews;
drop policy if exists product_reviews_read_own on public.product_reviews;
drop policy if exists product_reviews_insert_own on public.product_reviews;
drop policy if exists product_reviews_admin_all on public.product_reviews;

-- Public reads: only active AND approved (moderation enforced at the DB level).
create policy product_reviews_read_public on public.product_reviews
  for select to anon, authenticated
  using (is_active = true and status = 'approved');

-- A signed-in patient can see the status of their own review submissions.
create policy product_reviews_read_own on public.product_reviews
  for select to authenticated
  using (patient_id = auth.uid());

-- Patients submit their own review; it lands in the pending queue
-- (server functions are the primary writer via the service-role key).
create policy product_reviews_insert_own on public.product_reviews
  for insert to authenticated
  with check (patient_id = auth.uid() and status = 'pending' and is_active = false);

-- Admins see every row and moderate.
create policy product_reviews_admin_all on public.product_reviews
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Maintain the cached rating on the product when a review is inserted,
-- approved/rejected or deleted. Approved + active reviews only.
create or replace function public.refresh_product_rating()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  agg record;
  p_id uuid;
begin
  p_id := coalesce(new.product_id, old.product_id);
  select avg(rating)::numeric(3,2) as avg_rating, count(*) as cnt
    into agg
    from public.product_reviews
    where product_id = p_id
      and status = 'approved'
      and is_active = true;
  update public.products
     set rating_avg = agg.avg_rating,
         rating_count = agg.cnt
   where id = p_id;
  return coalesce(new, old);
end;
$$;

drop trigger if exists product_reviews_refresh_rating on public.product_reviews;
create trigger product_reviews_refresh_rating
  after insert or update or delete on public.product_reviews
  for each row execute function public.refresh_product_rating();

-- Backfill cached ratings for any pre-existing approved reviews.
update public.products p
   set rating_avg = r.avg_rating,
       rating_count = r.cnt
  from (
    select product_id,
           avg(rating)::numeric(3,2) as avg_rating,
           count(*)::int as cnt
      from public.product_reviews
     where status = 'approved' and is_active = true
     group by product_id
  ) r
 where p.id = r.product_id;

-- ============================================================
-- 4) order_requests — extend kind to complaint + replacement
-- ============================================================
-- The original CHECK was created inline in order-support.sql (auto-named), so
-- drop any check constraint on the kind column by name lookup, then re-add a
-- named constraint covering the full set.
do $$
declare
  con record;
begin
  for con in
    select conname
    from pg_constraint
    where conrelid = 'public.order_requests'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%kind%'
  loop
    execute format('alter table public.order_requests drop constraint %I', con.conname);
  end loop;
end $$;

alter table public.order_requests add constraint order_requests_kind_check
  check (kind in ('query', 'cancel', 'return', 'complaint', 'replacement'));

-- ============================================================
-- 5) order payment receipts — reuse the existing private bucket
-- ============================================================
-- Receipt screenshots are uploaded server-side with the service-role key into
-- the existing private `payment-receipts` bucket (path: orders/{orderId}/...).
-- No anon/authenticated storage policies are needed (same design as the video
-- consultation receipts) — the bucket stays private.
insert into storage.buckets (id, name, public)
values ('payment-receipts', 'payment-receipts', false)
on conflict (id) do nothing;
