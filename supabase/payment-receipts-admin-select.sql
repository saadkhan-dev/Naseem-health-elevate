-- ============================================================
-- Health Elevate — Allow clinic admins/doctors to read payment
-- receipt screenshots (private bucket) for verification.
-- Run ONCE in the Supabase SQL Editor. Safe to re-run.
--
-- The `payment-receipts` bucket stays PRIVATE (patients upload via
-- the service-role server functions; no anon/authenticated insert or
-- read policies). The clinic's workforce needs to SEE the receipts to
-- verify prepaid video-consultation and order payments, so we grant a
-- SELECT-only policy to authenticated users whose profile role is
-- 'admin' or 'doctor' (the same `public.is_admin()` guard used for the
-- patient-documents bucket in feature-foundation.sql).
--
-- This makes client-side `createSignedUrl()` work on the staff client
-- for receipts; every read still passes storage RLS, so patients can
-- never enumerate or read each other's receipts.
-- ============================================================

drop policy if exists payment_receipts_select_admin on storage.objects;

create policy payment_receipts_select_admin on storage.objects
  for select to authenticated
  using (bucket_id = 'payment-receipts' and public.is_admin());