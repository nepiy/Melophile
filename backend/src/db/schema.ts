import { relations } from 'drizzle-orm'
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core'

/* ------------------------------------------------------------------ *
 * Shared shapes
 *
 * Anything list-like that the client edits as a group lives in a JSON
 * column rather than its own table. The rule: if the client would never
 * query it independently and never reorder it across parents, it is JSON.
 * ------------------------------------------------------------------ */

export type Track = { n: number; title: string; duration: string }
export type LinkItem = { label: string; url: string }
export type EmailItem = { label: string; address: string }
export type SocialItem = { platform: string; url: string }
export type StreamingLink = {
  platform: 'spotify' | 'apple' | 'youtube' | 'bandcamp' | 'soundcloud'
  url: string
}

export const RELEASE_TYPES = ['album', 'ep', 'mixtape', 'single'] as const
export type ReleaseType = (typeof RELEASE_TYPES)[number]

export const SESSION_TYPES = ['recording', 'mixing', 'mastering', 'rehearsal'] as const
export type SessionType = (typeof SESSION_TYPES)[number]

export const BOOKING_STATUSES = ['new', 'confirmed', 'declined', 'done'] as const
export type BookingStatus = (typeof BOOKING_STATUSES)[number]

export const PUBLISH_STATUSES = ['draft', 'published'] as const
export type PublishStatus = (typeof PUBLISH_STATUSES)[number]

/**
 * Service icons are a closed set of slugs, not class names or SVG strings.
 * This is the line that keeps "content only" honest: the client picks which
 * icon, never what it looks like.
 */
export const SERVICE_ICONS = [
  'mic',
  'fader',
  'waveform',
  'knob',
  'tape',
  'disc',
  'monitor',
  'patchbay',
] as const
export type ServiceIcon = (typeof SERVICE_ICONS)[number]

export const STREAMING_PLATFORMS = [
  'spotify',
  'apple',
  'youtube',
  'bandcamp',
  'soundcloud',
] as const

/* ------------------------------------------------------------------ *
 * Media
 * ------------------------------------------------------------------ */

/**
 * One row per upload. width/height are stored so next/image always has
 * intrinsic dimensions and can never cause layout shift. `alt` is captured
 * at upload time because retrofitting alt text never happens.
 */
export const images = pgTable('images', {
  id: serial('id').primaryKey(),
  path: text('path').notNull(), // public path, e.g. /uploads/ab12cd.webp
  width: integer('width').notNull(),
  height: integer('height').notNull(),
  alt: text('alt').notNull().default(''),
  mimeType: text('mime_type').notNull(),
  bytes: integer('bytes').notNull(),
  /** Marks seeded procedural placeholder art. Shown in the admin only. */
  isPlaceholder: boolean('is_placeholder').notNull().default(false),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull(),
})

/* ------------------------------------------------------------------ *
 * Singletons — always exactly one row, id = 1
 * ------------------------------------------------------------------ */

export const siteSettings = pgTable('site_settings', {
  id: integer('id').primaryKey().default(1),
  logoText: text('logo_text').notNull().default('MELOPHILE'),
  navMusic: text('nav_music').notNull().default('Music'),
  navArtists: text('nav_artists').notNull().default('Artists'),
  navAbout: text('nav_about').notNull().default('About us'),
  navContact: text('nav_contact').notNull().default('Contact'),
  navStore: text('nav_store').notNull().default('Store'),
  navEvents: text('nav_events').notNull().default('Events'),
  footerText: text('footer_text').notNull().default(''),
  socialLinks: jsonb('social_links').$type<SocialItem[]>().notNull().default([]),
  metaTitle: text('meta_title').notNull().default('Melophile Records'),
  metaDescription: text('meta_description').notNull().default(''),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull(),
})

/**
 * Every user-visible string on the home page. If a heading or a call to
 * action appears on `/`, it is a column here — not a literal in a component.
 */
export const home = pgTable('home', {
  id: integer('id').primaryKey().default(1),
  wordmarkLine1: text('wordmark_line1').notNull().default('MELOPHILE'),
  wordmarkLine2: text('wordmark_line2').notNull().default('RECORDS'),
  wordmarkTagline: text('wordmark_tagline').notNull().default(''),
  scrollCue: text('scroll_cue').notNull().default('Scroll'),
  musicHeading: text('music_heading').notNull().default('Music'),
  musicIntro: text('music_intro').notNull().default(''),
  musicCta: text('music_cta').notNull().default('See all music'),
  servicesHeading: text('services_heading').notNull().default('Our services'),
  servicesIntro: text('services_intro').notNull().default(''),
  contactHeading: text('contact_heading').notNull().default('Contact'),
  contactCta: text('contact_cta').notNull().default('Book the studio'),
  /** How many of the most recent releases section 2 shows. Clamped 4–8. */
  featuredCount: integer('featured_count').notNull().default(4),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull(),
})

export const about = pgTable('about', {
  id: integer('id').primaryKey().default(1),
  heading: text('heading').notNull().default('Our story'),
  /** Markdown. Rendered to React elements, never to an HTML string. */
  body: text('body').notNull().default(''),
  foundedYear: integer('founded_year'),
  showCatalogCount: boolean('show_catalog_count').notNull().default(true),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull(),
})

export const contact = pgTable('contact', {
  id: integer('id').primaryKey().default(1),
  /** Newline-separated. Rendered one line per line, or omitted if blank. */
  addressLines: text('address_lines').notNull().default(''),
  emails: jsonb('emails').$type<EmailItem[]>().notNull().default([]),
  phone: text('phone').notNull().default(''),
  hours: text('hours').notNull().default(''),
  socialLinks: jsonb('social_links').$type<SocialItem[]>().notNull().default([]),
  /** Raw iframe src URL only — never arbitrary HTML. Validated on save. */
  mapEmbed: text('map_embed').notNull().default(''),
  bookingHeading: text('booking_heading').notNull().default('Book the studio'),
  bookingIntro: text('booking_intro').notNull().default(''),
  bookingSuccessMessage: text('booking_success_message').notNull().default(''),
  responseTime: text('response_time').notNull().default('within two working days'),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull(),
})

/* ------------------------------------------------------------------ *
 * Catalogue
 * ------------------------------------------------------------------ */

export const artists = pgTable(
  'artists',
  {
    id: serial('id').primaryKey(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    photoId: integer('photo_id').references(() => images.id, { onDelete: 'set null' }),
    /** Markdown. Revealed only after a click, never on the grid. */
    shortDescription: text('short_description').notNull().default(''),
    role: text('role').notNull().default(''),
    links: jsonb('links').$type<LinkItem[]>().notNull().default([]),
    status: text('status').$type<PublishStatus>().notNull().default('draft'),
    order: integer('order').notNull().default(0),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).notNull(),
  },
  (t) => [
    unique('artists_slug_unique').on(t.slug),
    index('artists_order_idx').on(t.order),
  ],
)

export const releases = pgTable(
  'releases',
  {
    id: serial('id').primaryKey(),
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    /** Primary artist. Features live in release_artists. */
    artistId: integer('artist_id').references(() => artists.id, { onDelete: 'set null' }),
    type: text('type').$type<ReleaseType>().notNull().default('single'),
    coverImageId: integer('cover_image_id').references(() => images.id, {
      onDelete: 'set null',
    }),
    /** ISO date, 'YYYY-MM-DD'. Sorted on as text, which is safe for ISO. */
    releaseDate: text('release_date').notNull(),
    catalogNumber: text('catalog_number').notNull().default(''),
    /** Markdown. */
    description: text('description').notNull().default(''),
    tracklist: jsonb('tracklist').$type<Track[]>().notNull().default([]),
    /** Markdown. */
    credits: text('credits').notNull().default(''),
    streamingLinks: jsonb('streaming_links')
      .$type<StreamingLink[]>()
      .notNull()
      .default([]),
    featured: boolean('featured').notNull().default(false),
    status: text('status').$type<PublishStatus>().notNull().default('draft'),
    order: integer('order').notNull().default(0),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).notNull(),
  },
  (t) => [
    unique('releases_slug_unique').on(t.slug),
    index('releases_date_idx').on(t.releaseDate),
    index('releases_status_idx').on(t.status),
    index('releases_artist_idx').on(t.artistId),
  ],
)

/**
 * Guests and features. The artist page's "Appears on" list is the union of
 * `releases.artistId` and this table — so a release is never written twice.
 */
export const releaseArtists = pgTable(
  'release_artists',
  {
    releaseId: integer('release_id')
      .notNull()
      .references(() => releases.id, { onDelete: 'cascade' }),
    artistId: integer('artist_id')
      .notNull()
      .references(() => artists.id, { onDelete: 'cascade' }),
    role: text('role').notNull().default(''),
  },
  (t) => [primaryKey({ columns: [t.releaseId, t.artistId] })],
)

export const services = pgTable(
  'services',
  {
    id: serial('id').primaryKey(),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    icon: text('icon').$type<ServiceIcon>().notNull().default('waveform'),
    status: text('status').$type<PublishStatus>().notNull().default('draft'),
    order: integer('order').notNull().default(0),
    updatedAt: timestamp('updated_at', { mode: 'date' }).notNull(),
  },
  (t) => [index('services_order_idx').on(t.order)],
)

/**
 * Photo slots for /about. Zero rows is a supported, designed state: the
 * public page drops the photo column from the DOM entirely.
 */
export const aboutPhotos = pgTable(
  'about_photos',
  {
    id: serial('id').primaryKey(),
    imageId: integer('image_id').references(() => images.id, { onDelete: 'set null' }),
    caption: text('caption').notNull().default(''),
    order: integer('order').notNull().default(0),
  },
  (t) => [index('about_photos_order_idx').on(t.order)],
)

/* ------------------------------------------------------------------ *
 * Bookings — written by the public form, read in the admin
 * ------------------------------------------------------------------ */

export const bookings = pgTable(
  'bookings',
  {
    id: serial('id').primaryKey(),
    /** Supabase auth UUID when booked while signed in; blank for guests. */
    userId: text('user_id').notNull().default(''),
    name: text('name').notNull(),
    email: text('email').notNull(),
    phone: text('phone').notNull().default(''),
    /** ISO date 'YYYY-MM-DD' */
    date: text('date').notNull(),
    /** 24h 'HH:MM' */
    time: text('time').notNull(),
    sessionType: text('session_type').$type<SessionType>().notNull(),
    durationHours: integer('duration_hours').notNull(),
    people: integer('people').notNull(),
    notes: text('notes').notNull().default(''),
    referenceUrl: text('reference_url').notNull().default(''),
    status: text('status').$type<BookingStatus>().notNull().default('new'),
    adminNote: text('admin_note').notNull().default(''),
    /**
     * The booking is committed before the email is attempted. If the send
     * fails this stays false and the admin list flags it, so nobody is ever
     * told "sent" when nothing was sent.
     */
    notified: boolean('notified').notNull().default(false),
    notifyError: text('notify_error').notNull().default(''),
    ip: text('ip').notNull().default(''),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull(),
  },
  (t) => [
    index('bookings_user_id_idx').on(t.userId, t.createdAt),
    index('bookings_created_idx').on(t.createdAt),
    index('bookings_status_idx').on(t.status),
  ],
)

/** Dates the client marks unavailable. Enforced in the browser and on the server. */
export const blackouts = pgTable(
  'blackouts',
  {
    id: serial('id').primaryKey(),
    date: text('date').notNull(), // 'YYYY-MM-DD'
    reason: text('reason').notNull().default(''),
  },
  (t) => [unique('blackouts_date_unique').on(t.date)],
)

/* ------------------------------------------------------------------ *
 * Auth
 * ------------------------------------------------------------------ */

export const adminUsers = pgTable(
  'admin_users',
  {
    id: serial('id').primaryKey(),
    email: text('email').notNull(),
    /** scrypt, from node:crypto. No auth dependency. */
    passwordHash: text('password_hash').notNull(),
    passwordSalt: text('password_salt').notNull(),
    /** Set when seeded with the default password; the admin nags until changed. */
    mustChangePassword: boolean('must_change_password').notNull().default(false),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull(),
    lastLoginAt: timestamp('last_login_at', { mode: 'date' }),
  },
  (t) => [unique('admin_users_email_unique').on(t.email)],
)

export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(), // sha256 of the cookie token; the raw token is never stored
    userId: integer('user_id')
      .notNull()
      .references(() => adminUsers.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { mode: 'date' }).notNull(),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull(),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
)

export const loginAttempts = pgTable(
  'login_attempts',
  {
    id: serial('id').primaryKey(),
    /** ip + ':' + lowercased email */
    key: text('key').notNull(),
    at: timestamp('at', { mode: 'date' }).notNull(),
    ok: boolean('ok').notNull(),
  },
  (t) => [index('login_attempts_key_idx').on(t.key, t.at)],
)

/* ------------------------------------------------------------------ *
 * Relations
 * ------------------------------------------------------------------ */

export const releasesRelations = relations(releases, ({ one, many }) => ({
  artist: one(artists, { fields: [releases.artistId], references: [artists.id] }),
  cover: one(images, { fields: [releases.coverImageId], references: [images.id] }),
  features: many(releaseArtists),
}))

export const artistsRelations = relations(artists, ({ one, many }) => ({
  photo: one(images, { fields: [artists.photoId], references: [images.id] }),
  releases: many(releases),
  featuredOn: many(releaseArtists),
}))

export const releaseArtistsRelations = relations(releaseArtists, ({ one }) => ({
  release: one(releases, {
    fields: [releaseArtists.releaseId],
    references: [releases.id],
  }),
  artist: one(artists, { fields: [releaseArtists.artistId], references: [artists.id] }),
}))

export const aboutPhotosRelations = relations(aboutPhotos, ({ one }) => ({
  image: one(images, { fields: [aboutPhotos.imageId], references: [images.id] }),
}))

/* ------------------------------------------------------------------ *
 * Row types — what pages and the admin code against
 * ------------------------------------------------------------------ */

export type ImageRow = typeof images.$inferSelect
export type SiteSettingsRow = typeof siteSettings.$inferSelect
export type HomeRow = typeof home.$inferSelect
export type AboutRow = typeof about.$inferSelect
export type ContactRow = typeof contact.$inferSelect
export type ArtistRow = typeof artists.$inferSelect
export type ReleaseRow = typeof releases.$inferSelect
export type ServiceRow = typeof services.$inferSelect
export type AboutPhotoRow = typeof aboutPhotos.$inferSelect
export type BookingRow = typeof bookings.$inferSelect
export type BlackoutRow = typeof blackouts.$inferSelect
export type AdminUserRow = typeof adminUsers.$inferSelect

/* ==================================================================== *
 * STORE
 *
 * Merch, music and beats are one table, not three.
 *
 * They differ in a handful of columns and agree on everything that
 * matters: a title, a price, a picture, a description, a preview, and a
 * line in an order. Three tables would mean three editors, three cart
 * paths and three checkout branches that have to stay in step. One table
 * with a `kind` keeps the cart, the order and the money in a single code
 * path, and the kind-specific fields sit unused on the rows that do not
 * need them — which costs a few nullable columns and saves the bugs.
 * ==================================================================== */

export const PRODUCT_KINDS = ['merch', 'music', 'beat'] as const
export type ProductKind = (typeof PRODUCT_KINDS)[number]

/** What a store music item actually is. Mirrors RELEASE_TYPES plus mixtape. */
export const MUSIC_FORMATS = ['album', 'ep', 'mixtape', 'single'] as const
export type MusicFormat = (typeof MUSIC_FORMATS)[number]

/** A lease is non-exclusive and stays on sale; exclusive sells once. */
export const BEAT_LICENSES = ['lease', 'exclusive'] as const
export type BeatLicense = (typeof BEAT_LICENSES)[number]

export const PREVIEW_KINDS = ['none', 'audio', 'video'] as const
export type PreviewKind = (typeof PREVIEW_KINDS)[number]

/** A merch size or colour. Stock is text so "2 left" and "made to order" both work. */
export type Variant = { label: string; sku: string; stock: string }

export const products = pgTable(
  'products',
  {
    id: serial('id').primaryKey(),
    kind: text('kind').$type<ProductKind>().notNull(),
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    /** One quiet line under the title — "Heavyweight cotton", "Prod. by …". */
    subtitle: text('subtitle').notNull().default(''),
    /** Markdown. */
    description: text('description').notNull().default(''),

    /* Money is integer minor units. Never a float — 0.1 + 0.2 is not 0.3 and
       a catalogue priced in floats drifts by a penny a year. */
    priceCents: integer('price_cents').notNull().default(0),
    /** Optional "was" price. Null when the item is not reduced. */
    compareAtCents: integer('compare_at_cents'),

    imageId: integer('image_id').references(() => images.id, { onDelete: 'set null' }),

    /** A 30-second clip, a YouTube link, a lookbook video. Blank = no preview. */
    previewUrl: text('preview_url').notNull().default(''),
    previewKind: text('preview_kind').$type<PreviewKind>().notNull().default('none'),

    /* --- music only --- */
    /** Optional link to the catalogue, so a store item can point at a release. */
    releaseId: integer('release_id').references(() => releases.id, {
      onDelete: 'set null',
    }),
    musicFormat: text('music_format').$type<MusicFormat>(),

    /* --- beat only --- */
    licenseType: text('license_type').$type<BeatLicense>(),
    bpm: integer('bpm'),
    musicalKey: text('musical_key').notNull().default(''),

    /* --- merch only --- */
    variants: jsonb('variants').$type<Variant[]>().notNull().default([]),

    /** Null means unlimited. 0 means sold out. */
    stock: integer('stock'),

    /** Digital goods are delivered by link the moment an order is paid. */
    digital: boolean('digital').notNull().default(false),
    /** Revealed only on a paid order. Never rendered on a public page. */
    downloadUrl: text('download_url').notNull().default(''),

    featured: boolean('featured').notNull().default(false),
    status: text('status').$type<PublishStatus>().notNull().default('draft'),
    order: integer('order').notNull().default(0),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).notNull(),
  },
  (t) => [
    unique('products_slug_unique').on(t.slug),
    index('products_kind_idx').on(t.kind, t.status),
    index('products_order_idx').on(t.order),
  ],
)

/* ==================================================================== *
 * EVENTS
 * ==================================================================== */

export const events = pgTable(
  'events',
  {
    id: serial('id').primaryKey(),
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    /** Markdown. */
    description: text('description').notNull().default(''),
    imageId: integer('image_id').references(() => images.id, { onDelete: 'set null' }),

    venue: text('venue').notNull().default(''),
    addressLines: text('address_lines').notNull().default(''),
    /** ISO 'YYYY-MM-DD'. Sorted as text, which is safe for ISO. */
    date: text('date').notNull(),
    /** 24h 'HH:MM'. */
    startTime: text('start_time').notNull().default(''),
    doorsTime: text('doors_time').notNull().default(''),

    priceCents: integer('price_cents').notNull().default(0),
    /** Null = no cap. Tickets left is capacity minus sold. */
    capacity: integer('capacity'),
    ticketsSold: integer('tickets_sold').notNull().default(0),

    /** Set this and the page links out instead of selling here. */
    externalUrl: text('external_url').notNull().default(''),

    status: text('status').$type<PublishStatus>().notNull().default('draft'),
    order: integer('order').notNull().default(0),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).notNull(),
  },
  (t) => [unique('events_slug_unique').on(t.slug), index('events_date_idx').on(t.date)],
)

/* ==================================================================== *
 * ORDERS
 * ==================================================================== */

export const ORDER_STATUSES = [
  'pending',
  'paid',
  'fulfilled',
  'cancelled',
  'refunded',
] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]

export const ORDER_ITEM_KINDS = ['merch', 'music', 'beat', 'ticket'] as const
export type OrderItemKind = (typeof ORDER_ITEM_KINDS)[number]

export const orders = pgTable(
  'orders',
  {
    id: serial('id').primaryKey(),
    /** Human-quotable, e.g. MLPHL-4K2Q7. What the customer reads out on email. */
    reference: text('reference').notNull(),

    email: text('email').notNull(),
    name: text('name').notNull(),
    phone: text('phone').notNull().default(''),
    /** Only asked for when the basket contains something physical. */
    shippingLines: text('shipping_lines').notNull().default(''),

    subtotalCents: integer('subtotal_cents').notNull().default(0),
    shippingCents: integer('shipping_cents').notNull().default(0),
    totalCents: integer('total_cents').notNull().default(0),
    currency: text('currency').notNull().default('GBP'),

    status: text('status').$type<OrderStatus>().notNull().default('pending'),

    /** 'stripe' once a session exists, 'none' while Stripe is unconfigured. */
    paymentProvider: text('payment_provider').notNull().default('none'),
    stripeSessionId: text('stripe_session_id').notNull().default(''),
    paidAt: timestamp('paid_at', { mode: 'date' }),

    /**
     * Same contract as a booking: the order is committed before the email is
     * attempted, and a failure is recorded here rather than thrown. Nobody is
     * ever told "sent" when nothing was sent.
     */
    notified: boolean('notified').notNull().default(false),
    notifyError: text('notify_error').notNull().default(''),

    adminNote: text('admin_note').notNull().default(''),
    ip: text('ip').notNull().default(''),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).notNull(),
  },
  (t) => [
    unique('orders_reference_unique').on(t.reference),
    index('orders_status_idx').on(t.status),
    index('orders_created_idx').on(t.createdAt),
  ],
)

/**
 * Titles and prices are SNAPSHOTS, not joins.
 *
 * A price change or a deleted product must never rewrite what somebody was
 * charged last month. The product/event references are kept for convenience
 * and are allowed to go null; the snapshot is what the order actually is.
 */
export const orderItems = pgTable(
  'order_items',
  {
    id: serial('id').primaryKey(),
    orderId: integer('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<OrderItemKind>().notNull(),
    productId: integer('product_id').references(() => products.id, {
      onDelete: 'set null',
    }),
    eventId: integer('event_id').references(() => events.id, { onDelete: 'set null' }),

    titleSnapshot: text('title_snapshot').notNull(),
    variantLabel: text('variant_label').notNull().default(''),
    unitPriceCents: integer('unit_price_cents').notNull(),
    quantity: integer('quantity').notNull().default(1),
  },
  (t) => [index('order_items_order_idx').on(t.orderId)],
)

/* ==================================================================== *
 * Page copy for the two new sections — singletons, id = 1
 * ==================================================================== */

export const storePage = pgTable('store_page', {
  id: integer('id').primaryKey().default(1),
  heading: text('heading').notNull().default('Store'),
  intro: text('intro').notNull().default(''),
  merchHeading: text('merch_heading').notNull().default('Merch'),
  merchIntro: text('merch_intro').notNull().default(''),
  musicHeading: text('music_heading').notNull().default('Music'),
  musicIntro: text('music_intro').notNull().default(''),
  beatsHeading: text('beats_heading').notNull().default('Beats'),
  beatsIntro: text('beats_intro').notNull().default(''),
  emptyMessage: text('empty_message').notNull().default(''),
  /** ISO 4217, and the symbol shown next to a price. */
  currency: text('currency').notNull().default('GBP'),
  currencySymbol: text('currency_symbol').notNull().default('£'),
  /** Flat shipping on any order containing something physical. */
  shippingCents: integer('shipping_cents').notNull().default(0),
  shippingNote: text('shipping_note').notNull().default(''),
  checkoutNote: text('checkout_note').notNull().default(''),
  successMessage: text('success_message').notNull().default(''),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull(),
})

export const eventsPage = pgTable('events_page', {
  id: integer('id').primaryKey().default(1),
  heading: text('heading').notNull().default('Events'),
  intro: text('intro').notNull().default(''),
  emptyMessage: text('empty_message').notNull().default(''),
  pastHeading: text('past_heading').notNull().default('Previously'),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull(),
})

/* ------------------------------ relations ------------------------------ */

export const productsRelations = relations(products, ({ one }) => ({
  image: one(images, { fields: [products.imageId], references: [images.id] }),
  release: one(releases, { fields: [products.releaseId], references: [releases.id] }),
}))

export const eventsRelations = relations(events, ({ one }) => ({
  image: one(images, { fields: [events.imageId], references: [images.id] }),
}))

export const ordersRelations = relations(orders, ({ many }) => ({
  items: many(orderItems),
}))

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  product: one(products, { fields: [orderItems.productId], references: [products.id] }),
  event: one(events, { fields: [orderItems.eventId], references: [events.id] }),
}))

/* -------------------------------- types -------------------------------- */

export type ProductRow = typeof products.$inferSelect
export type EventRow = typeof events.$inferSelect
export type OrderRow = typeof orders.$inferSelect
export type OrderItemRow = typeof orderItems.$inferSelect
export type StorePageRow = typeof storePage.$inferSelect
export type EventsPageRow = typeof eventsPage.$inferSelect
