-- =============================================================================
-- Melophile Records — customer accounts, profiles, addresses, orders, payments
--
-- Run this once against your Supabase project:
--   Supabase dashboard → SQL Editor → New query → paste → Run
-- It is idempotent: running it twice is safe.
--
-- WHAT THIS DOES NOT TOUCH
-- The admin panel keeps its own scrypt + session login in SQLite. Nothing here
-- grants admin access, and no policy below can be reached by an anonymous
-- visitor. Admin screens read this database through the service-role key on the
-- server, which bypasses RLS by design.
--
-- THE SECURITY MODEL IN ONE LINE
-- Every table is deny-by-default. A signed-in user can read and write their own
-- rows and nothing else, enforced by Postgres itself — so a bug in application
-- code cannot leak one customer's address to another.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Enums. Constrained at the database, not just in TypeScript, so a bad write
-- from anywhere is rejected by Postgres.
-- ---------------------------------------------------------------------------

do $$ begin
  create type public.gender_option as enum ('female', 'male', 'non_binary', 'prefer_not_to_say', 'self_described');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.account_status as enum ('active', 'suspended', 'banned', 'deleted');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.auth_method as enum ('email', 'google');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.order_status as enum ('pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.payment_status as enum ('unpaid', 'pending', 'paid', 'failed', 'refunded');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.activity_type as enum (
    'signed_up', 'signed_in', 'signed_out', 'password_changed', 'password_reset_requested',
    'profile_updated', 'address_added', 'address_updated', 'address_deleted',
    'avatar_updated', 'email_verified', 'order_placed', 'account_deleted',
    'suspended_by_admin', 'banned_by_admin', 'reinstated_by_admin'
  );
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- updated_at, maintained by the database rather than by every caller
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ===========================================================================
-- users — the app-level identity, one row per auth.users row
--
-- Supabase owns auth.users (email, password hash, providers, verification).
-- This table holds what the APPLICATION needs and auth.users has no business
-- knowing: the unique username, the account status, the admin's notes.
-- ===========================================================================

-- `username` uses citext below, so the extension must exist before the table
-- is parsed (not afterwards).
create extension if not exists citext;

create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  -- Case-insensitive uniqueness: "Nea" and "nea" are the same person's claim.
  username citext,
  status public.account_status not null default 'active',
  auth_method public.auth_method not null default 'email',
  -- Denormalised from auth.users so the admin can filter on it cheaply.
  email_verified boolean not null default false,
  last_login_at timestamptz,
  -- Set when an admin suspends or bans, so the reason survives the click.
  status_reason text not null default '',
  status_changed_at timestamptz,
  -- Soft delete: the row stays so orders keep a customer, but the person is gone.
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists users_username_key on public.users (username) where username is not null;
create unique index if not exists users_email_key on public.users (lower(email));
create index if not exists users_status_idx on public.users (status);
create index if not exists users_created_idx on public.users (created_at desc);

drop trigger if exists users_touch on public.users;
create trigger users_touch before update on public.users
  for each row execute function public.touch_updated_at();

-- ===========================================================================
-- profiles — personal information, one row per user
-- ===========================================================================

create table if not exists public.profiles (
  user_id uuid primary key references public.users (id) on delete cascade,
  full_name text not null default '',
  phone_number text not null default '',
  -- Storage object path, not a URL. URLs are signed at read time.
  profile_picture text not null default '',
  date_of_birth date,
  gender public.gender_option,
  gender_self_described text not null default '',
  -- Free text the customer controls; shown nowhere public.
  bio text not null default '',
  marketing_opt_in boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- A date of birth in the future, or implying an age over 120, is a typo.
alter table public.profiles drop constraint if exists profiles_dob_sane;
alter table public.profiles add constraint profiles_dob_sane
  check (date_of_birth is null or (date_of_birth <= current_date and date_of_birth > current_date - interval '120 years'));

-- ===========================================================================
-- addresses — many per user
-- ===========================================================================

create table if not exists public.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  label text not null default 'Home',
  recipient text not null default '',
  country text not null default '',
  state text not null default '',
  city text not null default '',
  postal_code text not null default '',
  street_address text not null default '',
  phone_number text not null default '',
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists addresses_user_idx on public.addresses (user_id);
-- At most one default per user, enforced by the database rather than by hope.
create unique index if not exists addresses_one_default
  on public.addresses (user_id) where is_default;

drop trigger if exists addresses_touch on public.addresses;
create trigger addresses_touch before update on public.addresses
  for each row execute function public.touch_updated_at();

-- ===========================================================================
-- orders
--
-- user_id is NULLABLE on purpose: the shop already takes guest checkouts and
-- must keep doing so. A guest order carries an email, and claiming it later is
-- a matter of matching that email to a new account.
-- ===========================================================================

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  -- Human-quotable, e.g. MLPHL-4K2Q7. What a customer reads down the phone.
  reference text not null unique,
  user_id uuid references public.users (id) on delete set null,

  email text not null,
  customer_name text not null default '',
  phone text not null default '',

  subtotal_amount integer not null default 0,
  shipping_amount integer not null default 0,
  -- Every amount is integer minor units (pence). Never a float: 0.1 + 0.2 is
  -- not 0.3, and a ledger that adds up in floats is wrong by the year end.
  total_amount integer not null default 0,
  currency text not null default 'GBP',

  payment_status public.payment_status not null default 'unpaid',
  order_status public.order_status not null default 'pending',

  shipping_address text not null default '',
  tracking_number text not null default '',
  tracking_url text not null default '',
  delivered_at timestamptz,

  admin_note text not null default '',
  -- Notification honesty: recorded, never assumed. Mirrors the booking flow.
  notified boolean not null default false,
  notify_error text not null default '',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists orders_user_idx on public.orders (user_id, created_at desc);
create index if not exists orders_status_idx on public.orders (order_status);
create index if not exists orders_payment_idx on public.orders (payment_status);
create index if not exists orders_email_idx on public.orders (lower(email));
create index if not exists orders_created_idx on public.orders (created_at desc);

alter table public.orders drop constraint if exists orders_amounts_nonnegative;
alter table public.orders add constraint orders_amounts_nonnegative
  check (subtotal_amount >= 0 and shipping_amount >= 0 and total_amount >= 0);

drop trigger if exists orders_touch on public.orders;
create trigger orders_touch before update on public.orders
  for each row execute function public.touch_updated_at();

-- ===========================================================================
-- order_items
--
-- product_id is a plain integer, NOT a foreign key: the catalogue lives in the
-- content database, and an order must survive a product being deleted. Name and
-- price are SNAPSHOTS — a price change tomorrow must never rewrite what someone
-- was charged last month.
-- ===========================================================================

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id integer,
  product_kind text not null default '',
  product_name text not null,
  variant_label text not null default '',
  quantity integer not null default 1,
  unit_price integer not null,
  created_at timestamptz not null default now()
);

create index if not exists order_items_order_idx on public.order_items (order_id);

alter table public.order_items drop constraint if exists order_items_sane;
alter table public.order_items add constraint order_items_sane
  check (quantity > 0 and unit_price >= 0);

-- ===========================================================================
-- payments — one row per attempt, so a retry is visible rather than silent
-- ===========================================================================

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  payment_provider text not null default 'stripe',
  transaction_id text not null default '',
  amount integer not null default 0,
  currency text not null default 'GBP',
  payment_status public.payment_status not null default 'pending',
  -- The provider's own payload, kept for reconciliation. Never rendered raw.
  provider_payload jsonb not null default '{}'::jsonb,
  failure_reason text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payments_order_idx on public.payments (order_id);
create index if not exists payments_txn_idx on public.payments (transaction_id) where transaction_id <> '';

drop trigger if exists payments_touch on public.payments;
create trigger payments_touch before update on public.payments
  for each row execute function public.touch_updated_at();

-- ===========================================================================
-- account_activity — an append-only trail
--
-- The customer sees it as "recent activity"; the admin uses it to answer "was
-- this really them?". Nobody may update or delete a row, including the person
-- it belongs to — an audit trail you can edit is not an audit trail.
-- ===========================================================================

create table if not exists public.account_activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users (id) on delete cascade,
  activity_type public.activity_type not null,
  metadata jsonb not null default '{}'::jsonb,
  ip_address inet,
  user_agent text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists activity_user_idx on public.account_activity (user_id, created_at desc);
create index if not exists activity_type_idx on public.account_activity (activity_type);

-- ===========================================================================
-- New signups: create the application rows automatically.
--
-- Doing this in a trigger rather than in application code means a user created
-- by Google, by email, or by an admin in the dashboard all end up with the same
-- rows. There is no code path that can produce an auth user with no profile.
-- ===========================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base_username text;
  candidate text;
  suffix integer := 0;
  provider text;
begin
  provider := coalesce(new.raw_app_meta_data ->> 'provider', 'email');

  -- Derive a username from the email local part, then make it unique.
  base_username := regexp_replace(lower(split_part(coalesce(new.email, ''), '@', 1)), '[^a-z0-9_]', '', 'g');
  if length(base_username) < 3 then
    base_username := 'listener';
  end if;
  base_username := left(base_username, 20);

  candidate := base_username;
  while exists (select 1 from public.users u where u.username = candidate::citext) loop
    suffix := suffix + 1;
    candidate := left(base_username, 20 - length(suffix::text)) || suffix::text;
  end loop;

  insert into public.users (id, email, username, auth_method, email_verified, created_at)
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
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', '')
  )
  on conflict (user_id) do nothing;

  insert into public.account_activity (user_id, activity_type, metadata)
  values (new.id, 'signed_up', jsonb_build_object('provider', provider));

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep the mirrored verification flag honest when Supabase confirms an email.
create or replace function public.handle_user_updated()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.users
     set email = coalesce(new.email, users.email),
         email_verified = new.email_confirmed_at is not null,
         updated_at = now()
   where users.id = new.id;

  if old.email_confirmed_at is null and new.email_confirmed_at is not null then
    insert into public.account_activity (user_id, activity_type)
    values (new.id, 'email_verified');
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
  after update on auth.users
  for each row execute function public.handle_user_updated();

-- ===========================================================================
-- ROW LEVEL SECURITY
--
-- Enabled on every table. With RLS on and no matching policy, Postgres denies
-- the read — so anything not explicitly allowed below is already forbidden.
-- The server's service-role key bypasses all of this; the browser's anon key
-- never does.
-- ===========================================================================

alter table public.users            enable row level security;
alter table public.profiles         enable row level security;
alter table public.addresses        enable row level security;
alter table public.orders           enable row level security;
alter table public.order_items      enable row level security;
alter table public.payments         enable row level security;
alter table public.account_activity enable row level security;

-- users ---------------------------------------------------------------------
drop policy if exists users_select_own on public.users;
create policy users_select_own on public.users
  for select using (auth.uid() = id);

-- A user may edit their own row, but must not be able to promote themselves or
-- lift their own suspension: status and auth_method are held to their old value.
drop policy if exists users_update_own on public.users;
create policy users_update_own on public.users
  for update using (auth.uid() = id)
  with check (
    auth.uid() = id
    and status = (select u.status from public.users u where u.id = auth.uid())
    and auth_method = (select u.auth_method from public.users u where u.id = auth.uid())
  );

-- profiles ------------------------------------------------------------------
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select using (auth.uid() = user_id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert with check (auth.uid() = user_id);

-- addresses -----------------------------------------------------------------
drop policy if exists addresses_all_own on public.addresses;
create policy addresses_all_own on public.addresses
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- orders --------------------------------------------------------------------
-- Read only. Orders are written server-side with the service role, because a
-- browser that can insert an order is a browser that can invent a paid one.
drop policy if exists orders_select_own on public.orders;
create policy orders_select_own on public.orders
  for select using (auth.uid() = user_id);

drop policy if exists order_items_select_own on public.order_items;
create policy order_items_select_own on public.order_items
  for select using (
    exists (select 1 from public.orders o where o.id = order_items.order_id and o.user_id = auth.uid())
  );

drop policy if exists payments_select_own on public.payments;
create policy payments_select_own on public.payments
  for select using (
    exists (select 1 from public.orders o where o.id = payments.order_id and o.user_id = auth.uid())
  );

-- account_activity ----------------------------------------------------------
-- Read your own. No update or delete policy exists for anyone, so the trail is
-- append-only even to its owner.
drop policy if exists activity_select_own on public.account_activity;
create policy activity_select_own on public.account_activity
  for select using (auth.uid() = user_id);

-- ===========================================================================
-- STORAGE — profile pictures
--
-- Public bucket so avatars can be served straight from the CDN, but writes are
-- locked to a folder named after the user's own id. A signed-in customer can
-- replace their own avatar and nobody else's.
-- ===========================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 4194304, array['image/jpeg','image/png','image/webp','image/avif'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists avatars_read on storage.objects;
create policy avatars_read on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists avatars_insert_own on storage.objects;
create policy avatars_insert_own on storage.objects
  for insert with check (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists avatars_update_own on storage.objects;
create policy avatars_update_own on storage.objects
  for update using (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists avatars_delete_own on storage.objects;
create policy avatars_delete_own on storage.objects
  for delete using (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ===========================================================================
-- Admin analytics, computed in the database rather than by pulling every row
-- into the application and counting there.
-- ===========================================================================

create or replace view public.admin_user_stats as
select
  count(*)                                                        as total_users,
  count(*) filter (where status = 'active')                       as active_users,
  count(*) filter (where status = 'suspended')                    as suspended_users,
  count(*) filter (where status = 'banned')                       as banned_users,
  count(*) filter (where email_verified)                          as verified_users,
  count(*) filter (where created_at >= now() - interval '7 days')  as new_last_7_days,
  count(*) filter (where created_at >= now() - interval '30 days') as new_last_30_days,
  count(*) filter (where last_login_at >= now() - interval '30 days') as active_last_30_days
from public.users
where deleted_at is null;

create or replace view public.admin_order_stats as
select
  count(*)                                                            as total_orders,
  count(*) filter (where payment_status = 'paid')                     as paid_orders,
  count(*) filter (where order_status = 'pending')                    as pending_orders,
  coalesce(sum(total_amount) filter (where payment_status = 'paid'), 0)          as revenue_total,
  coalesce(sum(total_amount) filter (where payment_status = 'paid'
    and created_at >= now() - interval '30 days'), 0)                            as revenue_30_days,
  coalesce(avg(total_amount) filter (where payment_status = 'paid'), 0)::integer as average_order_value
from public.orders;

-- The views summarise other people's rows, so they must never be readable by a
-- customer. Revoking here means only the service role can select them.
revoke all on public.admin_user_stats from anon, authenticated;
revoke all on public.admin_order_stats from anon, authenticated;
