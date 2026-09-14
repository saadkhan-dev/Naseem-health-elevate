-- ===========================================================================
-- LiveKit video consultations — usage events table (OPTIONAL migration)
-- ===========================================================================
-- Run this in the Supabase SQL Editor once to enable the app-tracked usage
-- estimate on the admin "LiveKit Usage" panel (WebRTC participant minutes).
--
-- The LiveKit Build (free) plan has NO official per-project Analytics API
-- (that endpoint is a Scale+ feature), so the panel estimates monthly WebRTC
-- minutes from the join/leave events below. Rows are written ONLY by the
-- server (service-role key) via the reportVideoSessionEvent server function.
--
-- Non-destructive: creates one new table; nothing existing is altered.
-- Idempotent: safe to run more than once.
-- ===========================================================================

create table if not exists public.video_session_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.video_sessions (id) on delete cascade,
  participant_role text not null check (participant_role in ('patient', 'doctor')),
  joined_at timestamptz not null default now(),
  left_at timestamptz
);

-- Estimation + racing lookups are all filtered by session/joined_at.
create index if not exists video_session_events_session_idx
  on public.video_session_events (session_id);
create index if not exists video_session_events_joined_idx
  on public.video_session_events (joined_at);

-- RLS on with NO policies: only the server (service-role key, which bypasses
-- RLS) can read/write. Guests, anon and authenticated users cannot touch it.
alter table public.video_session_events enable row level security;