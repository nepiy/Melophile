-- Customer-facing identity and phone country code.  Kept in the account
-- database so a profile is still complete after a browser or device change.
alter table public.users add column if not exists public_id char(8);
alter table public.profiles add column if not exists phone_country_code text not null default '+1';

create unique index if not exists users_public_id_key on public.users (public_id)
  where public_id is not null;

create or replace function public.assign_public_user_id()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  candidate char(8);
begin
  if new.public_id is not null then return new; end if;
  loop
    candidate := lpad((floor(random() * 100000000)::bigint)::text, 8, '0');
    exit when not exists (select 1 from public.users where public_id = candidate);
  end loop;
  new.public_id := candidate;
  return new;
end;
$$;

drop trigger if exists users_assign_public_id on public.users;
create trigger users_assign_public_id before insert or update of public_id on public.users
  for each row execute function public.assign_public_user_id();

-- Give existing accounts a stable ID too. The partial unique index is the
-- final guard against a collision even under concurrent sign-ups.
update public.users set public_id = null where public_id is null or public_id !~ '^[0-9]{8}$';
