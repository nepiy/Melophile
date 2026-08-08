CREATE TABLE `about` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`heading` text DEFAULT 'Our story' NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`founded_year` integer,
	`show_catalog_count` integer DEFAULT true NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `about_photos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`image_id` integer,
	`caption` text DEFAULT '' NOT NULL,
	`order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`image_id`) REFERENCES `images`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `about_photos_order_idx` ON `about_photos` (`order`);--> statement-breakpoint
CREATE TABLE `admin_users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`password_salt` text NOT NULL,
	`must_change_password` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`last_login_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `admin_users_email_unique` ON `admin_users` (`email`);--> statement-breakpoint
CREATE TABLE `artists` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`photo_id` integer,
	`short_description` text DEFAULT '' NOT NULL,
	`role` text DEFAULT '' NOT NULL,
	`links` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`photo_id`) REFERENCES `images`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `artists_order_idx` ON `artists` (`order`);--> statement-breakpoint
CREATE UNIQUE INDEX `artists_slug_unique` ON `artists` (`slug`);--> statement-breakpoint
CREATE TABLE `blackouts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`reason` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `blackouts_date_unique` ON `blackouts` (`date`);--> statement-breakpoint
CREATE TABLE `bookings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`date` text NOT NULL,
	`time` text NOT NULL,
	`session_type` text NOT NULL,
	`duration_hours` integer NOT NULL,
	`people` integer NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`reference_url` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`admin_note` text DEFAULT '' NOT NULL,
	`notified` integer DEFAULT false NOT NULL,
	`notify_error` text DEFAULT '' NOT NULL,
	`ip` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `bookings_created_idx` ON `bookings` (`created_at`);--> statement-breakpoint
CREATE INDEX `bookings_status_idx` ON `bookings` (`status`);--> statement-breakpoint
CREATE TABLE `contact` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`address_lines` text DEFAULT '' NOT NULL,
	`emails` text DEFAULT '[]' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`hours` text DEFAULT '' NOT NULL,
	`social_links` text DEFAULT '[]' NOT NULL,
	`map_embed` text DEFAULT '' NOT NULL,
	`booking_heading` text DEFAULT 'Book the studio' NOT NULL,
	`booking_intro` text DEFAULT '' NOT NULL,
	`booking_success_message` text DEFAULT '' NOT NULL,
	`response_time` text DEFAULT 'within two working days' NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`image_id` integer,
	`venue` text DEFAULT '' NOT NULL,
	`address_lines` text DEFAULT '' NOT NULL,
	`date` text NOT NULL,
	`start_time` text DEFAULT '' NOT NULL,
	`doors_time` text DEFAULT '' NOT NULL,
	`price_cents` integer DEFAULT 0 NOT NULL,
	`capacity` integer,
	`tickets_sold` integer DEFAULT 0 NOT NULL,
	`external_url` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`image_id`) REFERENCES `images`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `events_date_idx` ON `events` (`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `events_slug_unique` ON `events` (`slug`);--> statement-breakpoint
CREATE TABLE `events_page` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`heading` text DEFAULT 'Events' NOT NULL,
	`intro` text DEFAULT '' NOT NULL,
	`empty_message` text DEFAULT '' NOT NULL,
	`past_heading` text DEFAULT 'Previously' NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `home` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`wordmark_line1` text DEFAULT 'MELOPHILE' NOT NULL,
	`wordmark_line2` text DEFAULT 'RECORDS' NOT NULL,
	`wordmark_tagline` text DEFAULT '' NOT NULL,
	`scroll_cue` text DEFAULT 'Scroll' NOT NULL,
	`music_heading` text DEFAULT 'Music' NOT NULL,
	`music_intro` text DEFAULT '' NOT NULL,
	`music_cta` text DEFAULT 'See all music' NOT NULL,
	`services_heading` text DEFAULT 'Our services' NOT NULL,
	`services_intro` text DEFAULT '' NOT NULL,
	`contact_heading` text DEFAULT 'Contact' NOT NULL,
	`contact_cta` text DEFAULT 'Book the studio' NOT NULL,
	`featured_count` integer DEFAULT 4 NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `images` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`path` text NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`alt` text DEFAULT '' NOT NULL,
	`mime_type` text NOT NULL,
	`bytes` integer NOT NULL,
	`is_placeholder` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `login_attempts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`at` integer NOT NULL,
	`ok` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `login_attempts_key_idx` ON `login_attempts` (`key`,`at`);--> statement-breakpoint
CREATE TABLE `order_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_id` integer NOT NULL,
	`kind` text NOT NULL,
	`product_id` integer,
	`event_id` integer,
	`title_snapshot` text NOT NULL,
	`variant_label` text DEFAULT '' NOT NULL,
	`unit_price_cents` integer NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `order_items_order_idx` ON `order_items` (`order_id`);--> statement-breakpoint
CREATE TABLE `orders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`reference` text NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`shipping_lines` text DEFAULT '' NOT NULL,
	`subtotal_cents` integer DEFAULT 0 NOT NULL,
	`shipping_cents` integer DEFAULT 0 NOT NULL,
	`total_cents` integer DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'GBP' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`payment_provider` text DEFAULT 'none' NOT NULL,
	`stripe_session_id` text DEFAULT '' NOT NULL,
	`paid_at` integer,
	`notified` integer DEFAULT false NOT NULL,
	`notify_error` text DEFAULT '' NOT NULL,
	`admin_note` text DEFAULT '' NOT NULL,
	`ip` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `orders_status_idx` ON `orders` (`status`);--> statement-breakpoint
CREATE INDEX `orders_created_idx` ON `orders` (`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `orders_reference_unique` ON `orders` (`reference`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`subtitle` text DEFAULT '' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`price_cents` integer DEFAULT 0 NOT NULL,
	`compare_at_cents` integer,
	`image_id` integer,
	`preview_url` text DEFAULT '' NOT NULL,
	`preview_kind` text DEFAULT 'none' NOT NULL,
	`release_id` integer,
	`music_format` text,
	`license_type` text,
	`bpm` integer,
	`musical_key` text DEFAULT '' NOT NULL,
	`variants` text DEFAULT '[]' NOT NULL,
	`stock` integer,
	`digital` integer DEFAULT false NOT NULL,
	`download_url` text DEFAULT '' NOT NULL,
	`featured` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`image_id`) REFERENCES `images`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`release_id`) REFERENCES `releases`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `products_kind_idx` ON `products` (`kind`,`status`);--> statement-breakpoint
CREATE INDEX `products_order_idx` ON `products` (`order`);--> statement-breakpoint
CREATE UNIQUE INDEX `products_slug_unique` ON `products` (`slug`);--> statement-breakpoint
CREATE TABLE `release_artists` (
	`release_id` integer NOT NULL,
	`artist_id` integer NOT NULL,
	`role` text DEFAULT '' NOT NULL,
	PRIMARY KEY(`release_id`, `artist_id`),
	FOREIGN KEY (`release_id`) REFERENCES `releases`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`artist_id`) REFERENCES `artists`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `releases` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`artist_id` integer,
	`type` text DEFAULT 'single' NOT NULL,
	`cover_image_id` integer,
	`release_date` text NOT NULL,
	`catalog_number` text DEFAULT '' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`tracklist` text DEFAULT '[]' NOT NULL,
	`credits` text DEFAULT '' NOT NULL,
	`streaming_links` text DEFAULT '[]' NOT NULL,
	`featured` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`artist_id`) REFERENCES `artists`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`cover_image_id`) REFERENCES `images`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `releases_date_idx` ON `releases` (`release_date`);--> statement-breakpoint
CREATE INDEX `releases_status_idx` ON `releases` (`status`);--> statement-breakpoint
CREATE INDEX `releases_artist_idx` ON `releases` (`artist_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `releases_slug_unique` ON `releases` (`slug`);--> statement-breakpoint
CREATE TABLE `services` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`icon` text DEFAULT 'waveform' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`order` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `services_order_idx` ON `services` (`order`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `admin_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `site_settings` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`logo_text` text DEFAULT 'MELOPHILE' NOT NULL,
	`nav_music` text DEFAULT 'Music' NOT NULL,
	`nav_artists` text DEFAULT 'Artists' NOT NULL,
	`nav_about` text DEFAULT 'About us' NOT NULL,
	`nav_contact` text DEFAULT 'Contact' NOT NULL,
	`nav_store` text DEFAULT 'Store' NOT NULL,
	`nav_events` text DEFAULT 'Events' NOT NULL,
	`footer_text` text DEFAULT '' NOT NULL,
	`social_links` text DEFAULT '[]' NOT NULL,
	`meta_title` text DEFAULT 'Melophile Records' NOT NULL,
	`meta_description` text DEFAULT '' NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `store_page` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`heading` text DEFAULT 'Store' NOT NULL,
	`intro` text DEFAULT '' NOT NULL,
	`merch_heading` text DEFAULT 'Merch' NOT NULL,
	`merch_intro` text DEFAULT '' NOT NULL,
	`music_heading` text DEFAULT 'Music' NOT NULL,
	`music_intro` text DEFAULT '' NOT NULL,
	`beats_heading` text DEFAULT 'Beats' NOT NULL,
	`beats_intro` text DEFAULT '' NOT NULL,
	`empty_message` text DEFAULT '' NOT NULL,
	`currency` text DEFAULT 'GBP' NOT NULL,
	`currency_symbol` text DEFAULT '£' NOT NULL,
	`shipping_cents` integer DEFAULT 0 NOT NULL,
	`shipping_note` text DEFAULT '' NOT NULL,
	`checkout_note` text DEFAULT '' NOT NULL,
	`success_message` text DEFAULT '' NOT NULL,
	`updated_at` integer NOT NULL
);
