'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { isUuid, readPaymentStatus } from '@/lib/admin-users-queries'
import { isValidIsoDate } from '@/lib/format'
import { readOrderStatus } from '@/lib/orders/store'
import { requireAdmin } from '@/lib/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { serviceRoleAvailable } from '@/lib/supabase/config'

/* ==========================================================================
   Customer orders, in Postgres.

   The same rules the rest of the admin follows: requireAdmin() first, validate
   before writing, never throw at the client for something they typed.

   REVALIDATION IS NARROW ON PURPOSE. A Postgres order appears nowhere on the
   public site — the customer reads it from /account, which is force-dynamic and
   has nothing cached to drop. So these call revalidatePath on the admin routes
   only. Dropping the public content tags for a status change would throw away
   the whole cached site to redraw one admin row.

   NOTHING HERE MOVES STOCK. The catalogue and its stock counts live in SQLite,
   and the restock rules belong to the SQLite order flow in
   src/lib/actions/orders.ts, where a status change is guarded on the status it
   read inside one transaction. Two databases cannot share that transaction, so
   this file does not pretend to: it changes what an order says about itself and
   nothing else, and the screen says so in a line above the buttons.

   NOTHING HERE EMAILS ANYONE either. `notified` records whether the
   confirmation went out at checkout; no button on these screens sends one.
   ========================================================================== */

const MAX_NOTE = 4000
const MAX_TRACKING = 200
const MAX_URL = 500

/** The screens an order is drawn on. The dashboard counts them, so it goes too. */
function refresh(orderId?: string): void {
  revalidatePath('/admin/customer-orders')
  if (orderId) revalidatePath(`/admin/customer-orders/${orderId}`)
  revalidatePath('/admin')
}

/** True when there is a database to write to and an id worth writing about. */
function writable(orderId: string): boolean {
  return serviceRoleAvailable() && isUuid(orderId)
}

/**
 * Back to the order, with one word for the status line.
 *
 * Post-then-redirect, because the tracking fields and the note look identical
 * before and after a save — without a line saying it landed, the client is left
 * guessing. The status buttons below do not do this: their own chip moving is
 * the feedback, and it is better than a sentence.
 */
function say(orderId: string, key: string, kind: 'done' | 'problem' = 'done'): never {
  redirect(`/admin/customer-orders/${orderId}?${kind}=${key}`)
}

/* ------------------------------ order status ------------------------------ */

/**
 * Bound with both arguments: setOrderStatus.bind(null, id, 'shipped').
 *
 * The status is checked against the seven the schema names rather than trusted.
 * These actions are reachable as a POST by anything that can guess an id, and
 * while the column is a Postgres enum that would reject a bad value, a rejected
 * write surfaces as a 500 rather than as nothing happening.
 */
export async function setOrderStatus(orderId: string, status: string): Promise<void> {
  await requireAdmin()

  const next = readOrderStatus(status)
  if (!next || !writable(orderId)) return

  try {
    const admin = createAdminClient()
    await admin
      .from('orders')
      // delivered_at is the date the client typed, not the moment they pressed
      // a button, so marking an order delivered does not overwrite it.
      .update({ order_status: next })
      .eq('id', orderId)
    refresh(orderId)
  } catch {
    /* the screen still shows the row as it is; nothing was half-written */
  }
}

/* ----------------------------- payment status ----------------------------- */

/**
 * The payment status, which is a different fact from the order status.
 *
 * An order can be paid and not yet shipped, or shipped and refunded. Keeping
 * the two controls apart is what lets the client say so; collapsing them into
 * one row of buttons would force a lie in both directions.
 *
 * The payments table is not touched: a row there is one ATTEMPT at paying, made
 * by a provider, and inventing one from an admin click would put a transaction
 * in the ledger that never happened.
 */
export async function setPaymentStatus(orderId: string, status: string): Promise<void> {
  await requireAdmin()

  const next = readPaymentStatus(status)
  if (!next || !writable(orderId)) return

  try {
    const admin = createAdminClient()
    await admin.from('orders').update({ payment_status: next }).eq('id', orderId)
    refresh(orderId)
  } catch {
    /* as above */
  }
}

/* -------------------------------- tracking -------------------------------- */

/**
 * The tracking number, the tracking link and the delivery date.
 *
 * The URL is stored as typed and rendered through safeUrl(), which is what the
 * booking desk does with a customer's reference link: refusing it here would
 * lose what the client pasted, and trusting it at render time would put a
 * javascript: URL behind a link in the admin.
 *
 * A blank date clears the delivery date. A date that is not a date changes
 * nothing at all and says so, rather than writing null over a real one.
 */
export async function saveTracking(formData: FormData): Promise<void> {
  await requireAdmin()

  const orderId = String(formData.get('orderId') ?? '').trim()
  if (!writable(orderId)) redirect('/admin/customer-orders')

  const day = String(formData.get('deliveredOn') ?? '').trim()
  if (day && !isValidIsoDate(day)) say(orderId, 'date', 'problem')

  // PostgREST reports a refused write in the response rather than by throwing,
  // so an unchecked call would redirect to "Changes saved." having saved
  // nothing at all.
  let wrote = false

  try {
    const admin = createAdminClient()
    const { error } = await admin
      .from('orders')
      .update({
        tracking_number: String(formData.get('trackingNumber') ?? '')
          .trim()
          .slice(0, MAX_TRACKING),
        tracking_url: String(formData.get('trackingUrl') ?? '')
          .trim()
          .slice(0, MAX_URL),
        // Stored at midday UTC rather than midnight: a delivery date is a day,
        // and midnight is the one instant that reads as the day before in half
        // the world.
        delivered_at: day ? `${day}T12:00:00Z` : null,
      })
      .eq('id', orderId)

    wrote = !error
  } catch {
    wrote = false
  }

  refresh(orderId)
  say(orderId, 'tracking', wrote ? 'done' : 'problem')
}

/* ------------------------------- admin note ------------------------------- */

/** The private note on one order. Never emailed, never published. */
export async function saveOrderNote(formData: FormData): Promise<void> {
  await requireAdmin()

  const orderId = String(formData.get('orderId') ?? '').trim()
  if (!writable(orderId)) redirect('/admin/customer-orders')

  let wrote = false

  try {
    const admin = createAdminClient()
    const { error } = await admin
      .from('orders')
      .update({ admin_note: String(formData.get('adminNote') ?? '').slice(0, MAX_NOTE) })
      .eq('id', orderId)

    wrote = !error
  } catch {
    wrote = false
  }

  refresh(orderId)
  say(orderId, 'note', wrote ? 'done' : 'problem')
}

/* --------------------------------- delete --------------------------------- */

/**
 * Bound with the id: deleteOrder.bind(null, id).
 *
 * The lines and the payment rows go with it — both are ON DELETE CASCADE — and
 * no stock comes back, because the stock lives in the other database and this
 * order never held any of it there. A delete is for a record that should never
 * have existed; cancel the order instead if it should be kept as one that was.
 */
export async function deleteOrder(orderId: string): Promise<void> {
  await requireAdmin()

  if (writable(orderId)) {
    try {
      const admin = createAdminClient()
      await admin.from('orders').delete().eq('id', orderId)
      refresh(orderId)
    } catch {
      /* the list is where the client finds out; it will still show the row */
    }
  }

  redirect('/admin/customer-orders')
}
