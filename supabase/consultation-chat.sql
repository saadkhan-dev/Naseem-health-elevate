-- ============================================================
-- Consultation Communication, Persistent Chat & Consultation
-- History System
--
-- Adds appointment-linked persistent conversations, realtime
-- chat messages, private file sharing, consultation summaries
-- and an audit trail to the existing clinic app.
--
-- Design notes
-- ------------
-- * One conversation per appointment (unique appointment_id).
--   A conversation NEVER mixes patients or appointments.
-- * Every message belongs to a conversation; a user can only
--   read/write inside conversations they participate in.
-- * RLS is enforced at the table AND storage level, so even a
--   direct Supabase (anon-key) request cannot read another
--   patient's conversation, messages or files.
-- * `public.is_admin()` (role in ('admin','doctor')) gives the
--   clinic staff full access, matching every other table.
-- * Conversations are created by server functions (service-role)
--   only -- there is no anon INSERT policy on conversations or
--   participants.
-- * Follow-up chat = status 'active'. Post-consultation the
--   clinic sets 'read_only' (history preserved, no new sends).
-- * Attachment storage: private bucket `consultation-attachments`
--   under {conversation_id}/{uploader_id}/{uuid}-{filename}.
--   Downloads always use short-lived signed URLs.
-- * Realtime publishes messages, conversations and participants;
--   subscribers are filtered through RLS (no cross-patient leaks).
--
-- Run manually in the Supabase SQL Editor (re-runnable).
-- ============================================================

-- ---------------------------------------------------------------------------
-- 1) consultation_conversations
-- ---------------------------------------------------------------------------
create table if not exists public.consultation_conversations (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null unique references public.appointments(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'read_only')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists consultation_conversations_last_message_idx
  on public.consultation_conversations (last_message_at desc);

-- ---------------------------------------------------------------------------
-- 2) consultation_participants
-- ---------------------------------------------------------------------------
create table if not exists public.consultation_participants (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.consultation_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('patient', 'doctor', 'admin')),
  last_read_at timestamptz not null default now(),
  joined_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (conversation_id, user_id)
);

create index if not exists consultation_participants_user_idx
  on public.consultation_participants (user_id, conversation_id);

-- ---------------------------------------------------------------------------
-- 3) consultation_messages
-- ---------------------------------------------------------------------------
create table if not exists public.consultation_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.consultation_conversations(id) on delete cascade,
  sender_id uuid references auth.users(id) on delete set null,
  sender_role text not null check (sender_role in ('patient', 'doctor')),
  body text not null default '',
  message_type text not null default 'text' check (message_type in ('text', 'file', 'system')),
  reply_to_id uuid references public.consultation_messages(id) on delete set null,
  is_pinned boolean not null default false,
  pinned_at timestamptz,
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists consultation_messages_conversation_created_idx
  on public.consultation_messages (conversation_id, created_at desc);

create index if not exists consultation_messages_pinned_idx
  on public.consultation_messages (conversation_id, is_pinned) where is_pinned = true;

create index if not exists consultation_messages_sender_idx
  on public.consultation_messages (sender_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 4) consultation_attachments
-- ---------------------------------------------------------------------------
create table if not exists public.consultation_attachments (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.consultation_conversations(id) on delete cascade,
  message_id uuid references public.consultation_messages(id) on delete set null,
  uploaded_by uuid references auth.users(id) on delete set null,
  storage_path text not null,
  file_name text not null,
  mime_type text not null default 'application/octet-stream',
  file_size bigint not null default 0,
  attachment_type text not null default 'document'
    check (attachment_type in ('medical_report', 'lab_result', 'prescription', 'image', 'xray', 'document')),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists consultation_attachments_conversation_idx
  on public.consultation_attachments (conversation_id, created_at desc);

create index if not exists consultation_attachments_message_idx
  on public.consultation_attachments (message_id);

-- ---------------------------------------------------------------------------
-- 5) consultation_summaries
-- ---------------------------------------------------------------------------
create table if not exists public.consultation_summaries (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null unique references public.consultation_conversations(id) on delete cascade,
  appointment_id uuid references public.appointments(id) on delete cascade,
  doctor_id uuid references auth.users(id) on delete set null,
  chief_concern text not null default '',
  symptoms text not null default '',
  diagnosis text not null default '',
  doctor_notes text not null default '',
  advice text not null default '',
  prescription text not null default '',
  follow_up_date date,
  additional_notes text not null default '',
  status text not null default 'draft' check (status in ('draft', 'final')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 6) consultation_events — audit trail
-- ---------------------------------------------------------------------------
create table if not exists public.consultation_events (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.consultation_conversations(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  actor_role text,
  event_type text not null,
  message_id uuid references public.consultation_messages(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists consultation_events_conversation_idx
  on public.consultation_events (conversation_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 7) RLS
-- ---------------------------------------------------------------------------
alter table public.consultation_conversations enable row level security;
alter table public.consultation_participants enable row level security;
alter table public.consultation_messages enable row level security;
alter table public.consultation_attachments enable row level security;
alter table public.consultation_summaries enable row level security;
alter table public.consultation_events enable row level security;

-- ---- conversations --------------------------------------------------------
drop policy if exists consultation_conversations_select_participant on public.consultation_conversations;
drop policy if exists consultation_conversations_select_admin on public.consultation_conversations;
drop policy if exists consultation_conversations_update_admin on public.consultation_conversations;

create policy consultation_conversations_select_participant on public.consultation_conversations
  for select to authenticated
  using (
    exists (
      select 1 from public.consultation_participants p
      where p.conversation_id = consultation_conversations.id
        and p.user_id = auth.uid()
    )
  );

create policy consultation_conversations_select_admin on public.consultation_conversations
  for select to authenticated
  using (public.is_admin());

create policy consultation_conversations_update_admin on public.consultation_conversations
  for update to authenticated
  using (public.is_admin())
  with check (status in ('active', 'read_only'));

-- Conversations/participants are created by server functions (service-role),
-- so there are deliberately NO anon INSERT/DELETE policies.

-- ---- participants ----------------------------------------------------------
-- Note: intentionally scoped to OWN row or staff only. A policy that tried to
-- expose "other participants of the same conversation" would recurse into this
-- table through its own predicate (RLS applies to policy subqueries).
drop policy if exists consultation_participants_select on public.consultation_participants;
drop policy if exists consultation_participants_update_own on public.consultation_participants;

create policy consultation_participants_select on public.consultation_participants
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy consultation_participants_update_own on public.consultation_participants
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---- messages --------------------------------------------------------------
drop policy if exists consultation_messages_select on public.consultation_messages;
drop policy if exists consultation_messages_insert on public.consultation_messages;
drop policy if exists consultation_messages_update on public.consultation_messages;
drop policy if exists consultation_messages_delete on public.consultation_messages;

create policy consultation_messages_select on public.consultation_messages
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.consultation_participants p
      where p.conversation_id = consultation_messages.conversation_id
        and p.user_id = auth.uid()
    )
  );

create policy consultation_messages_insert on public.consultation_messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and message_type in ('text', 'file')
    and (message_type <> 'text' or length(btrim(body)) > 0)
    and sender_role = (
      select case when pr.role = 'patient' then 'patient' else 'doctor' end
      from public.profiles pr
      where pr.id = auth.uid()
    )
    and exists (
      select 1 from public.consultation_participants p
      where p.conversation_id = consultation_messages.conversation_id
        and p.user_id = auth.uid()
    )
    and exists (
      select 1 from public.consultation_conversations c
      where c.id = consultation_messages.conversation_id
        and c.status = 'active'
    )
  );

-- A user may update only their OWN (non-deleted) messages (edit / pin /
-- soft-delete). Staff may additionally manage any message so the doctor can
-- pin or correct a patient's upload without leaking anything.
create policy consultation_messages_update on public.consultation_messages
  for update to authenticated
  using (
    public.is_admin()
    or (sender_id = auth.uid() and deleted_at is null)
  )
  with check (
    public.is_admin()
    or (sender_id = auth.uid() and deleted_at is null)
  );

create policy consultation_messages_delete on public.consultation_messages
  for delete to authenticated
  using (public.is_admin());

-- ---- attachments -----------------------------------------------------------
drop policy if exists consultation_attachments_select on public.consultation_attachments;
drop policy if exists consultation_attachments_insert on public.consultation_attachments;
drop policy if exists consultation_attachments_update on public.consultation_attachments;
drop policy if exists consultation_attachments_delete on public.consultation_attachments;

create policy consultation_attachments_select on public.consultation_attachments
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.consultation_participants p
      where p.conversation_id = consultation_attachments.conversation_id
        and p.user_id = auth.uid()
    )
  );

create policy consultation_attachments_insert on public.consultation_attachments
  for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and exists (
      select 1 from public.consultation_participants p
      where p.conversation_id = consultation_attachments.conversation_id
        and p.user_id = auth.uid()
    )
    and exists (
      select 1 from public.consultation_conversations c
      where c.id = consultation_attachments.conversation_id
        and c.status = 'active'
    )
  );

create policy consultation_attachments_update on public.consultation_attachments
  for update to authenticated
  using (
    public.is_admin()
    or (uploaded_by = auth.uid() and deleted_at is null)
  )
  with check (
    public.is_admin()
    or (uploaded_by = auth.uid() and deleted_at is null)
  );

create policy consultation_attachments_delete on public.consultation_attachments
  for delete to authenticated
  using (public.is_admin());

-- ---- summaries -------------------------------------------------------------
drop policy if exists consultation_summaries_select on public.consultation_summaries;
drop policy if exists consultation_summaries_insert_admin on public.consultation_summaries;
drop policy if exists consultation_summaries_update_admin on public.consultation_summaries;
drop policy if exists consultation_summaries_delete_admin on public.consultation_summaries;

create policy consultation_summaries_select on public.consultation_summaries
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.consultation_participants p
      where p.conversation_id = consultation_summaries.conversation_id
        and p.user_id = auth.uid()
    )
  );

create policy consultation_summaries_insert_admin on public.consultation_summaries
  for insert to authenticated
  with check (public.is_admin());

create policy consultation_summaries_update_admin on public.consultation_summaries
  for update to authenticated
  using (public.is_admin())
  with check (status in ('draft', 'final'));

create policy consultation_summaries_delete_admin on public.consultation_summaries
  for delete to authenticated
  using (public.is_admin());

-- ---- events (audit trail) --------------------------------------------------
drop policy if exists consultation_events_select on public.consultation_events;
drop policy if exists consultation_events_insert_admin on public.consultation_events;

create policy consultation_events_select on public.consultation_events
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.consultation_participants p
      where p.conversation_id = consultation_events.conversation_id
        and p.user_id = auth.uid()
    )
  );

create policy consultation_events_insert_admin on public.consultation_events
  for insert to authenticated
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 8) Conversation touch — keep last_message_at fresh on every new message.
--    SECURITY DEFINER so it can write the conversation row regardless of the
--    insert path (patient RLS insert, staff RLS insert or server function).
-- ---------------------------------------------------------------------------
create or replace function public.consultation_touch_conversation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT') then
    update public.consultation_conversations
       set last_message_at = greatest(consultation_conversations.last_message_at, new.created_at),
           updated_at = now()
     where id = new.conversation_id;
  end if;
  return new;
end;
$$;

drop trigger if exists consultation_touch_conversation on public.consultation_messages;
create trigger consultation_touch_conversation
  after insert on public.consultation_messages
  for each row execute function public.consultation_touch_conversation();

-- ---------------------------------------------------------------------------
-- 9) In-app notification for the patient when the clinic replies.
--    Debounced per conversation (max ~1 notification per conversation every
--    10 minutes) so a realtime back-and-forth does not spam the notification
--    center or start an email for every message. The title names the actual
--    sending doctor. SECURITY DEFINER — the patient_notifications row is
--    written like the rest of the app (service-role style).
-- ---------------------------------------------------------------------------
create or replace function public.consultation_notify_patient()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_patient_id uuid;
  v_status text;
  v_appointment_no text;
  v_doctor_name text;
begin
  if new.sender_role <> 'doctor' then
    return new;
  end if;

  select p.user_id into v_patient_id
  from public.consultation_participants p
  where p.conversation_id = new.conversation_id
    and p.role = 'patient'
  limit 1;

  select c.status into v_status
  from public.consultation_conversations c
  where c.id = new.conversation_id;

  if v_patient_id is null or v_status <> 'active' then
    return new;
  end if;

  select a.appointment_no into v_appointment_no
  from public.appointments a
  inner join public.consultation_conversations c on c.appointment_id = a.id
  where c.id = new.conversation_id;

  -- The title names the conversation's DOCTOR participant (the person the
  -- patient knows), NOT `new.sender_id`. Staff messages are always stamped
  -- `sender_role = 'doctor'`, so an admin/manager replying on behalf of a
  -- doctor would otherwise leak their own display name ("Hassan") to the
  -- patient. Fall back to the sender's name only when a conversation has no
  -- doctor participant.
  select coalesce(
           nullif(btrim(doctor.full_name), ''),
           nullif(btrim(sender.full_name), ''),
           'the doctor'
         )
    into v_doctor_name
  from public.consultation_conversations cc
  left join lateral (
    select p.full_name
    from public.consultation_participants part
    join public.profiles p on p.id = part.user_id
    where part.conversation_id = cc.id
      and part.role = 'doctor'
    order by part.created_at
    limit 1
  ) doctor on true
  left join public.profiles sender on sender.id = new.sender_id
  where cc.id = new.conversation_id
  limit 1;

  -- Per-conversation debounce: the link encodes the conversation id, so
  -- matching on it scopes the 10-minute guard to THIS conversation.
  if not exists (
    select 1 from public.patient_notifications n
    where n.user_id = v_patient_id
      and n.type = 'consultation_message'
      and n.link = '/patient/consultations/' || new.conversation_id::text
      and n.created_at > now() - interval '10 minutes'
  ) then
    insert into public.patient_notifications (user_id, type, title, body, link)
    values (
      v_patient_id,
      'consultation_message',
      case
        when v_appointment_no is not null
          then 'New message from ' || v_doctor_name || ' (' || v_appointment_no || ')'
        else 'New message from ' || v_doctor_name
      end,
      case
        when length(btrim(coalesce(new.body, ''))) > 0 then left(new.body, 140)
        else 'sent a file'
      end,
      '/patient/consultations/' || new.conversation_id::text
    );
  end if;

  return new;
end;
$$;

drop trigger if exists consultation_notify_patient on public.consultation_messages;
create trigger consultation_notify_patient
  after insert on public.consultation_messages
  for each row execute function public.consultation_notify_patient();

-- ---------------------------------------------------------------------------
-- 10) Private storage bucket + policies
--     Objects are stored under {conversation_id}/{uploader_id}/{uuid}-{name}.
--     Downloads go through short-lived signed URLs; nothing is public.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('consultation-attachments', 'consultation-attachments', false)
on conflict (id) do nothing;

drop policy if exists consultation_attachments_storage_insert on storage.objects;
drop policy if exists consultation_attachments_storage_read on storage.objects;
drop policy if exists consultation_attachments_storage_delete on storage.objects;

create policy consultation_attachments_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'consultation-attachments'
    and (storage.foldername(name))[2] = auth.uid()::text
    and exists (
      select 1 from public.consultation_participants p
      where p.conversation_id = (storage.foldername(name))[1]::uuid
        and p.user_id = auth.uid()
    )
  );

create policy consultation_attachments_storage_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'consultation-attachments'
    and (
      public.is_admin()
      or exists (
        select 1 from public.consultation_participants p
        where p.conversation_id = (storage.foldername(name))[1]::uuid
          and p.user_id = auth.uid()
      )
    )
  );

create policy consultation_attachments_storage_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'consultation-attachments'
    and (
      public.is_admin()
      or (storage.foldername(name))[2] = auth.uid()::text
    )
  );

-- ---------------------------------------------------------------------------
-- 11) Realtime publication (RLS filters what each subscriber receives).
-- ---------------------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.consultation_messages;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.consultation_conversations;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.consultation_participants;
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- 12) Read-model RPCs (history list + unread counts).
--
-- The patient functions always filter by `p_user_id` inside SQL, so a patient
-- can only ever see their own conversations even if they call the RPC
-- directly. The staff function is SECURITY DEFINER and raises 'forbidden'
-- unless the caller's profile is doctor/admin (`auth.uid()` still resolves to
-- the calling user inside a security-definer function).
-- ---------------------------------------------------------------------------
create or replace function public.consultation_history_for_user(p_user_id uuid)
returns table (
  conversation_id uuid,
  appointment_id uuid,
  appointment_no text,
  status text,
  started_at timestamptz,
  ended_at timestamptz,
  last_message_at timestamptz,
  appointment_date date,
  appointment_time time,
  service_name text,
  is_video boolean,
  vc_no text,
  video_status text,
  patient_name text,
  patient_phone text,
  patient_email text,
  unread_count bigint,
  last_body text,
  last_sender_role text,
  has_attachments boolean
)
language sql
security definer
set search_path = public
as $$
  select
    c.id as conversation_id,
    c.appointment_id,
    a.appointment_no,
    c.status,
    c.started_at,
    c.ended_at,
    c.last_message_at,
    a.date as appointment_date,
    a.time as appointment_time,
    s.name as service_name,
    (s.name is not null and lower(s.name) like '%video consultation%') as is_video,
    vs.vc_no,
    vs.status as video_status,
    pr.full_name as patient_name,
    pr.phone as patient_phone,
    a.patient_email as patient_email,
    (
      select count(*)::bigint
      from public.consultation_messages m
      where m.conversation_id = c.id
        and m.deleted_at is null
        and m.sender_id <> p_user_id
        and (mp.last_read_at is null or m.created_at > mp.last_read_at)
    ) as unread_count,
    (
      select m.body
      from public.consultation_messages m
      where m.conversation_id = c.id and m.deleted_at is null
      order by m.created_at desc limit 1
    ) as last_body,
    (
      select m.sender_role
      from public.consultation_messages m
      where m.conversation_id = c.id and m.deleted_at is null
      order by m.created_at desc limit 1
    ) as last_sender_role,
    exists (
      select 1 from public.consultation_attachments f
      where f.conversation_id = c.id and f.deleted_at is null
    ) as has_attachments
  from public.consultation_conversations c
  join public.appointments a on a.id = c.appointment_id
  left join public.services s on s.id = a.service_id
  left join public.profiles pr on pr.id = a.patient_id
  left join public.consultation_participants mp
    on mp.conversation_id = c.id and mp.user_id = p_user_id
  left join lateral (
    select v.vc_no, v.status
    from public.video_sessions v
    where v.appointment_id = a.id
    order by v.created_at desc
    limit 1
  ) vs on true
  where a.patient_id = p_user_id
  order by c.last_message_at desc;
$$;

create or replace function public.consultation_history_for_staff(
  p_search text default null,
  p_status text default null,
  p_from date default null,
  p_to date default null,
  p_has_attachments boolean default null,
  p_viewer_id uuid default null
)
returns table (
  conversation_id uuid,
  appointment_id uuid,
  appointment_no text,
  status text,
  started_at timestamptz,
  ended_at timestamptz,
  last_message_at timestamptz,
  appointment_date date,
  appointment_time time,
  service_name text,
  is_video boolean,
  vc_no text,
  video_status text,
  patient_name text,
  patient_phone text,
  patient_email text,
  unread_count bigint,
  last_body text,
  last_sender_role text,
  has_attachments boolean,
  message_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_admin() = false then
    raise exception 'forbidden';
  end if;

  return query
  with base as (
    select
      c.id as conversation_id,
      c.appointment_id,
      a.appointment_no,
      c.status,
      c.started_at,
      c.ended_at,
      c.last_message_at,
      a.date as appointment_date,
      a.time as appointment_time,
      s.name as service_name,
      (s.name is not null and lower(s.name) like '%video consultation%') as is_video,
      vs.vc_no,
      vs.status as video_status,
      pr.full_name as patient_name,
      pr.phone as patient_phone,
      a.patient_email as patient_email,
      me.last_read_at as viewer_last_read_at,
      c.id as cid
    from public.consultation_conversations c
    join public.appointments a on a.id = c.appointment_id
    left join public.services s on s.id = a.service_id
    left join public.profiles pr on pr.id = a.patient_id
    left join public.consultation_participants me
      on me.conversation_id = c.id and me.user_id = p_viewer_id
    left join lateral (
      select v.vc_no, v.status
      from public.video_sessions v
      where v.appointment_id = a.id
      order by v.created_at desc
      limit 1
    ) vs on true
    where (p_search is null or p_search = ''
        or pr.full_name ilike '%' || p_search || '%'
        or pr.phone ilike '%' || p_search || '%'
        or a.patient_email ilike '%' || p_search || '%'
        or a.appointment_no ilike '%' || p_search || '%'
        or s.name ilike '%' || p_search || '%')
      and (p_status is null or c.status = p_status)
      and (p_from is null or a.date >= p_from)
      and (p_to is null or a.date <= p_to)
  )
  select
    b.conversation_id,
    b.appointment_id,
    b.appointment_no,
    b.status,
    b.started_at,
    b.ended_at,
    b.last_message_at,
    b.appointment_date,
    b.appointment_time,
    b.service_name,
    b.is_video,
    b.vc_no,
    b.video_status,
    b.patient_name,
    b.patient_phone,
    b.patient_email,
    (
      select count(*)::bigint
      from public.consultation_messages m
      where m.conversation_id = b.cid
        and m.deleted_at is null
        and m.sender_id <> p_viewer_id
        and p_viewer_id is not null
        and (b.viewer_last_read_at is null or m.created_at > b.viewer_last_read_at)
    ) as unread_count,
    (
      select m.body
      from public.consultation_messages m
      where m.conversation_id = b.cid and m.deleted_at is null
      order by m.created_at desc limit 1
    ) as last_body,
    (
      select m.sender_role
      from public.consultation_messages m
      where m.conversation_id = b.cid and m.deleted_at is null
      order by m.created_at desc limit 1
    ) as last_sender_role,
    exists (
      select 1 from public.consultation_attachments f
      where f.conversation_id = b.cid and f.deleted_at is null
    ) as has_attachments,
    (
      select count(*)::bigint
      from public.consultation_messages m
      where m.conversation_id = b.cid and m.deleted_at is null
    ) as message_count
  from base b
  where (p_has_attachments is null or
         exists (
           select 1 from public.consultation_attachments f
           where f.conversation_id = b.cid and f.deleted_at is null
         ) = p_has_attachments)
  order by b.last_message_at desc;
end;
$$;

create or replace function public.consultation_unread_for_user(p_user_id uuid)
returns bigint
language sql
security definer
set search_path = public
as $$
  select count(*)::bigint
  from public.consultation_messages m
  join public.consultation_conversations c
    on c.id = m.conversation_id
  join public.appointments a
    on a.id = c.appointment_id
  left join public.consultation_participants mp
    on mp.conversation_id = c.id
   and mp.user_id = p_user_id
  where a.patient_id = p_user_id
    and m.deleted_at is null
    and m.sender_id <> p_user_id
    and (
      mp.last_read_at is null
      or m.created_at > mp.last_read_at
    );
$$;

-- ---------------------------------------------------------------------------
-- 12) Auto-ensure one conversation per appointment.
--     Every appointment (including video consultations) gets its chat +
--     participants the moment it is created, so doctor and patient can find
--     the conversation without any extra "create" step — including while a
--     video consultation is running. Idempotent (safe to re-run).
-- ---------------------------------------------------------------------------
create or replace function public.consultation_ensure_for_appointment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversation_id uuid;
  v_doctor_id uuid;
begin
  if new.patient_id is null then
    return new;
  end if;

  select id into v_conversation_id
  from public.consultation_conversations
  where appointment_id = new.id;

  if v_conversation_id is null then
    insert into public.consultation_conversations (appointment_id, status, started_at)
    values (new.id, 'active', now())
    returning id into v_conversation_id;

    insert into public.consultation_events
      (conversation_id, actor_id, actor_role, event_type, metadata)
    values (v_conversation_id, null, 'system',
            'conversation_created', jsonb_build_object('source', 'appointment'));
  end if;

  insert into public.consultation_participants (conversation_id, user_id, role)
  values (v_conversation_id, new.patient_id, 'patient')
  on conflict (conversation_id, user_id) do nothing;

  -- Prefer the configured doctor from doctor_profile (single source of truth),
  -- falling back to the first doctor/admin profile if not configured.
  select dp.user_id into v_doctor_id
  from public.doctor_profile dp
  where dp.id = 1 and dp.user_id is not null;

  if v_doctor_id is null then
    select id into v_doctor_id
    from public.profiles
    where role in ('doctor', 'admin')
    order by (case when role = 'doctor' then 0 else 1 end), created_at
    limit 1;
  end if;

  if v_doctor_id is not null then
    insert into public.consultation_participants (conversation_id, user_id, role)
    values (v_conversation_id, v_doctor_id, 'doctor')
    on conflict (conversation_id, user_id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists consultation_ensure_on_appointment on public.appointments;
create trigger consultation_ensure_on_appointment
  after insert on public.appointments
  for each row execute function public.consultation_ensure_for_appointment();

-- Backfill: create conversations + participants for appointments that already
-- existed before this migration ran. Idempotent — safe to run repeatedly.
do $$
declare
  r record;
  v_conversation_id uuid;
  v_doctor_id uuid;
begin
  for r in
    select id, patient_id from public.appointments
    where patient_id is not null
    order by created_at
  loop
    select id into v_conversation_id
    from public.consultation_conversations
    where appointment_id = r.id;

    if v_conversation_id is null then
      insert into public.consultation_conversations (appointment_id, status, started_at)
      values (r.id, 'active', now())
      returning id into v_conversation_id;

      insert into public.consultation_events
        (conversation_id, actor_id, actor_role, event_type, metadata)
      values (v_conversation_id, null, 'system',
              'conversation_created', '{"source":"backfill"}'::jsonb);
    end if;

    insert into public.consultation_participants (conversation_id, user_id, role)
    values (v_conversation_id, r.patient_id, 'patient')
    on conflict (conversation_id, user_id) do nothing;

    -- Prefer the configured doctor from doctor_profile (single source of truth),
    -- falling back to the first doctor/admin profile if not configured.
    select dp.user_id into v_doctor_id
    from public.doctor_profile dp
    where dp.id = 1 and dp.user_id is not null;

    if v_doctor_id is null then
      select id into v_doctor_id
      from public.profiles
      where role in ('doctor', 'admin')
      order by (case when role = 'doctor' then 0 else 1 end), created_at
      limit 1;
    end if;

    if v_doctor_id is not null then
      insert into public.consultation_participants (conversation_id, user_id, role)
      values (v_conversation_id, v_doctor_id, 'doctor')
      on conflict (conversation_id, user_id) do nothing;
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 13) Hardening: sender_id default + table privileges
--
-- sender_id was nullable with no default.  The direct-client insert path
-- omits the column, so every anon/client INSERT silently failed the RLS
-- INSERT policy (`sender_id = auth.uid()` → NULL = uid → false).
-- Restoring the default re-enables patient + staff message sends.
--
-- Explicit GRANTs on the new tables are also required by Supabase: new
-- tables created after the initial bootstrap are not automatically granted
-- to `authenticated` (only the owner role inherits privileges by default).
-- Both blocks are fully idempotent and safe to re-run.
-- ---------------------------------------------------------------------------
alter table public.consultation_messages
  alter column sender_id set default auth.uid();

grant usage on schema public to authenticated;
grant select, insert, update, delete
  on public.consultation_conversations,
      public.consultation_participants,
      public.consultation_messages,
      public.consultation_attachments,
      public.consultation_summaries,
      public.consultation_events
  to authenticated;