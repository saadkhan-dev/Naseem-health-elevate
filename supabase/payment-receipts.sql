-- ============================================================
-- Health Elevate — Video Consultation payment receipt uploads
-- Run ONCE in the Supabase SQL Editor. Safe to re-run.
--
-- Adds:
--   1. appointments.payment_receipt_url — private storage path of the
--      patient-uploaded payment receipt screenshot (JPG/JPEG/PNG).
--   2. A private `payment-receipts` storage bucket.
--
-- Security: uploads are performed server-side with the service-role key via
-- the TanStack Start server functions (`submitPaymentReceipt`), so NO
-- anon/authenticated storage policies are added — the bucket stays private,
-- RLS is never bypassed, and no secrets reach the frontend. The clinic can
-- open receipts from the Supabase Storage dashboard (or a signed URL).
-- ============================================================

-- 1) Payment receipt path on the appointment ------------------------------
alter table public.appointments add column if not exists payment_receipt_url text;

-- 2) Private storage bucket for receipt screenshots -----------------------
insert into storage.buckets (id, name, public)
values ('payment-receipts', 'payment-receipts', false)
on conflict (id) do nothing;
