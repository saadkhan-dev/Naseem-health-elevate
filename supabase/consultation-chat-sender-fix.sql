-- ============================================================
-- Consultation chat — sender-identity hardening + notification
-- upgrades (incremental migration for existing databases).
--
-- Run manually in the Supabase SQL Editor (re-runnable).
--
-- 1) Patient notification improvements:
--    - Title names the consultation's DOCTOR participant ("New message from
--      Dr. Naseem Ahmed Khan [Appointment No]") instead of the operator who
--      actually sent the message (an admin/manager's display name like
--      "Hassan"), so the notification reads as coming from the doctor.
--    - The 10-minute dedup is now PER CONVERSATION (matched through
--      the notification's link), not global — a message in another
--      conversation no longer suppresses a notification for this one.
--    - File messages without text produce a non-empty body ("sent a
--      file") instead of an empty notification body.
--
-- The sender-attribution data fix itself is CODE-LEVEL
-- (`consultationAuthMiddleware` now sends ONLY the declared
-- surface's token), so no data migration is needed here.
-- ============================================================

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

  -- Per-conversation debounce: only ONE doctor-message notification per
  -- conversation inside any 10-minute window. The link encodes the
  -- conversation id, so matching on it scopes the guard correctly.
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
-- QA / verification (run after applying; expect 1 row each)
-- ---------------------------------------------------------------------------
-- select trigger_name from information_schema.triggers
-- where event_object_table = 'consultation_messages'
--   and trigger_name = 'consultation_notify_patient';
--
-- Manually inserted doctor message (replace ids):
--   insert into public.consultation_messages
--     (conversation_id, sender_id, sender_role, body)
--   values ('<conversation-id>', '<doctor-user-id>', 'doctor',
--           'This is a test message — is the notification titled with the doctor name?');
--   select title, body, link from public.patient_notifications
--   where type = 'consultation_message' order by created_at desc limit 5;