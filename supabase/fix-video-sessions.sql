-- ============================================================
-- Health Elevate - Ensure video_sessions table has all columns
-- Run once if you get: "Could not find the 'duration_minutes'
-- column of 'video_sessions' in the schema cache"
-- Safe to re-run. No double quotes.
-- ============================================================

create table if not exists public.video_sessions (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid,
  room_name text not null default '',
  status text not null default 'scheduled',
  started_at timestamptz,
  ended_at timestamptz,
  duration_minutes int not null default 30,
  created_at timestamptz not null default now()
);

alter table public.video_sessions add column if not exists appointment_id uuid;
alter table public.video_sessions add column if not exists room_name text not null default '';
alter table public.video_sessions add column if not exists status text not null default 'scheduled';
alter table public.video_sessions add column if not exists started_at timestamptz;
alter table public.video_sessions add column if not exists ended_at timestamptz;
alter table public.video_sessions add column if not exists duration_minutes int not null default 30;
