-- ============================================================
-- Reviews — admin dashboard visibility + web-only reviews
--
-- 1) Guarantees the moderation columns exist. `reviews` was originally
--    created WITHOUT `patient_id` / `status`; the app now always reads them
--    (e.g. `select *` from the admin dashboard and `status = 'approved'` for
--    the public site). A live DB missing these columns made every review
--    query error out — the admin dashboard showed "No reviews yet" and the
--    website fell back to the static snapshot, so newly-added reviews never
--    appeared anywhere. Run once (re-runnable).
--
-- 2) Deletes the SEEDED "Google Reviewer" rows. Google reviews are displayed
--    by a separate block (live Google Places API — see GoogleReviewsBlock),
--    so the website's "Website Reviews" section must contain ONLY real web /
--    patient reviews. The three placeholder "Google Reviewer" rows seeded
--    into the `reviews` table are removed here.
--
-- The pending-submission visibility fix itself is CODE-LEVEL
-- (`getAllReviews` now reads through the staff-authenticated client so the
-- `reviews_read_all_admin` RLS policy applies and every row — pending/
-- approved/rejected — reaches the moderation dashboard).
-- ============================================================

alter table public.reviews add column if not exists patient_id uuid references auth.users (id) on delete set null;

alter table public.reviews add column if not exists status text not null default 'approved'
  check (status in ('pending', 'approved', 'rejected'));

-- Web reviews = real web/patient reviews only. Google reviews are fetched
-- live from Google Places in a separate section and must not live here.
delete from public.reviews
where lower(trim(name)) = 'google reviewer';

-- ---------------------------------------------------------------------------
-- QA / verification (run after applying)
-- ---------------------------------------------------------------------------
-- select column_name from information_schema.columns
-- where table_schema = 'public' and table_name = 'reviews'
-- order by ordinal_position;
--
-- select status, count(*) from public.reviews group by status;
-- select count(*) as google_reviewer_left from public.reviews
-- where lower(trim(name)) = 'google reviewer';  -- expect 0