ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "user_id" text NOT NULL DEFAULT '';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bookings_user_id_idx" ON "bookings" USING btree ("user_id","created_at");
