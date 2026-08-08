import { chmod, mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { formatDateLong, formatMoney, formatTime, sessionTypeLabel } from './format'
import type { BookingRow, OrderItemRow, OrderRow } from '@/db'

/* ==========================================================================
   Booking notifications.

   The contract, and the reason this file exists rather than an inline fetch:
   the booking row is committed BEFORE this is called, and a failure here is
   recorded on the row rather than thrown. Nobody is ever told "sent" when
   nothing was sent, and no booking is ever lost because an API key expired.

   With no RESEND_API_KEY set, notifications are written to data/outbox/ as
   .txt files. That is a working default, not a stub: the client can read them,
   and the admin flags the booking as "not notified" either way.
   ========================================================================== */

export type NotifyResult = { ok: true } | { ok: false; error: string }

async function secureOutbox(): Promise<string> {
  const dir = resolve(process.cwd(), 'data', 'outbox')
  await mkdir(dir, { recursive: true, mode: 0o700 })
  // mkdir does not tighten an existing directory. Notification files contain
  // names, addresses and order/booking detail, so make the owner boundary
  // explicit on every write rather than depending on the process umask.
  await chmod(dir, 0o700)
  return dir
}

async function writePrivateText(file: string, content: string): Promise<void> {
  await writeFile(file, content, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
}

function bookingSubject(b: BookingRow): string {
  return `Studio request — ${b.name}, ${formatDateLong(b.date)} ${formatTime(b.time)}`
}

function bookingBody(b: BookingRow): string {
  const lines = [
    `New studio request #${b.id}`,
    '',
    `Name        ${b.name}`,
    `Email       ${b.email}`,
    b.phone ? `Phone       ${b.phone}` : null,
    '',
    `Date        ${formatDateLong(b.date)}`,
    `Time        ${formatTime(b.time)}`,
    `Session     ${sessionTypeLabel(b.sessionType)}`,
    `Length      ${b.durationHours} ${b.durationHours === 1 ? 'hour' : 'hours'}`,
    `People      ${b.people}`,
    b.referenceUrl ? `Reference   ${b.referenceUrl}` : null,
    '',
    'Notes',
    b.notes.trim() ? b.notes.trim() : '(none)',
    '',
    '---',
    `Received ${b.createdAt.toISOString()}`,
    'Reply from the admin at /admin/bookings, where you can mark this',
    'Confirmed, Declined or Done.',
  ]
  return lines.filter((l) => l !== null).join('\n')
}

async function writeToOutbox(
  b: BookingRow,
  subject: string,
  body: string,
): Promise<void> {
  const dir = await secureOutbox()
  const stamp = b.createdAt.toISOString().replace(/[:.]/g, '-')
  const file = join(dir, `booking-${String(b.id).padStart(4, '0')}-${stamp}.txt`)
  await writePrivateText(file, `Subject: ${subject}\n\n${body}\n`)
}

/* ------------------------------------------------------------------ *
 * One sender for every notification. Sends when configured, writes to
 * data/outbox/ when not, and never throws either way.
 * ------------------------------------------------------------------ */
async function sendOrOutbox(
  subject: string,
  body: string,
  opts: { replyTo?: string; filename: string },
): Promise<NotifyResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  const to = process.env.BOOKING_NOTIFY_TO?.trim()
  const from = process.env.BOOKING_NOTIFY_FROM?.trim()

  const outbox = async () => {
    const dir = await secureOutbox()
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    await writePrivateText(
      join(dir, `${opts.filename}-${stamp}.txt`),
      `Subject: ${subject}\n\n${body}\n`,
    )
  }

  if (!apiKey || !to || !from) {
    try {
      await outbox()
      return {
        ok: false,
        error:
          'No email is configured, so this was written to data/outbox/. Set RESEND_API_KEY, BOOKING_NOTIFY_TO and BOOKING_NOTIFY_FROM to send it by email.',
      }
    } catch (err) {
      return { ok: false, error: `Could not write to the outbox: ${describe(err)}` }
    }
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [to],
        ...(opts.replyTo ? { reply_to: opts.replyTo } : {}),
        subject,
        text: body,
      }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      await outbox().catch(() => {})
      return {
        ok: false,
        error:
          `Email provider returned ${response.status}. ${detail.slice(0, 200)}`.trim(),
      }
    }
    return { ok: true }
  } catch (err) {
    await outbox().catch(() => {})
    return { ok: false, error: describe(err) }
  }
}

export async function notifyBooking(booking: BookingRow): Promise<NotifyResult> {
  const subject = bookingSubject(booking)
  const body = bookingBody(booking)

  const apiKey = process.env.RESEND_API_KEY?.trim()
  const to = process.env.BOOKING_NOTIFY_TO?.trim()
  const from = process.env.BOOKING_NOTIFY_FROM?.trim()

  if (!apiKey || !to || !from) {
    try {
      await writeToOutbox(booking, subject, body)
      return {
        ok: false,
        error:
          'No email is configured, so this was written to data/outbox/. Set RESEND_API_KEY, BOOKING_NOTIFY_TO and BOOKING_NOTIFY_FROM to send it by email.',
      }
    } catch (err) {
      return { ok: false, error: `Could not write to the outbox: ${describe(err)}` }
    }
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        reply_to: booking.email,
        subject,
        text: body,
      }),
      signal: AbortSignal.timeout(10_000),
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      await writeToOutbox(booking, subject, body).catch(() => {})
      return {
        ok: false,
        error:
          `Email provider returned ${response.status}. ${detail.slice(0, 200)}`.trim(),
      }
    }

    return { ok: true }
  } catch (err) {
    // Keep a copy on disk so a network failure never loses the notification.
    await writeToOutbox(booking, subject, body).catch(() => {})
    return { ok: false, error: describe(err) }
  }
}

function describe(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

/* ==========================================================================
   Order notifications. Same contract as bookings: the order is already in the
   database before this runs, and a failure is returned rather than thrown.
   ========================================================================== */

export async function notifyOrder(
  order: OrderRow,
  items: OrderItemRow[],
): Promise<NotifyResult> {
  const symbol = order.currency === 'GBP' ? '£' : ''
  const subject = `Order ${order.reference} — ${order.name}`

  const lines = [
    `New order ${order.reference}`,
    '',
    `Name        ${order.name}`,
    `Email       ${order.email}`,
    order.phone ? `Phone       ${order.phone}` : null,
    '',
    'Items',
    ...items.map(
      (i) =>
        `  ${i.quantity} × ${i.titleSnapshot}${i.variantLabel ? ` (${i.variantLabel})` : ''}` +
        `  ${formatMoney(i.unitPriceCents * i.quantity, symbol)}`,
    ),
    '',
    `Subtotal    ${formatMoney(order.subtotalCents, symbol)}`,
    order.shippingCents > 0
      ? `Shipping    ${formatMoney(order.shippingCents, symbol)}`
      : null,
    `Total       ${formatMoney(order.totalCents, symbol)}`,
    '',
    order.shippingLines
      ? `Deliver to\n${order.shippingLines}`
      : 'Nothing to post — all digital.',
    '',
    '---',
    `Status ${order.status}. Received ${order.createdAt.toISOString()}`,
    'Manage it at /admin/orders.',
  ]

  return sendOrOutbox(subject, lines.filter((l) => l !== null).join('\n'), {
    replyTo: order.email,
    filename: `order-${order.reference}`,
  })
}
