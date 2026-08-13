-- ============================================================
-- Health Elevate - AI Chatbot usage tracking
-- Apply in the Supabase SQL Editor (Dashboard -> SQL Editor -> New query).
-- Re-runnable: safe to run more than once (uses IF NOT EXISTS / DROP POLICY).
--
-- Notes:
--  * Requires the helper function public.is_admin() (defined in
--    supabase/rls-policies.sql). It is also re-created here so this
--    migration is self-contained.
--  * Reads/writes are performed server-side with the service-role key
--    (bypasses RLS). Regular users and guests can never touch these rows.
-- ============================================================

-- Helper: is the current user an admin or doctor?
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid()
      and role in ('admin', 'doctor')
  );
$$;

-- One row per chatbot request (every request is recorded):
-- successful AI replies, failed API calls, rate-limit hits and blocked spam.
create table if not exists public.chat_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null references auth.users (id) on delete set null,
  client_id text not null,
  user_type text not null default 'guest' check (user_type in ('guest', 'user')),
  status text not null check (status in ('success', 'failed', 'rate_limited', 'spam')),
  model text not null default '',
  message text not null default '',
  error text not null default '',
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  created_at timestamptz not null default now()
);

-- Indexes for admin analytics (time ranges, identity lookups, status counts).
create index if not exists chat_usage_created_at_idx on public.chat_usage (created_at desc);
create index if not exists chat_usage_identity_idx on public.chat_usage (user_id, client_id);
create index if not exists chat_usage_status_idx on public.chat_usage (status);
create index if not exists chat_usage_user_type_idx on public.chat_usage (user_type);

-- Server-side only: rows are written by the service-role key (RLS bypassed).
-- No insert/update/delete policies exist, so guests/patients cannot write.
-- Admins may read via RLS as a convenience; the app itself uses the
-- service-role key through an admin-authorized server function.
alter table public.chat_usage enable row level security;

drop policy if exists chat_usage_admin_select on public.chat_usage;
create policy chat_usage_admin_select on public.chat_usage
  for select to authenticated
  using (public.is_admin());
