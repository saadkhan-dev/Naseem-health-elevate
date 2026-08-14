-- ============================================================
-- Patient → Doctor document sharing
--
-- Adds the sharing state to the existing `documents` table (no new table is
-- needed: a document belongs to one patient and is sent to the clinic's
-- doctor/admin). Status flow:
--   available        — uploaded, not yet sent
--   sent_to_doctor   — patient pressed "Send to Doctor"
--   received         — doctor/admin opened/downloaded it
--
-- Run manually in the Supabase SQL Editor.
-- ============================================================

alter table public.documents
  add column if not exists shared_with_doctor boolean not null default false;

alter table public.documents
  add column if not exists shared_at timestamptz;

alter table public.documents
  add column if not exists status text not null default 'available'
  check (status in ('available', 'sent_to_doctor', 'received'));

-- Existing rows stay "available".
update public.documents set status = 'available' where status is null;