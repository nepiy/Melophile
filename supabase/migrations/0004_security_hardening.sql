-- Security hardening for customer identity data.
--
-- 1. Profile photos are private data in this application. Keep the bucket
--    private and let owners/admins render short-lived signed URLs.
-- 2. A customer may edit only their username on public.users. The previous
--    table-level UPDATE grant also allowed direct API clients to rewrite
--    mirrored verification/audit fields such as email_verified, deleted_at,
--    status_reason and public_id while still satisfying the row policy.

update storage.buckets
set public = false
where id = 'avatars';

drop policy if exists avatars_read on storage.objects;
drop policy if exists avatars_select_own on storage.objects;
create policy avatars_select_own on storage.objects
  for select using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

revoke update on table public.users from authenticated;
grant update (username) on table public.users to authenticated;
