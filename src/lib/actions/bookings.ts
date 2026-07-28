'use server'

import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { blackouts, bookings, db, BOOKING_STATUSES, type BookingStatus } from '@/db'
import { TAGS } from '@/lib/data'
import { todayIso } from '@/lib/format'
import { revalidateContent } from '@/lib/revalidate'
import { requireAdmin } from '@/lib/session'
import { blackoutSchema, toFieldErrors, type FieldErrors } from '@/lib/validation'

/* ==========================================================================
   The desk — booking requests and blackout dates.

   Same rules the release and page actions follow: requireAdmin() first,
   validate before writing, never throw at the client. A rejected save comes
   back as state the form renders next to the field that caused it.

   REVALIDATION IS DELIBERATELY DIFFERENT IN THE TWO HALVES OF THIS FILE
   --------------------------------------------------------------------
   A booking appears nowhere on the public site, so a status change or a note
   has no public page to drop — those actions call revalidatePath on the admin
   routes only. Dropping the public content tags for them would throw away the
   whole cached site to redraw one admin row.

   A blackout does the opposite: it is read by the booking form on /contact, in
   the browser and again on the server. Those actions call
   revalidateContent(TAGS.blackouts), which is what stops the public form
   offering a day the client has just closed.
   ========================================================================== */

export type NoteState = {
  error?: string
  saved?: boolean
}

export type BlackoutState = {
  error?: string
  fieldErrors?: FieldErrors
  saved?: boolean
}

const GONE = 'That request is no longer here. It may have been deleted in another tab.'

/** Longest internal note kept. Generous — it is a note, not a document. */
const MAX_NOTE = 4000

/**
 * The three admin screens a booking is drawn on. The layout goes too: the
 * shell's "new" badge and the dashboard's counts are rendered above the page,
 * and a badge that lags a status change is worse than no badge at all.
 */
function refreshBookingScreens(id?: number): void {
  revalidatePath('/admin/bookings')
  if (id !== undefined) revalidatePath(`/admin/bookings/${id}`)
  revalidatePath('/admin', 'layout')
}

function refreshBlackoutScreens(): void {
  revalidatePath('/admin/blackouts')
  revalidatePath('/admin')
  revalidateContent(TAGS.blackouts)
}

/* ------------------------------ status ---------------------------------- */

const STATUSES: ReadonlySet<string> = new Set<string>(BOOKING_STATUSES)

/**
 * Inline status change, from a row on the list or from the detail page. Bound
 * with both arguments: setBookingStatus.bind(null, id, 'confirmed').
 *
 * The status is checked against BOOKING_STATUSES rather than trusted. These
 * actions are reachable as a POST by anything that can guess the id, and the
 * column is plain text in SQLite — an unchecked value would be written happily
 * and then render as a booking in no state at all.
 */
export async function setBookingStatus(id: number, status: string): Promise<void> {
  await requireAdmin()

  if (!Number.isInteger(id) || !STATUSES.has(status)) return

  await db
    .update(bookings)
    .set({ status: status as BookingStatus })
    .where(eq(bookings.id, id))

  refreshBookingScreens(id)
}

/* ------------------------------ admin note ------------------------------- */

/** The private note on one request. Nothing here is ever emailed or published. */
export async function saveAdminNote(
  _previous: NoteState,
  formData: FormData,
): Promise<NoteState> {
  await requireAdmin()

  const id = Number(String(formData.get('id') ?? '').trim())
  if (!Number.isInteger(id)) {
    return { error: 'That request could not be identified. Open it again from the list.' }
  }

  const row = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(eq(bookings.id, id))
    .get()

  if (!row) return { error: GONE }

  await db
    .update(bookings)
    .set({ adminNote: String(formData.get('adminNote') ?? '').slice(0, MAX_NOTE) })
    .where(eq(bookings.id, id))

  refreshBookingScreens(id)
  return { saved: true }
}

/* -------------------------------- delete -------------------------------- */

/** Bound with the id: deleteBooking.bind(null, id). */
export async function deleteBooking(id: number): Promise<void> {
  await requireAdmin()

  if (Number.isInteger(id)) {
    await db.delete(bookings).where(eq(bookings.id, id))
    refreshBookingScreens(id)
  }

  redirect('/admin/bookings')
}

/* ------------------------------- blackouts ------------------------------- */

/**
 * Blocks one day.
 *
 * `blackouts.date` is UNIQUE, so the existing row is looked up first. Letting
 * the constraint fire instead would surface as a 500 — the client would see the
 * error overlay for what is really a sentence: that day is already blocked.
 */
export async function addBlackout(
  _previous: BlackoutState,
  formData: FormData,
): Promise<BlackoutState> {
  await requireAdmin()

  const raw = String(formData.get('date') ?? '').trim()
  if (!raw) return { fieldErrors: { date: 'Pick the day to block out.' } }

  const parsed = blackoutSchema.safeParse({
    date: raw,
    reason: String(formData.get('reason') ?? ''),
  })

  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }
  const { date, reason } = parsed.data

  // The date input's `min` is a courtesy, not a gate: it is trivially bypassed
  // and absent entirely in a browser with no date picker.
  if (date < todayIso()) {
    return { fieldErrors: { date: 'That day has passed. Pick today or a day after it.' } }
  }

  const existing = await db
    .select({ id: blackouts.id })
    .from(blackouts)
    .where(eq(blackouts.date, date))
    .get()

  if (existing) return { fieldErrors: { date: 'That date is already blocked out.' } }

  await db.insert(blackouts).values({ date, reason })

  refreshBlackoutScreens()
  return { saved: true }
}

/** Bound with the id: removeBlackout.bind(null, id). */
export async function removeBlackout(id: number): Promise<void> {
  await requireAdmin()

  if (!Number.isInteger(id)) return

  await db.delete(blackouts).where(eq(blackouts.id, id))

  refreshBlackoutScreens()
}
