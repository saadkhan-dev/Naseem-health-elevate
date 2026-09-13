-- ============================================================
-- Health Elevate — Phase 7: Final security hardening
-- Run ONCE in the Supabase SQL Editor. Safe to re-run.
-- Run AFTER all other migrations (in particular after
-- rls-policies.sql, appointment-flow.sql and
-- registration-admin-notification.sql).
-- ============================================================
-- Fixes found during the Phase 7 security audit:
--
--   1. Guest rows were readable by the `anon` role via
--      `appointments_read_guest` / `video_sessions_read_guest`.
--      Those policies expose full appointment + video-session data for
--      EVERY guest to any anonymous request, even though the app never
--      queries those tables with the anon key (guest lookups all go
--      through service-role server functions like checkAppointmentStatus
--      / recover-appointments). Dropping them removes the data leak while
--      keeping the guest booking insert policy intact.
--
--   2. Any signed-in user could self-escalate to `admin`/`doctor` by
--      updating their own profiles row (`profiles_update_own` only checked
--      `id = auth.uid()`), which defeats every `public.is_admin()` gate.
--      The own-row policies now forbid setting role to anything other than
--      `patient`, while still allowing legitimate staff (already
--      admin/doctor) to keep their own profile unbroken.
--
--   3. `handle_new_user` copied `role` from `raw_user_meta_data` (client
--      controllable via the signUp metadata), so a crafted signup could
--      create an admin account from the public signup form. The trigger
--      now always creates `patient` accounts — staff/admin accounts are
--      created directly in the database by the clinic, as before.
--
-- NOTE: rows that were ALREADY escalated before this migration still hold
-- role='admin'/'doctor' — after running this file, review `profiles` and
-- correct any non-staff accounts manually.
-- ============================================================

-- 1) Guests: no anonymous SELECT of appointment / video-session rows -------
drop policy if exists appointments_read_guest on public.appointments;
drop policy if exists video_sessions_read_guest on public.video_sessions;

-- 2) Profiles: self-service can never set a staff role ---------------------
drop policy if exists profiles_insert_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;

create policy profiles_insert_own on public.profiles
  for insert to authenticated
  with check (id = auth.uid() and (role is null or role = 'patient'));

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and (role is null or role = 'patient' or public.is_admin()));

-- 3) New-signup trigger: always create a patient account -------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_full_name text;
begin
  insert into public.profiles (id, full_name, phone, gender, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'phone', ''),
    nullif(new.raw_user_meta_data ->> 'gender', ''),
    'patient'
  );

  v_full_name := coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), '');

  -- Best-effort broadcast admin notification for the new account.
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

  return new;
end;
$$;