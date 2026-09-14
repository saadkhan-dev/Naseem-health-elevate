-- ============================================================
-- ARCHIVED / HISTORICAL — the app no longer creates Google Meet
-- meetings (the Meet layer was replaced by embedded LiveKit rooms,
-- see supabase/livekit-video-sessions.sql). The meet_url and
-- meet_space_id columns are intentionally KEPT in the database
-- (existing rows must never be lost), but nothing writes to them
-- anymore. There is no need to re-run this file.
-- ============================================================
-- Health Elevate — Google Meet integration columns
-- Run ONCE in the Supabase SQL Editor. Safe to re-run.
--
-- Adds the Google Meet meeting reference to the existing
-- video_sessions table. Each video consultation session keeps
-- ONE (1) corresponding Google Meet meeting:
--   meet_url       -> https://meet.google.com/abc-mnop-xyz
--   meet_space_id  -> spaces/{spaceId} (official resource name)
--                     also used to end the conference if needed.
--
-- Existing rows keep working (columns are nullable). Meetings are
-- created lazily by the server when a session is started and are
-- never re-created for an appointment that already has a URL.
-- ============================================================

alter table public.video_sessions add column if not exists meet_url text;
alter table public.video_sessions add column if not exists meet_space_id text;

create index if not exists video_sessions_meet_url_idx
  on public.video_sessions (meet_url)
  where meet_url is not null;