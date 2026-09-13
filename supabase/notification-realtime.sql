-- ---------------------------------------------------------------------------
-- Health Elevate — Phase 5: Realtime for the notification tables.
--
-- Adds `patient_notifications` and `admin_notifications` to the
-- `supabase_realtime` publication so `postgres_changes` emits events that the
-- notification bells consume. Re-runnable; follows the existing pattern from
-- `consultation-chat.sql` (section 11).
--
-- Authorization is handled entirely by RLS, which is unchanged: Realtime
-- evaluates the subscriber's JWT against the table SELECT policy, so a patient
-- only receives their own rows (`user_id = auth.uid()`) and an admin only rows
-- they are allowed to read. The client code additionally filters patient
-- events by `user_id` via the realtime `filter` option.
--
-- Replica identity stays at the default (primary key). INSERT events carry the
-- full row; UPDATE events carry the primary key plus changed columns (e.g. a
-- mark-as-read `read_at` update), which is enough to overlay the cache — the
-- client refetches the server truth right after mirroring the change. No
-- REPLICA IDENTITY FULL is required, unlike the consultation-message fix.
-- ---------------------------------------------------------------------------

do $$
begin
  alter publication supabase_realtime add table public.patient_notifications;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.admin_notifications;
exception when duplicate_object then null;
end $$;