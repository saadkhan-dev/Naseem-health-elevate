-- ============================================================
-- Health Elevate — Analytics & presence migration
-- Anonymous website activity tracking (website_events) + live
-- visitor presence (live_sessions) powering the realtime "Live
-- Now" analytics panel and traffic metrics.
--
-- Privacy-first design:
--   * NO personal data is ever accepted. Metadata is sanitized to an
--     allowlist of scalar keys (channel, service, amount, ...). Strings
--     are capped at 80 chars. Paths/referrers are length capped.
--   * user_type is DERIVED server-side from auth.uid() + profiles.
--     A client can never claim to be staff or a patient.
--   * Sessions are identified by an anonymous UUID the client generates
--     (localStorage) — no name, phone or email is stored.
--   * RLS: only admins/doctors can SELECT either table. Writes happen
--     ONLY through the security-definer RPCs below (no insert policy).
--
-- Re-runnable: IF NOT EXISTS / DROP POLICY + CREATE POLICY pattern.
-- ============================================================

create table if not exists public.website_events (
  id bigint generated always as identity primary key,
  event_name text not null,
  session_id text not null,
  user_type text not null default 'guest'
    check (user_type in ('guest', 'patient', 'staff')),
  user_id uuid references auth.users (id) on delete set null,
  path text,
  referrer text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists website_events_name_created_idx
  on public.website_events (event_name, created_at desc);
create index if not exists website_events_session_idx
  on public.website_events (session_id, created_at desc);
create index if not exists website_events_created_idx
  on public.website_events (created_at desc);
create index if not exists website_events_path_created_idx
  on public.website_events (path, created_at desc);

create table if not exists public.live_sessions (
  session_id text primary key,
  user_id uuid references auth.users (id) on delete cascade,
  user_type text not null default 'guest'
    check (user_type in ('guest', 'patient', 'staff')),
  role text not null default 'guest',
  path text not null default '/',
  device text,
  referrer text,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists live_sessions_last_seen_idx
  on public.live_sessions (last_seen_at desc);
create index if not exists live_sessions_user_type_idx
  on public.live_sessions (user_type);

alter table public.website_events enable row level security;
alter table public.live_sessions enable row level security;

drop policy if exists website_events_read_admin on public.website_events;
drop policy if exists live_sessions_read_admin on public.live_sessions;

create policy website_events_read_admin on public.website_events
  for select using (public.is_admin());

create policy live_sessions_read_admin on public.live_sessions
  for select using (public.is_admin());

-- No insert/update/delete policies on either table: only the RPCs below
-- (and the service role) can write them.

-- ============================================================
-- Event allowlist + metadata sanitization shared by the RPCs
-- ============================================================
create or replace function public.analytics_event_allowed(p_name text)
returns boolean
language sql
immutable
as $$
  select p_name in (
    'page_view',
    'booking_started',
    'booking_completed',
    'booking_abandoned',
    'login',
    'signup',
    'appointment_created',
    'payment_submitted',
    'video_joined',
    'video_ended',
    'product_view',
    'order_placed'
  );
$$;

-- Derived user classification from auth.uid() — never trust the client.
create or replace function public.analytics_user_class(
  out user_type text,
  out user_role text,
  out user_id uuid
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  user_id := auth.uid();
  if user_id is null then
    user_type := 'guest';
    user_role := 'guest';
    return;
  end if;
  select coalesce(role, 'patient'),
         case coalesce(role, 'patient')
           when 'admin' then 'staff'
           when 'doctor' then 'staff'
           else 'patient'
         end
  into user_role, user_type
  from public.profiles where id = user_id;
  if user_role is null then
    user_type := 'patient';
    user_role := 'patient';
  end if;
end;
$$;

-- ============================================================
-- RPC: record_analytics_event
-- ============================================================
create or replace function public.record_analytics_event(
  p_event_name text,
  p_session_id text,
  p_path text default null,
  p_referrer text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class record;
  v_clean jsonb := '{}'::jsonb;
  v_key text;
  v_val jsonb;
  v_allowed constant text[] :=
    array['channel', 'service', 'serviceId', 'amount', 'vc', 'status',
          'source', 'productId', 'qty', 'step'];
begin
  if not public.analytics_event_allowed(p_event_name) then
    return;
  end if;

  if jsonb_typeof(p_metadata) = 'object' then
    for v_key, v_val in select * from jsonb_each(p_metadata)
    loop
      if v_key = any(v_allowed)
         and jsonb_typeof(v_val) in ('string', 'number', 'boolean') then
        if jsonb_typeof(v_val) = 'string' then
          v_val := to_jsonb(left(v_val #>> '{}', 80));
        end if;
        v_clean := jsonb_set(v_clean, array[v_key], v_val);
      end if;
    end loop;
  end if;

  select * into v_class from public.analytics_user_class();

  insert into public.website_events
    (event_name, session_id, user_type, user_id, path, referrer, metadata)
  values (
    p_event_name,
    left(p_session_id, 100),
    v_class.user_type,
    v_class.user_id,
    left(coalesce(p_path, '/'), 255),
    left(p_referrer, 255),
    v_clean
  );
end;
$$;

-- ============================================================
-- RPC: heartbeat_presence (updated every ~60s by each open browser tab)
-- ============================================================
create or replace function public.heartbeat_presence(
  p_session_id text,
  p_path text default null,
  p_device text default null,
  p_referrer text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class record;
begin
  select * into v_class from public.analytics_user_class();

  insert into public.live_sessions
    (session_id, user_id, user_type, role, path, device, referrer)
  values (
    left(p_session_id, 100),
    v_class.user_id,
    v_class.user_type,
    v_class.user_role,
    left(coalesce(p_path, '/'), 255),
    left(p_device, 80),
    left(p_referrer, 255)
  )
  on conflict (session_id) do update set
    last_seen_at = now(),
    path = coalesce(excluded.path, live_sessions.path),
    device = coalesce(excluded.device, live_sessions.device),
    referrer = coalesce(excluded.referrer, live_sessions.referrer),
    user_id = coalesce(excluded.user_id, live_sessions.user_id),
    user_type = coalesce(excluded.user_type, live_sessions.user_type),
    role = coalesce(excluded.role, live_sessions.role);

  -- Keep the table small: each heartbeat has a 5% chance of sweeping stale
  -- sessions (2+ minutes without a heartbeat). The dashboard also calls
  -- purge_stale_sessions on load.
  if random() < 0.05 then
    perform public.purge_stale_sessions(2);
  end if;
end;
$$;

-- ============================================================
-- RPC: purge_stale_sessions(minutes) -> count deleted
-- ============================================================
create or replace function public.purge_stale_sessions(p_minutes int default 120)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted int;
begin
  delete from public.live_sessions
  where last_seen_at < now() - make_interval(mins => p_minutes);
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

-- ============================================================
-- Grants (anonymous + authenticated may call the tracking RPCs,
-- only authenticated/staff may purge).
-- ============================================================
revoke all on function public.record_analytics_event(text, text, text, text, jsonb) from public;
revoke all on function public.heartbeat_presence(text, text, text, text) from public;
revoke all on function public.purge_stale_sessions(int) from public;

grant execute on function public.record_analytics_event(text, text, text, text, jsonb) to anon, authenticated, service_role;
grant execute on function public.heartbeat_presence(text, text, text, text) to anon, authenticated, service_role;
grant execute on function public.purge_stale_sessions(int) to authenticated, service_role;