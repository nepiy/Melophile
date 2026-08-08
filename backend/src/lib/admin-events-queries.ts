import { and, asc, desc, eq } from 'drizzle-orm'
import {
  db,
  events,
  eventsPage,
  orders,
  type EventRow,
  type EventsPageRow,
  type ImageRow,
  type OrderItemRow,
  type OrderRow,
  type OrderStatus,
} from '@/db'
import { isPastDate } from '@/lib/format'

/* ==========================================================================
   Admin reads for events and orders.

   Same contract as src/lib/admin-queries.ts and src/lib/admin-store-queries.ts:

     store-data.ts  cached with unstable_cache and filtered to
                    status='published'. Right for /events, wrong for an editor —
                    the client would not see their own drafts, and a saved row
                    would stay stale for as long as the cache holds.

     this file      no cache, no status filter. Every page that reads it also
                    sets `export const dynamic = 'force-dynamic'`, so the admin
                    always shows what is in the database right now.

   Orders have no cached public copy at all. They are read here and nowhere
   else, which is the whole reason the order screens can be trusted: what the
   client is looking at is the row, not a render of it from some minutes ago.
   ========================================================================== */

export type AdminEvent = EventRow & { image: ImageRow | null }
export type AdminOrder = OrderRow & { items: OrderItemRow[] }

/* ================================== events ================================ */

/**
 * Every event, drafts included, soonest first.
 *
 * The sort is the public one — date, then start time — with `order` and then
 * the id behind it as deterministic tie-breaks. That matters: the admin list
 * and /events agree about the running order of any two dates, and `order` only
 * ever decides between two events at the same time on the same day, which is
 * the one case a date cannot answer on its own.
 */
export async function listEvents(): Promise<AdminEvent[]> {
  const rows = await db.query.events.findMany({
    orderBy: [asc(events.date), asc(events.startTime), asc(events.order), asc(events.id)],
    with: { image: true },
  })

  return rows.map((row) => ({ ...row, image: row.image ?? null }))
}

export async function getEventForEdit(id: number): Promise<AdminEvent | null> {
  const row = await db.query.events.findFirst({
    where: eq(events.id, id),
    with: { image: true },
  })
  return row ? { ...row, image: row.image ?? null } : null
}

/**
 * True if another event already uses this slug.
 *
 * `events_slug_unique` is on the table, and hitting it raises a SQLite error
 * the client would meet as a 500. Asking first turns that into a sentence next
 * to the field.
 */
export async function slugTakenByOtherEvent(
  slug: string,
  exceptId: number | null,
): Promise<boolean> {
  const rows = await db
    .select({ id: events.id })
    .from(events)
    .where(eq(events.slug, slug))
    .all()

  return rows.some((row) => row.id !== exceptId)
}

export type EventCounts = {
  upcoming: number
  past: number
  draft: number
  total: number
}

/** Drives the counts in the page head. One pass, one query. */
export async function eventCounts(): Promise<EventCounts> {
  const rows = await db
    .select({ date: events.date, status: events.status })
    .from(events)
    .all()

  const counts: EventCounts = { upcoming: 0, past: 0, draft: 0, total: rows.length }

  for (const row of rows) {
    if (isPastDate(row.date)) counts.past += 1
    else counts.upcoming += 1
    if (row.status !== 'published') counts.draft += 1
  }

  return counts
}

/** The singleton. Null on a database that was migrated but never seeded. */
export async function getEventsPageForEdit(): Promise<EventsPageRow | null> {
  return (await db.select().from(eventsPage).where(eq(eventsPage.id, 1)).get()) ?? null
}

/**
 * Moves an event up or down among the events at the SAME time on the SAME day.
 *
 * Not across the whole list, and deliberately so: everywhere else the running
 * order is the date, which the client sets by typing a date rather than by
 * pressing an arrow. An arrow that appeared to reorder the month would either
 * do nothing on /events or quietly disagree with it. Two sets at 8pm on one
 * night are the case the date cannot separate, so that is the only case the
 * arrows are offered for — and there they decide something real.
 *
 * Sequential integers are rewritten across the slot first, because seeded rows
 * all share order 0, and swapping two identical numbers looks like the button
 * is broken.
 */
export async function reorderEvent(id: number, direction: 'up' | 'down'): Promise<void> {
  const target = await db
    .select({ date: events.date, startTime: events.startTime })
    .from(events)
    .where(eq(events.id, id))
    .get()

  if (!target) return

  const rows = await db
    .select({ id: events.id, order: events.order })
    .from(events)
    .where(and(eq(events.date, target.date), eq(events.startTime, target.startTime)))
    .orderBy(asc(events.order), asc(events.id))
    .all()

  const index = rows.findIndex((row) => row.id === id)
  if (index === -1) return

  const swapWith = direction === 'up' ? index - 1 : index + 1
  if (swapWith < 0 || swapWith >= rows.length) return

  const next = [...rows]
  const a = next[index]
  const b = next[swapWith]
  if (!a || !b) return
  next[index] = b
  next[swapWith] = a

  for (const [position, row] of next.entries()) {
    await db.update(events).set({ order: position }).where(eq(events.id, row.id))
  }
}

/* ================================== orders ================================ */

/**
 * Every order, newest first, with its lines.
 *
 * The lines come back with the order rather than being fetched per row on the
 * screen: the list prints an item count on every line, and a query per row is
 * how a list of forty orders becomes forty-one queries.
 */
export async function listOrders(status?: OrderStatus): Promise<AdminOrder[]> {
  const rows = await db.query.orders.findMany({
    where: status ? eq(orders.status, status) : undefined,
    orderBy: [desc(orders.createdAt), desc(orders.id)],
    with: { items: true },
  })

  return rows.map((row) => ({ ...row, items: row.items ?? [] }))
}

export async function getOrderForEdit(id: number): Promise<AdminOrder | null> {
  const row = await db.query.orders.findFirst({
    where: eq(orders.id, id),
    with: { items: true },
  })
  return row ? { ...row, items: row.items ?? [] } : null
}

export type OrderCounts = Record<OrderStatus | 'all', number>

/** Live numbers for the status tabs. One pass, one query. */
export async function orderCounts(): Promise<OrderCounts> {
  const rows = await db.select({ status: orders.status }).from(orders).all()

  const counts: OrderCounts = {
    all: rows.length,
    pending: 0,
    paid: 0,
    fulfilled: 0,
    cancelled: 0,
    refunded: 0,
  }

  for (const row of rows) {
    // A status the schema no longer lists cannot be counted into a column that
    // does not exist. Skipping it beats throwing on a list page.
    if (row.status in counts) counts[row.status] += 1
  }

  return counts
}
