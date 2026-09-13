-- Orders status CHECK normalization
--
-- The original orders.status CHECK (feature-foundation.sql:252) allowed:
--   ('placed', 'processing', 'shipped', 'delivered', 'cancelled')
-- but the application uses:
--   ('pending', 'confirmed', 'shipped', 'delivered', 'cancelled')
-- and some migrations may add further states. This drops whatever CHECK
-- currently exists and replaces it with the full union, so every status
-- the app can write always succeeds — including the initial 'pending' status
-- written by placeOrder() and the 'confirmed' status set by staff.
--
-- Run manually in the Supabase SQL Editor. Re-runnable.

do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'orders_status_check'
  ) then
    alter table public.orders drop constraint orders_status_check;
  end if;
end $$;

alter table public.orders
  add constraint orders_status_check
  check (status in (
    'placed',       -- original seed default
    'pending',      -- app default (placeOrder)
    'confirmed',    -- staff confirmation
    'processing',
    'shipped',
    'delivered',
    'cancelled'
  ));