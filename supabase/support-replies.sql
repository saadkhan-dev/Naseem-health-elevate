-- ============================================================
-- Support replies: let the clinic store a reply on a support
-- message and mark when it was sent.
--
-- The Admin → Support inbox already lets staff change status and
-- save internal notes. This adds the public-facing reply the
-- sender receives (in-app patient notification + best-effort
-- email/SMS via the existing delivery system in
-- src/lib/server/notifications.ts).
--
-- RLS is NOT changed: the existing `support_messages_admin_all`
-- policy (for ALL, when is_admin()) already governs reads and
-- writes of these new columns for staff, and the public INSERT
-- policy is untouched (new rows keep their defaults).
--
-- Run manually in the Supabase SQL Editor. Re-runnable.
-- ============================================================

alter table public.support_messages
  add column if not exists admin_reply text not null default '';

alter table public.support_messages
  add column if not exists replied_at timestamptz;