'use server'

import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { db, events, eventsPage, products, type PublishStatus } from '@/db'
import { reorderEvent, slugTakenByOtherEvent } from '@/lib/admin-events-queries'
import { applyImageField, cleanupImage } from '@/lib/admin-images'
import { parseMoney, slugify } from '@/lib/format'
import { safeUrl } from '@/lib/markdown'
import { revalidateContent } from '@/lib/revalidate'
import { requireAdmin } from '@/lib/session'
import { STORE_TAGS } from '@/lib/store-data'
import { eventSchema, toFieldErrors, type FieldErrors } from '@/lib/validation'

/* ==========================================================================
   Events — create, update, delete, publish, reorder, and the page copy.

   Same contract as src/lib/actions/store.ts. Every action starts with
   requireAdmin(). Every one that writes ends with revalidateContent(), which is
   what puts a save on /events without a redeploy. Nothing here throws at the
   client: a taken slug, a price that is not a price, a row deleted in another
   tab — all of it comes back as state the form renders inline.

   MONEY. events.priceCents is integer minor units — pence. The editor shows and
   accepts pounds, so pounds become pence at exactly one point on the way in
   (parseMoney) and pence become pounds at one point on the way out (formatMoney,
   in the page). Nothing in between ever holds a decimal, which is what keeps a
   save-then-reload from multiplying a ticket price by a hundred.

   TICKETS SOLD IS EDITABLE, AND THAT IS DELIBERATE. Checkout maintains it, so
   the field is normally left alone — but tickets sold on the door are real and
   have to be enterable somewhere. It is validated as a count and nothing more:
   a number above the capacity is allowed through and flagged in the editor
   rather than refused, because refusing it would leave the client with no way
   to record what actually happened in the room.
   ========================================================================== */

export type EventState = {
  error?: string
  fieldErrors?: FieldErrors
  saved?: boolean
}

export type EventsSettingsState = {
  error?: string
  fieldErrors?: FieldErrors
  saved?: boolean
}

/* --------------------------------- money --------------------------------- */

const PRICE_HELP = 'Enter a price like 18.00.'

type MoneyOk = { ok: true; cents: number }
type MoneyBad = { ok: false; error: string }

/**
 * Pounds in, pence out. parseMoney('18.00') is 1800 and parseMoney('nonsense')
 * is null — the null is the whole point of this wrapper, because a price that
 * silently becomes 0 is worse than a price the client is asked to retype.
 */
function readMoney(raw: string): MoneyOk | MoneyBad {
  // Blank is free rather than an error: a launch party with no ticket price is
  // a real event, and 0 is what the storefront already renders for one.
  if (raw.trim() === '') return { ok: true, cents: 0 }

  const cents = parseMoney(raw)
  if (cents === null) return { ok: false, error: PRICE_HELP }
  if (cents < 0) return { ok: false, error: `A price cannot be negative. ${PRICE_HELP}` }
  return { ok: true, cents }
}

/* -------------------------------- counters ------------------------------- */

type CountOk = { ok: true; value: number | null }

function readWholeNumber(
  raw: string,
  message: string,
  max: number,
): CountOk | { ok: false; error: string } {
  const text = raw.trim()
  if (text === '') return { ok: true, value: null }

  const value = Number(text)
  if (!Number.isInteger(value) || value < 0 || value > max) {
    return { ok: false, error: message }
  }
  return { ok: true, value }
}

/* --------------------------------- times --------------------------------- */

const TIME_HELP = 'Use a 24-hour time, like 19:30.'

function readTime(
  raw: string,
): { ok: true; value: string } | { ok: false; error: string } {
  const text = raw.trim()
  if (text === '') return { ok: true, value: '' }

  if (!/^\d{2}:\d{2}$/.test(text)) return { ok: false, error: TIME_HELP }

  const hours = Number(text.slice(0, 2))
  const minutes = Number(text.slice(3, 5))
  if (hours > 23 || minutes > 59) {
    return { ok: false, error: `That is not a time on the clock. ${TIME_HELP}` }
  }
  return { ok: true, value: text }
}

/* --------------------------------- images -------------------------------- */

/**
 * cleanupImage() checks the release, artist and About tables before it removes a
 * file — it predates both the store and events and knows nothing about either.
 * events.imageId and products.imageId are both ON DELETE SET NULL, so deleting
 * a picture an event shares with a product would blank the other one. Both
 * checks happen here first, and cleanupImage() only ever sees an image that
 * nothing anywhere still uses.
 *
 * Call it AFTER the row has been written, never before: an image removed first
 * leaves the row pointing at a file that is already gone.
 */
async function releaseEventImage(imageId: number | null): Promise<void> {
  if (imageId === null) return

  const [byEvent, byProduct] = await Promise.all([
    db.select({ id: events.id }).from(events).where(eq(events.imageId, imageId)).all(),
    db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.imageId, imageId))
      .all(),
  ])

  if (byEvent.length > 0 || byProduct.length > 0) return
  await cleanupImage(imageId)
}

/* ---------------------------------- save --------------------------------- */

/** Creates when the hidden `id` is empty, updates when it is not. */
export async function saveEvent(
  _previous: EventState,
  formData: FormData,
): Promise<EventState> {
  await requireAdmin()

  const rawId = String(formData.get('id') ?? '').trim()
  const id = rawId === '' ? null : Number(rawId)
  if (id !== null && !Number.isInteger(id)) {
    return {
      error: 'That event could not be identified. Go back to the list and open it again.',
    }
  }

  let currentImageId: number | null = null
  if (id !== null) {
    const row = await db
      .select({ imageId: events.imageId })
      .from(events)
      .where(eq(events.id, id))
      .get()

    if (!row) {
      return {
        error: 'That event is no longer here. It may have been deleted in another tab.',
      }
    }
    currentImageId = row.imageId
  }

  const parsed = eventSchema.safeParse({
    title: String(formData.get('title') ?? ''),
    description: String(formData.get('description') ?? ''),
    venue: String(formData.get('venue') ?? ''),
    date: String(formData.get('date') ?? ''),
    status: String(formData.get('status') ?? 'draft'),
  })

  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }
  const values = parsed.data

  // Normalised rather than rejected: the client types words, the page needs a
  // web address, and slugify() is the same function the public links use.
  const slug = slugify(String(formData.get('slug') ?? '')) || slugify(values.title)
  if (!slug) {
    return {
      fieldErrors: {
        slug: 'Give this event a web address — a few words in letters and numbers, like summer-showcase.',
      },
    }
  }

  if (await slugTakenByOtherEvent(slug, id)) {
    return {
      fieldErrors: {
        slug: 'Another event already uses that web address. Change it slightly.',
      },
    }
  }

  const start = readTime(String(formData.get('startTime') ?? ''))
  if (!start.ok) return { fieldErrors: { startTime: start.error } }

  const doors = readTime(String(formData.get('doorsTime') ?? ''))
  if (!doors.ok) return { fieldErrors: { doorsTime: doors.error } }

  // Doors after the first note is not a running order, it is a typo. Both blank
  // is fine, and either one alone is fine.
  if (start.value && doors.value && doors.value > start.value) {
    return {
      fieldErrors: {
        doorsTime:
          'Doors open before the music starts. Set doors earlier, or leave it blank.',
      },
    }
  }

  const price = readMoney(String(formData.get('priceCents') ?? ''))
  if (!price.ok) return { fieldErrors: { priceCents: price.error } }

  const capacity = readWholeNumber(
    String(formData.get('capacity') ?? ''),
    'Enter a whole number of tickets, or leave it blank for no cap.',
    1_000_000,
  )
  if (!capacity.ok) return { fieldErrors: { capacity: capacity.error } }

  const sold = readWholeNumber(
    String(formData.get('ticketsSold') ?? ''),
    'Enter a whole number of tickets sold, or leave it blank for none.',
    1_000_000,
  )
  if (!sold.ok) return { fieldErrors: { ticketsSold: sold.error } }

  let externalUrl = ''
  const rawExternal = String(formData.get('externalUrl') ?? '').trim()
  if (rawExternal) {
    const safe = safeUrl(rawExternal)
    if (!safe) {
      return {
        fieldErrors: {
          externalUrl:
            'That is not a link the site can open. Paste a full http:// or https:// address.',
        },
      }
    }
    externalUrl = safe
  }

  const addressLines = String(formData.get('addressLines') ?? '').slice(0, 400)

  /* -------------------------------- image -------------------------------- */

  // Last, because it writes a file: everything that can be rejected has been
  // rejected by now, so a failed save never leaves an upload behind.
  const image = await applyImageField(formData, 'image', currentImageId)
  if (!image.ok) return { error: image.error }

  const now = new Date()
  const row = {
    slug,
    title: values.title,
    description: values.description,
    imageId: image.imageId,
    venue: values.venue,
    addressLines,
    date: values.date,
    startTime: start.value,
    doorsTime: doors.value,
    priceCents: price.cents,
    capacity: capacity.value,
    ticketsSold: sold.value ?? 0,
    externalUrl,
    status: values.status,
    updatedAt: now,
  }

  if (id === null) {
    // order stays at 0. The list sorts by date and start time, so a new event
    // lands where its date puts it; `order` only separates two events sharing
    // a slot, and the arrows are what set it.
    const inserted = await db
      .insert(events)
      .values({ ...row, order: 0, createdAt: now })
      .returning({ id: events.id })
      .get()

    if (!inserted) {
      if (image.changed) await cleanupImage(image.imageId)
      return { error: 'Could not save that event. Try again.' }
    }

    revalidateContent(STORE_TAGS.events)
    redirect(`/admin/events/${inserted.id}`)
  }

  await db.update(events).set(row).where(eq(events.id, id))

  // Only after the row points at the new picture.
  if (image.changed && currentImageId !== null && currentImageId !== image.imageId) {
    await releaseEventImage(currentImageId)
  }

  revalidateContent(STORE_TAGS.events)
  return { saved: true }
}

/* ------------------------------ row actions ------------------------------ */

/**
 * Bound with the id: deleteEvent.bind(null, id).
 *
 * Past orders are safe. order_items snapshots the title and the price it
 * charged and holds the event reference ON DELETE SET NULL, so removing a date
 * cannot rewrite what somebody was charged for a ticket to it.
 */
export async function deleteEvent(id: number): Promise<void> {
  await requireAdmin()

  if (!Number.isInteger(id)) redirect('/admin/events')

  const row = await db
    .select({ imageId: events.imageId })
    .from(events)
    .where(eq(events.id, id))
    .get()

  if (!row) redirect('/admin/events')

  await db.delete(events).where(eq(events.id, id))
  await releaseEventImage(row.imageId)

  revalidateContent(STORE_TAGS.events)
  redirect('/admin/events')
}

/** Inline publish / unpublish from the list. Bound with the id and the target. */
export async function setEventStatus(id: number, status: PublishStatus): Promise<void> {
  await requireAdmin()

  if (!Number.isInteger(id)) return

  await db.update(events).set({ status, updatedAt: new Date() }).where(eq(events.id, id))

  revalidateContent(STORE_TAGS.events)
}

/** The order arrows. Bound with the id and the direction. */
export async function moveEvent(id: number, direction: 'up' | 'down'): Promise<void> {
  await requireAdmin()

  if (!Number.isInteger(id)) return

  await reorderEvent(id, direction)
  revalidateContent(STORE_TAGS.events)
}

/* ----------------------------- events page ------------------------------- */

/**
 * The events page copy has its own schema, here rather than in
 * src/lib/validation.ts: nothing outside this file validates it, and the
 * browser has no second copy of these rules to keep in step.
 *
 * The two headings refuse blank. A blank intro or empty-message is a designed
 * state — the page renders no paragraph at all — but a blank heading is a
 * section with no name on it.
 */
const eventsSettingsSchema = z.object({
  heading: z
    .string()
    .trim()
    .min(1, 'The events page needs a heading.')
    .max(120, 'Keep the heading under 120 characters.'),
  intro: z.string().max(2000, 'That intro is over 2000 characters. Trim it.'),
  emptyMessage: z.string().max(600, 'That message is over 600 characters.'),
  pastHeading: z
    .string()
    .trim()
    .min(1, 'The past-events section needs a heading.')
    .max(80, 'Keep a heading under 80 characters.'),
})

/**
 * The events_page singleton, id 1. A database that has been migrated but never
 * seeded has no row at all, so saving inserts it rather than failing — the
 * admin is usable on a fresh install and the client never meets a screen that
 * cannot be saved.
 */
export async function saveEventsSettings(
  _previous: EventsSettingsState,
  formData: FormData,
): Promise<EventsSettingsState> {
  await requireAdmin()

  const parsed = eventsSettingsSchema.safeParse({
    heading: String(formData.get('heading') ?? ''),
    intro: String(formData.get('intro') ?? ''),
    emptyMessage: String(formData.get('emptyMessage') ?? ''),
    pastHeading: String(formData.get('pastHeading') ?? ''),
  })

  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

  const row = { ...parsed.data, updatedAt: new Date() }

  const existing = await db
    .select({ id: eventsPage.id })
    .from(eventsPage)
    .where(eq(eventsPage.id, 1))
    .get()

  if (existing) await db.update(eventsPage).set(row).where(eq(eventsPage.id, 1))
  else await db.insert(eventsPage).values({ id: 1, ...row })

  revalidateContent(STORE_TAGS.eventsPage)
  return { saved: true }
}
