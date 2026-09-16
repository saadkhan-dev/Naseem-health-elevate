-- ============================================================================
-- Migration 0082 — Patient support activity
-- ----------------------------------------------------------------------------
-- Backs the "patient support inbox" feature shipped in code:
--
--   1. support_messages.patient_id            links a question to the signed-in
--                                             patient (auth.users) that asked it.
--   2. related_order_id / related_appointment_id  reserved columns for future
--                                             order/appointment context links
--                                             (NOT yet written by app code).
--   3. Index for the patient inbox look-up and recent-message admin reads.
--   4. RLS policy so a patient can only read their own questions (the admin
--      "all" policy already covers the staff inbox).
--   5. Tightened RLS insert policy: anon callers must leave patient_id NULL and
--      signed-in patients may only stamp their own uid (prevents injecting an
--      arbitrary patient_id into another patient's inbox).
--
-- Re-runnable. Apply manually:  psql ... -f 0082_patient_support_activity.sql
-- ============================================================================

begin;

-- 1) Link support questions to the signed-in patient (nullable: the public
--    contact form keeps working for anonymous visitors).
alter table public.support_messages
  add column if not exists patient_id uuid references auth.users (id) on delete set null;

-- Reserved context columns for future deep links (unused until app code
-- populates them; optional and nullable so they are safe to add now).
alter table public.support_messages
  add column if not exists related_order_id uuid references public.orders (id) on delete set null;

alter table public.support_messages
  add column if not exists related_appointment_id uuid references public.appointments (id) on delete set null;

-- 2) Indexes.
create index if not exists support_messages_patient_idx
  on public.support_messages (patient_id, created_at desc);

create index if not exists support_messages_created_idx
  on public.support_messages (created_at desc);

-- 3) RLS — a registered patient may read their own questions.
drop policy if exists support_messages_read_own on public.support_messages;

create policy support_messages_read_own on public.support_messages
  for select to authenticated
  using (patient_id is not null and patient_id = auth.uid());

-- 4) Harden the public insert policy: anonymous visitors cannot attach a
--    patient_id, and authenticated patients may only stamp their own uid.
drop policy if exists support_messages_insert_public on public.support_messages;

create policy support_messages_insert_public on public.support_messages
  for insert to anon, authenticated
  with check (
    patient_id is null
    or (auth.role() <> 'anon' and patient_id = auth.uid())
  );

commit;