-- ============================================================================
-- consultation_history_for_staff — unread counts per-STAFF viewer
--
-- Bug fixed: the old function counted a staff member's unread messages
-- against the PATIENT participant's `last_read_at` marker, so the admin/doctor
-- badge never cleared when the staff member opened the chat and marked it
-- read (markers are per-user).
--
-- The corrected version takes an explicit `p_viewer_id` (the staff user) and
-- counts only messages the VIEWER has not read yet, using the viewer's own
-- `consultation_participants.last_read_at`. When `p_viewer_id` is null the
-- unread count is 0 (no viewer to measure), preserving the old call shape.
--
-- Run this file against an existing database. `supabase/consultation-chat.sql`
-- already contains the same function definition for fresh installs.
-- ============================================================================

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