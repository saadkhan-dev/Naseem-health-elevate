-- ---------------------------------------------------------------------------
-- Admin notification on new patient registration
-- ---------------------------------------------------------------------------
-- Registration has no server function to hook (signup is a direct
-- `supabase.auth.signUp` from the browser), so the auth-user trigger
-- `handle_new_user` (already created by `signup-gender-profile.sql`) is
-- redefined to ALSO record a best-effort broadcast admin notification in
-- `admin_notifications`. The clinic then knows a fresh patient account exists.
--
-- Order of application:
--   1. `admin-notifications.sql`  (table + RLS + dedup indexes — REQUIRED)
--   2. this file
--
-- Safety:
--   - The notification insert is isolated in its own EXCEPTION block: if it
--     fails for any reason the profile insert + signup still succeed.
--   - Only actual PATIENT signups notify (staff/doctor roles created by the
--     clinic do not — that would just be our own actions).
--   - `dedup_key = 'registration:' || new.id` is implicitly unique, and the
--     `ON CONFLICT` targets the broadcast partial unique index as a safety
--     net in case the trigger ever fires twice for the same user.
--   - No phone / email / gender ends up in the notification text.
--
-- Safe to re-run (CREATE OR REPLACE + ON CONFLICT DO NOTHING).
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_full_name text;
begin
  insert into public.profiles (id, full_name, phone, gender, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'phone', ''),
    nullif(new.raw_user_meta_data ->> 'gender', ''),
    coalesce(new.raw_user_meta_data ->> 'role', 'patient')
  );

  v_role := coalesce(new.raw_user_meta_data ->> 'role', 'patient');
  v_full_name := coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), '');

  if v_role = 'patient' then
    begin
      insert into public.admin_notifications (recipient_id, type, title, body, link, dedup_key)
      values (
        null,
        'new_patient',
        'New patient registration',
        case
          when v_full_name <> '' then
            'A new patient account was created for ' || v_full_name || '.'
          else
            'A new patient account was created.'
        end,
        '/admin',
        'registration:' || new.id::text
      )
      on conflict (dedup_key) where recipient_id is null do nothing;
    exception
      when others then null;
    end;
  end if;

  return new;
end;
$$;