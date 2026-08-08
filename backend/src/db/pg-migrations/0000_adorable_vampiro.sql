CREATE TABLE "about" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"heading" text DEFAULT 'Our story' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"founded_year" integer,
	"show_catalog_count" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "about_photos" (
	"id" serial PRIMARY KEY NOT NULL,
	"image_id" integer,
	"caption" text DEFAULT '' NOT NULL,
	"order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"password_salt" text NOT NULL,
	"must_change_password" boolean DEFAULT false NOT NULL,
	"created_at" timestamp NOT NULL,
	"last_login_at" timestamp,
	CONSTRAINT "admin_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "artists" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"photo_id" integer,
	"short_description" text DEFAULT '' NOT NULL,
	"role" text DEFAULT '' NOT NULL,
	"links" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "artists_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "blackouts" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" text NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	CONSTRAINT "blackouts_date_unique" UNIQUE("date")
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"date" text NOT NULL,
	"time" text NOT NULL,
	"session_type" text NOT NULL,
	"duration_hours" integer NOT NULL,
	"people" integer NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"reference_url" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"admin_note" text DEFAULT '' NOT NULL,
	"notified" boolean DEFAULT false NOT NULL,
	"notify_error" text DEFAULT '' NOT NULL,
	"ip" text DEFAULT '' NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"address_lines" text DEFAULT '' NOT NULL,
	"emails" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"hours" text DEFAULT '' NOT NULL,
	"social_links" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"map_embed" text DEFAULT '' NOT NULL,
	"booking_heading" text DEFAULT 'Book the studio' NOT NULL,
	"booking_intro" text DEFAULT '' NOT NULL,
	"booking_success_message" text DEFAULT '' NOT NULL,
	"response_time" text DEFAULT 'within two working days' NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"image_id" integer,
	"venue" text DEFAULT '' NOT NULL,
	"address_lines" text DEFAULT '' NOT NULL,
	"date" text NOT NULL,
	"start_time" text DEFAULT '' NOT NULL,
	"doors_time" text DEFAULT '' NOT NULL,
	"price_cents" integer DEFAULT 0 NOT NULL,
	"capacity" integer,
	"tickets_sold" integer DEFAULT 0 NOT NULL,
	"external_url" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "events_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "events_page" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"heading" text DEFAULT 'Events' NOT NULL,
	"intro" text DEFAULT '' NOT NULL,
	"empty_message" text DEFAULT '' NOT NULL,
	"past_heading" text DEFAULT 'Previously' NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "home" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"wordmark_line1" text DEFAULT 'MELOPHILE' NOT NULL,
	"wordmark_line2" text DEFAULT 'RECORDS' NOT NULL,
	"wordmark_tagline" text DEFAULT '' NOT NULL,
	"scroll_cue" text DEFAULT 'Scroll' NOT NULL,
	"music_heading" text DEFAULT 'Music' NOT NULL,
	"music_intro" text DEFAULT '' NOT NULL,
	"music_cta" text DEFAULT 'See all music' NOT NULL,
	"services_heading" text DEFAULT 'Our services' NOT NULL,
	"services_intro" text DEFAULT '' NOT NULL,
	"contact_heading" text DEFAULT 'Contact' NOT NULL,
	"contact_cta" text DEFAULT 'Book the studio' NOT NULL,
	"featured_count" integer DEFAULT 4 NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "images" (
	"id" serial PRIMARY KEY NOT NULL,
	"path" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"alt" text DEFAULT '' NOT NULL,
	"mime_type" text NOT NULL,
	"bytes" integer NOT NULL,
	"is_placeholder" boolean DEFAULT false NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"at" timestamp NOT NULL,
	"ok" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"kind" text NOT NULL,
	"product_id" integer,
	"event_id" integer,
	"title_snapshot" text NOT NULL,
	"variant_label" text DEFAULT '' NOT NULL,
	"unit_price_cents" integer NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"reference" text NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"shipping_lines" text DEFAULT '' NOT NULL,
	"subtotal_cents" integer DEFAULT 0 NOT NULL,
	"shipping_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'GBP' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"payment_provider" text DEFAULT 'none' NOT NULL,
	"stripe_session_id" text DEFAULT '' NOT NULL,
	"paid_at" timestamp,
	"notified" boolean DEFAULT false NOT NULL,
	"notify_error" text DEFAULT '' NOT NULL,
	"admin_note" text DEFAULT '' NOT NULL,
	"ip" text DEFAULT '' NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "orders_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"subtitle" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"price_cents" integer DEFAULT 0 NOT NULL,
	"compare_at_cents" integer,
	"image_id" integer,
	"preview_url" text DEFAULT '' NOT NULL,
	"preview_kind" text DEFAULT 'none' NOT NULL,
	"release_id" integer,
	"music_format" text,
	"license_type" text,
	"bpm" integer,
	"musical_key" text DEFAULT '' NOT NULL,
	"variants" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"stock" integer,
	"digital" boolean DEFAULT false NOT NULL,
	"download_url" text DEFAULT '' NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "products_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "release_artists" (
	"release_id" integer NOT NULL,
	"artist_id" integer NOT NULL,
	"role" text DEFAULT '' NOT NULL,
	CONSTRAINT "release_artists_release_id_artist_id_pk" PRIMARY KEY("release_id","artist_id")
);
--> statement-breakpoint
CREATE TABLE "releases" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"artist_id" integer,
	"type" text DEFAULT 'single' NOT NULL,
	"cover_image_id" integer,
	"release_date" text NOT NULL,
	"catalog_number" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"tracklist" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"credits" text DEFAULT '' NOT NULL,
	"streaming_links" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "releases_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"icon" text DEFAULT 'waveform' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"logo_text" text DEFAULT 'MELOPHILE' NOT NULL,
	"nav_music" text DEFAULT 'Music' NOT NULL,
	"nav_artists" text DEFAULT 'Artists' NOT NULL,
	"nav_about" text DEFAULT 'About us' NOT NULL,
	"nav_contact" text DEFAULT 'Contact' NOT NULL,
	"nav_store" text DEFAULT 'Store' NOT NULL,
	"nav_events" text DEFAULT 'Events' NOT NULL,
	"footer_text" text DEFAULT '' NOT NULL,
	"social_links" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"meta_title" text DEFAULT 'Melophile Records' NOT NULL,
	"meta_description" text DEFAULT '' NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_page" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"heading" text DEFAULT 'Store' NOT NULL,
	"intro" text DEFAULT '' NOT NULL,
	"merch_heading" text DEFAULT 'Merch' NOT NULL,
	"merch_intro" text DEFAULT '' NOT NULL,
	"music_heading" text DEFAULT 'Music' NOT NULL,
	"music_intro" text DEFAULT '' NOT NULL,
	"beats_heading" text DEFAULT 'Beats' NOT NULL,
	"beats_intro" text DEFAULT '' NOT NULL,
	"empty_message" text DEFAULT '' NOT NULL,
	"currency" text DEFAULT 'GBP' NOT NULL,
	"currency_symbol" text DEFAULT '£' NOT NULL,
	"shipping_cents" integer DEFAULT 0 NOT NULL,
	"shipping_note" text DEFAULT '' NOT NULL,
	"checkout_note" text DEFAULT '' NOT NULL,
	"success_message" text DEFAULT '' NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "about_photos" ADD CONSTRAINT "about_photos_image_id_images_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."images"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artists" ADD CONSTRAINT "artists_photo_id_images_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."images"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_image_id_images_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."images"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_image_id_images_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."images"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_release_id_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."releases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_artists" ADD CONSTRAINT "release_artists_release_id_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."releases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_artists" ADD CONSTRAINT "release_artists_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "releases" ADD CONSTRAINT "releases_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "releases" ADD CONSTRAINT "releases_cover_image_id_images_id_fk" FOREIGN KEY ("cover_image_id") REFERENCES "public"."images"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_admin_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "about_photos_order_idx" ON "about_photos" USING btree ("order");--> statement-breakpoint
CREATE INDEX "artists_order_idx" ON "artists" USING btree ("order");--> statement-breakpoint
CREATE INDEX "bookings_created_idx" ON "bookings" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "bookings_status_idx" ON "bookings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "events_date_idx" ON "events" USING btree ("date");--> statement-breakpoint
CREATE INDEX "login_attempts_key_idx" ON "login_attempts" USING btree ("key","at");--> statement-breakpoint
CREATE INDEX "order_items_order_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "orders_created_idx" ON "orders" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "products_kind_idx" ON "products" USING btree ("kind","status");--> statement-breakpoint
CREATE INDEX "products_order_idx" ON "products" USING btree ("order");--> statement-breakpoint
CREATE INDEX "releases_date_idx" ON "releases" USING btree ("release_date");--> statement-breakpoint
CREATE INDEX "releases_status_idx" ON "releases" USING btree ("status");--> statement-breakpoint
CREATE INDEX "releases_artist_idx" ON "releases" USING btree ("artist_id");--> statement-breakpoint
CREATE INDEX "services_order_idx" ON "services" USING btree ("order");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");