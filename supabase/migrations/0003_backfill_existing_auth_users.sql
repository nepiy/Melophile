-- Accounts that existed before 0001 was installed already live in auth.users,
-- but the `on_auth_user_created` trigger could not have made their public
-- account rows. Backfill those rows once, without touching any account that
-- the trigger has already created. Run after 0001 and 0002.

insert into public.users (
  id,
  email,
  username,
  auth_method,
  email_verified,
  created_at
)
select
  au.id,
  coalesce(au.email, ''),
  left(
    coalesce(
      nullif(
        regexp_replace(
          lower(coalesce(au.raw_user_meta_data ->> 'preferred_username', split_part(coalesce(au.email, ''), '@', 1))),
          '[^a-z0-9_]+',
          '_',
          'g'
        ),
        ''
      ),
      'listener'
    ) || '_' || left(replace(au.id::text, '-', ''), 6),
    24
  ),
  case when au.raw_app_meta_data ->> 'provider' = 'google' then 'google' else 'email' end::public.auth_method,
  au.email_confirmed_at is not null,
  coalesce(au.created_at, now())
from auth.users au
where not exists (select 1 from public.users u where u.id = au.id)
on conflict (id) do nothing;

insert into public.profiles (user_id, full_name, profile_picture)
select
  au.id,
  coalesce(au.raw_user_meta_data ->> 'full_name', au.raw_user_meta_data ->> 'name', ''),
  ''
from auth.users au
where exists (select 1 from public.users u where u.id = au.id)
on conflict (user_id) do nothing;
