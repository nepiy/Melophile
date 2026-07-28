import { and, asc, desc, eq } from 'drizzle-orm'
import { unstable_cache } from 'next/cache'
import {
  db,
  events,
  eventsPage,
  images,
  products,
  storePage,
  type EventRow,
  type EventsPageRow,
  type ImageRow,
  type ProductKind,
  type ProductRow,
  type StorePageRow,
} from '@/db'

/* ==========================================================================
   Public reads for the store and the events page.

   Same contract as src/lib/data.ts: cached, tagged, published-only. The admin
   reads its own uncached copies from src/lib/admin-queries.ts.
   ========================================================================== */

export const STORE_TAGS = {
  products: 'products',
  events: 'events',
  storePage: 'store-page',
  eventsPage: 'events-page',
} as const

export type StoreTag = (typeof STORE_TAGS)[keyof typeof STORE_TAGS]

export type ProductFull = ProductRow & { image: ImageRow | null }
export type EventFull = EventRow & {
  image: ImageRow | null
  /** null capacity means uncapped, so this is null too. */
  ticketsLeft: number | null
  soldOut: boolean
}

const now = () => new Date(0)

const FALLBACK_STORE: StorePageRow = {
  id: 1,
  heading: 'Store',
  intro: '',
  merchHeading: 'Merch',
  merchIntro: '',
  musicHeading: 'Music',
  musicIntro: '',
  beatsHeading: 'Beats',
  beatsIntro: '',
  emptyMessage: '',
  currency: 'GBP',
  currencySymbol: '£',
  shippingCents: 0,
  shippingNote: '',
  checkoutNote: '',
  successMessage: '',
  updatedAt: now(),
}

const FALLBACK_EVENTS_PAGE: EventsPageRow = {
  id: 1,
  heading: 'Events',
  intro: '',
  emptyMessage: '',
  pastHeading: 'Previously',
  updatedAt: now(),
}

/* -------------------------------- store -------------------------------- */

export const getStorePage = unstable_cache(
  async (): Promise<StorePageRow> =>
    (await db.select().from(storePage).where(eq(storePage.id, 1)).get()) ??
    FALLBACK_STORE,
  ['store-page'],
  { tags: [STORE_TAGS.storePage] },
)

export const getProducts = unstable_cache(
  async (): Promise<ProductFull[]> => {
    const rows = await db.query.products.findMany({
      where: eq(products.status, 'published'),
      orderBy: [asc(products.order), asc(products.id)],
      with: { image: true },
    })
    return rows.map((r) => ({ ...r, image: r.image ?? null }))
  },
  ['products'],
  { tags: [STORE_TAGS.products] },
)

export const getProductsByKind = unstable_cache(
  async (kind: ProductKind): Promise<ProductFull[]> => {
    const rows = await db.query.products.findMany({
      where: and(eq(products.status, 'published'), eq(products.kind, kind)),
      orderBy: [asc(products.order), asc(products.id)],
      with: { image: true },
    })
    return rows.map((r) => ({ ...r, image: r.image ?? null }))
  },
  ['products-by-kind'],
  { tags: [STORE_TAGS.products] },
)

export const getProductBySlug = unstable_cache(
  async (slug: string): Promise<ProductFull | null> => {
    const row = await db.query.products.findFirst({
      where: and(eq(products.slug, slug), eq(products.status, 'published')),
      with: { image: true },
    })
    return row ? { ...row, image: row.image ?? null } : null
  },
  ['product-by-slug'],
  { tags: [STORE_TAGS.products] },
)

/** How many published items sit in each section, for the store landing page. */
export const getStoreCounts = unstable_cache(
  async (): Promise<Record<ProductKind, number>> => {
    const rows = await db
      .select({ kind: products.kind })
      .from(products)
      .where(eq(products.status, 'published'))
      .all()
    const counts = { merch: 0, music: 0, beat: 0 }
    for (const row of rows) counts[row.kind] += 1
    return counts
  },
  ['store-counts'],
  { tags: [STORE_TAGS.products] },
)

/* -------------------------------- events ------------------------------- */

export const getEventsPage = unstable_cache(
  async (): Promise<EventsPageRow> =>
    (await db.select().from(eventsPage).where(eq(eventsPage.id, 1)).get()) ??
    FALLBACK_EVENTS_PAGE,
  ['events-page'],
  { tags: [STORE_TAGS.eventsPage] },
)

function decorate(row: EventRow & { image?: ImageRow | null }): EventFull {
  const left =
    row.capacity === null ? null : Math.max(0, row.capacity - (row.ticketsSold ?? 0))
  return {
    ...row,
    image: row.image ?? null,
    ticketsLeft: left,
    soldOut: left !== null && left <= 0,
  }
}

/** Soonest first. Past events are included; the page splits them. */
export const getEvents = unstable_cache(
  async (): Promise<EventFull[]> => {
    const rows = await db.query.events.findMany({
      where: eq(events.status, 'published'),
      orderBy: [asc(events.date), asc(events.startTime)],
      with: { image: true },
    })
    return rows.map(decorate)
  },
  ['events'],
  { tags: [STORE_TAGS.events] },
)

export const getEventBySlug = unstable_cache(
  async (slug: string): Promise<EventFull | null> => {
    const row = await db.query.events.findFirst({
      where: and(eq(events.slug, slug), eq(events.status, 'published')),
      with: { image: true },
    })
    return row ? decorate(row) : null
  },
  ['event-by-slug'],
  { tags: [STORE_TAGS.events] },
)

/** The soonest upcoming event, for a teaser on the home page. */
export const getNextEvent = unstable_cache(
  async (todayIsoDate: string): Promise<EventFull | null> => {
    const rows = await db.query.events.findMany({
      where: eq(events.status, 'published'),
      orderBy: [asc(events.date)],
      with: { image: true },
    })
    const upcoming = rows.find((r) => r.date >= todayIsoDate)
    return upcoming ? decorate(upcoming) : null
  },
  ['next-event'],
  { tags: [STORE_TAGS.events] },
)

/* ------------------------------ image lookup ---------------------------- */

export async function imageById(id: number | null): Promise<ImageRow | null> {
  if (id === null) return null
  return (await db.select().from(images).where(eq(images.id, id)).get()) ?? null
}

/** Newest first — used by the admin order list's product column. */
export const getFeaturedProducts = unstable_cache(
  async (limit = 3): Promise<ProductFull[]> => {
    const rows = await db.query.products.findMany({
      where: and(eq(products.status, 'published'), eq(products.featured, true)),
      orderBy: [desc(products.updatedAt)],
      limit,
      with: { image: true },
    })
    return rows.map((r) => ({ ...r, image: r.image ?? null }))
  },
  ['featured-products'],
  { tags: [STORE_TAGS.products] },
)
