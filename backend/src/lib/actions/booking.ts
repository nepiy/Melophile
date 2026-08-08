'use server'

import { eq } from 'drizzle-orm'
import { blackouts, bookings, db } from '@/db'
import { todayIso } from '@/lib/format'
import { notifyBooking, type NotifyResult } from '@/lib/mail'
import { checkBookingRate, clientIp } from '@/lib/ratelimit'
import { getCurrentUser } from '@/lib/supabase/server'
import { bookingSchema, toFieldErrors, type FieldErrors } from '@/lib/validation'

/* ==========================================================================
   The studio request.

   Order of operations is the whole design of this file:

     1. honeypot        — a filled trap never reaches the schema
     2. re-validate     — the browser's checks are a courtesy, not a gate
     3. rate limit      — only genuine submissions burn quota, so a person
                          fixing a typo is never locked out
     4. authority       — the date is re-checked against the blackouts table
                          and against today, on the server, every time
     5. INSERT          — the booking is committed here, and it is safe
     6. notify          — attempted after the commit, recorded on the row,
                          never thrown, never a reason to lose a booking

   Nobody is ever told their request was emailed. They are told it was
   received, which is the part we can actually guarantee.
   ========================================================================== */

export type BookingResult =
  | { ok: true; message: string }
  | { ok: false; fieldErrors?: FieldErrors; formError?: string }

/**
 * Must stay word-for-word identical to BLOCKED_DATE in
 * src/components/contact/BookingForm.tsx — the browser and the server reject
 * the same days, so they must say the same thing.
 */
const BLOCKED_DATE =
  "That date is blocked out. Pick another day, or send a note and we'll find a slot."

const PAST_DATE = 'That day has passed. Pick today or a day after it.'

const TRAP =
  'That request looked automated, so nothing was sent. Clear the Company field and send it again.'

const TOO_MANY =
  'You have sent several requests from this connection in the last hour, which is the limit. Give it an hour, or email us the detail instead.'

const NOT_SAVED =
  'The request could not be saved. Try again, or email us and we will take it from there.'

function text(value: FormDataEntryValue | null): string {
  return typeof value === 'string' ? value : ''
}

export async function submitBooking(formData: FormData): Promise<BookingResult> {
  // 1 — the honeypot. Handled before the schema so the trap's own message is
  // ours rather than a type error about a zero-length string. Named so that a
  // person whose autofill filled it in can actually recover.
  if (text(formData.get('company')).trim()) {
    return { ok: false, formError: TRAP }
  }

  // 2 — re-validate everything. Same schema the browser used.
  const parsed = bookingSchema.safeParse({
    name: text(formData.get('name')),
    email: text(formData.get('email')),
    phone: text(formData.get('phone')),
    date: text(formData.get('date')),
    time: text(formData.get('time')),
    sessionType: text(formData.get('sessionType')),
    durationHours: text(formData.get('durationHours')),
    people: text(formData.get('people')),
    notes: text(formData.get('notes')),
    referenceUrl: text(formData.get('referenceUrl')),
    company: '',
    elapsedMs: text(formData.get('elapsedMs')),
  })

  if (!parsed.success) {
    const fieldErrors = toFieldErrors(parsed.error)

    // The timing gate reports on `company`, which is visually hidden — so it
    // becomes a form-level message rather than a failure with nothing on screen.
    const hidden = fieldErrors.company
    delete fieldErrors.company

    if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors }
    return { ok: false, formError: hidden ?? NOT_SAVED }
  }

  const data = parsed.data

  // 3 — rate limit.
  const ip = await clientIp()
  if (!checkBookingRate(ip).allowed) {
    return { ok: false, formError: TOO_MANY }
  }

  // 4 — the two date facts the browser is not allowed to be the authority on.
  // Read straight from the table rather than through the cached page read: this
  // is a write path, and it needs the row as it is right now.
  if (data.date < todayIso()) {
    return { ok: false, fieldErrors: { date: PAST_DATE } }
  }

  const blocked = await db
    .select({ date: blackouts.date })
    .from(blackouts)
    .where(eq(blackouts.date, data.date))
    .get()

  if (blocked) {
    return { ok: false, fieldErrors: { date: BLOCKED_DATE } }
  }

  // 5 — commit. Everything after this point can fail without losing anything.
  const signedInUser = await getCurrentUser()
  let row
  try {
    row = await db
      .insert(bookings)
      .values({
        userId: signedInUser?.id ?? '',
        name: data.name,
        email: data.email,
        phone: data.phone,
        date: data.date,
        time: data.time,
        sessionType: data.sessionType,
        durationHours: data.durationHours,
        people: data.people,
        notes: data.notes,
        referenceUrl: data.referenceUrl,
        status: 'new',
        adminNote: '',
        notified: false,
        notifyError: '',
        ip,
        createdAt: new Date(),
      })
      .returning()
      .get()
  } catch {
    return { ok: false, formError: NOT_SAVED }
  }

  if (!row) return { ok: false, formError: NOT_SAVED }

  // 6 — notify, and record the outcome on the row. A failure here is a note in
  // the admin, not an error on the page: the request is already saved, and the
  // person is told it was received rather than that it was emailed.
  let notice: NotifyResult
  try {
    notice = await notifyBooking(row)
  } catch (err) {
    notice = { ok: false, error: err instanceof Error ? err.message : String(err) }
  }

  try {
    await db
      .update(bookings)
      .set(
        notice.ok
          ? { notified: true, notifyError: '' }
          : { notified: false, notifyError: notice.error.slice(0, 500) },
      )
      .where(eq(bookings.id, row.id))
  } catch {
    // The booking is committed either way. The admin shows it as un-notified,
    // which is the honest reading of this state.
  }

  return { ok: true, message: 'Request sent.' }
}
