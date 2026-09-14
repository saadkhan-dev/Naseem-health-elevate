-- ---------------------------------------------------------------------------
-- Admin Notification Center — patient deep-link fix (reproducible migration)
-- ---------------------------------------------------------------------------
-- Context:
--   `registration-admin-notification.sql` defined `handle_new_user()` so new
--   patient registrations produced a deep link `?focus=patient&id=<uuid>`.
--   `phase7-security-hardening.sql` (applied AFTER it) redefined the function
--   to always create a `patient` account (closing a signup role-escalation
--   hole) but regressed the notification `link` back to the generic `/admin`.
--
--   This migration reconciles both concerns in ONE function:
--     1. Profiles always get role='patient' (client-controllable
--        raw_user_meta_data role is ignored) — Phase 7 security fix.
--     2. The broadcast `new_patient` notification deep-links to
--        `/admin?focus=patient&id=<uuid>` using the REAL auth user id so
--        clicking it scrolls to and highlights the exact patient on the
--        admin dashboard.
--
--   Prior versions ALSO carried a latent bug: the `ON CONFLICT (dedup_key)
--   WHERE recipient_id IS NULL` arbiter did not satisfy the partial unique
--   index `admin_notifications_broadcast_dedup_uidx` (whose predicate also
--   includes `dedup_key IS NOT NULL`), so the notification INSERT raised
--   `42P10` on EVERY signup and was silently swallowed by the EXCEPTION
--   block — admins never saw a "New patient registration" notification and
--   the table contained zero `new_patient` rows. The arbiter clause now
--   matches the index predicate exactly, so inserts actually land.
--
-- Safety:
--   - Only the `link` value and the `ON CONFLICT` arbiter differ from the
--     currently-live function; the profile insert, notification body, dedup
--     semantics, EXCEPTION isolation and SECURITY DEFINER + search_path
--     settings are unchanged.
--   - `dedup_key = 'registration:' || new.id` stays stable and idempotent
--     (backed by `admin_notifications_broadcast_dedup_uidx`).
--   - No phone / email / gender in the notification; only the user-supplied
--     full_name appears in the body (pre-existing behavior).
--   - No RLS policy, role, or permission is touched.
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
      '/admin?focus=patient&id=' || new.id::text,
      'registration:' || new.id::text
    )
    on conflict (dedup_key) where dedup_key is not null and recipient_id is null do nothing;
  exception
    when others then null;
  end;

  return new;
end;
$$;