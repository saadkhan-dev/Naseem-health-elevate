-- ---------------------------------------------------------------------------
-- Patient signup gender
-- ---------------------------------------------------------------------------
-- The clinic uses gender (pink ♀ / blue ♂ symbols) in consultation chats.
-- The signup form now sends `gender` in the auth user_metadata. This script
-- makes sure:
--   1. the `profiles.gender` column exists;
--   2. the auth-user profile trigger copies `gender` (and the usual
--      full_name/phone/role fields) from raw_user_meta_data when a new
--      auth user signs up.
--
-- Run this once in the Supabase SQL Editor. It is safe to re-run.
-- ---------------------------------------------------------------------------

-- 1) Make sure the column exists (safe if already present).
alter table public.profiles
  add column if not exists gender text;

-- 2) Replace the standard "copy metadata to profiles" trigger function with a
--    version that also carries the gender. `CREATE OR REPLACE` keeps any
--    existing policy/trigger wiring intact and is idempotent.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone, gender, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'phone', ''),
    nullif(new.raw_user_meta_data ->> 'gender', ''),
    coalesce(new.raw_user_meta_data ->> 'role', 'patient')
  );
  return new;
end;
$$;

-- 3) Attach it to auth.users if not already attached (idempotent).
do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'on_auth_user_created'
      and tgrelid = 'auth.users'::regclass
  ) then
    create trigger on_auth_user_created
      after insert on auth.users
      for each row execute procedure public.handle_new_user();
  end if;
end
$$;

-- 4) Optional backfill: copy gender from signup metadata for existing users
--    whose profiles never got one.
update public.profiles p
set gender = u.raw_user_meta_data ->> 'gender'
from auth.users u
where u.id = p.id
  and p.gender is null
  and u.raw_user_meta_data ->> 'gender' is not null;