-- Bring the pre-existing bookings user association into the deployed schema,
-- then index rate-limit expiry separately from account/IP lookups. IF NOT
-- EXISTS keeps this safe for databases where the column was added manually.
alter table "bookings" add column if not exists "user_id" text default '' not null;--> statement-breakpoint
create index if not exists "bookings_user_id_idx" on "bookings" using btree ("user_id", "created_at");--> statement-breakpoint
create index if not exists "login_attempts_at_idx" on "login_attempts" using btree ("at");
