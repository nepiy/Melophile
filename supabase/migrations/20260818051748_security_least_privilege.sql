-- Remove implicit Data API privileges and harden database-owned trigger code.
--
-- Supabase historically granted every browser role every table privilege in
-- public. RLS currently blocks unwanted rows, but grants and RLS are separate
-- security boundaries. Keep both narrow so a future policy mistake cannot turn
-- into writes to orders, payments, audit history, or identity metadata.

-- The extension is relocatable; keep it out of the exposed public schema.
create schema if not exists extensions;
alter extension citext set schema extensions;
revoke create on schema extensions from public, anon, authenticated;
grant usage on schema extensions to authenticated, service_role;

-- Recreate the signup trigger without copying the user-editable OAuth/avatar
-- URL into a profile field. Names remain plain text; avatars must be uploaded
-- into the private owner-scoped bucket after signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  base_username text;
  candidate text;
  suffix integer := 0;
  provider text;
begin
  provider := coalesce(new.raw_app_meta_data ->> 'provider', 'email');

  base_username := regexp_replace(
    lower(split_part(coalesce(new.email, ''), '@', 1)),
    '[^a-z0-9_]',
    '',
    'g'
  );
  if length(base_username) < 3 then
    base_username := 'listener';
  end if;
  base_username := left(base_username, 20);

  candidate := base_username;
  while exists (
    select 1
    from public.users u
    where u.username = candidate::extensions.citext
  ) loop
    suffix := suffix + 1;
    candidate := left(base_username, 20 - length(suffix::text)) || suffix::text;
  end loop;

  insert into public.users (
    id,
    email,
    username,
    auth_method,
    email_verified,
    created_at
  )
  values (
    new.id,
    coalesce(new.email, ''),
    candidate,
    (case when provider = 'google' then 'google' else 'email' end)::public.auth_method,
    new.email_confirmed_at is not null,
    coalesce(new.created_at, now())
  )
  on conflict (id) do nothing;

  insert into public.profiles (user_id, full_name, profile_picture)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      ''
    ),
    ''
  )
  on conflict (user_id) do nothing;

  insert into public.account_activity (user_id, activity_type, metadata)
  values (new.id, 'signed_up', jsonb_build_object('provider', provider));

  return new;
end;
$$;

-- Every trigger function has a fixed lookup path. The two SECURITY DEFINER
-- functions remain callable by the Auth service through their existing
-- triggers, but are not exposed as PostgREST RPC methods to browser roles.
alter function public.touch_updated_at() set search_path = pg_catalog, public;
alter function public.assign_public_user_id() set search_path = pg_catalog, public;
alter function public.handle_new_user()
  set search_path = pg_catalog, public, extensions;
alter function public.handle_user_updated() set search_path = pg_catalog, public;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.handle_user_updated() from public, anon, authenticated;
grant execute on function public.handle_new_user() to supabase_auth_admin;
grant execute on function public.handle_user_updated() to supabase_auth_admin;

-- OAuth/user metadata is caller-controlled and must not become an arbitrary
-- URL loaded by an administrator's browser. Keep avatars exclusively in the
-- owner's private Storage folder. Existing external values are cleared; users
-- can upload a replacement through the application.
update storage.buckets set public = false where id = 'avatars';

update public.profiles
set profile_picture = ''
where profile_picture <> ''
  and not (
    profile_picture ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]+$'
    and split_part(profile_picture, '/', 1) = user_id::text
  );

alter table public.profiles drop constraint if exists profiles_picture_owned;
alter table public.profiles add constraint profiles_picture_owned check (
  profile_picture = ''
  or (
    profile_picture ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]+$'
    and split_part(profile_picture, '/', 1) = user_id::text
  )
);

-- Rebuild policies with an explicit authenticated role and init-plan-safe
-- auth.uid() calls. Column grants below make username the only mutable users
-- field, so the users policy needs only enforce row ownership.
drop policy if exists users_select_own on public.users;
create policy users_select_own on public.users
  for select to authenticated using ((select auth.uid()) = id);

drop policy if exists users_update_own on public.users;
create policy users_update_own on public.users
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists addresses_all_own on public.addresses;
create policy addresses_all_own on public.addresses
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists orders_select_own on public.orders;
create policy orders_select_own on public.orders
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists order_items_select_own on public.order_items;
create policy order_items_select_own on public.order_items
  for select to authenticated using (
    exists (
      select 1
      from public.orders o
      where o.id = order_items.order_id
        and o.user_id = (select auth.uid())
    )
  );

drop policy if exists payments_select_own on public.payments;
create policy payments_select_own on public.payments
  for select to authenticated using (
    exists (
      select 1
      from public.orders o
      where o.id = payments.order_id
        and o.user_id = (select auth.uid())
    )
  );

drop policy if exists activity_select_own on public.account_activity;
create policy activity_select_own on public.account_activity
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists avatars_read on storage.objects;
drop policy if exists avatars_select_own on storage.objects;
create policy avatars_select_own on storage.objects
  for select to authenticated using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists avatars_insert_own on storage.objects;
create policy avatars_insert_own on storage.objects
  for insert to authenticated with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists avatars_update_own on storage.objects;
create policy avatars_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists avatars_delete_own on storage.objects;
create policy avatars_delete_own on storage.objects
  for delete to authenticated using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Replace inherited full-table grants with the browser's actual operations.
revoke all privileges on all tables in schema public from anon, authenticated;
revoke update (username) on public.users from authenticated;

grant select on public.users to authenticated;
grant update (username) on public.users to authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.addresses to authenticated;
grant select on public.orders, public.order_items, public.payments,
  public.account_activity to authenticated;

-- Make least privilege the default for future migrations too.
alter default privileges for role postgres in schema public
  revoke select, insert, update, delete, truncate, references, trigger
  on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;
alter default privileges for role postgres in schema public
  revoke usage, select on sequences from anon, authenticated;
