'use server'

import { and, eq, isNotNull, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import {
  db,
  events,
  orderItems,
  orders,
  ORDER_STATUSES,
  products,
  type OrderStatus,
} from '@/db'
import { revalidateContent } from '@/lib/revalidate'
import { requireAdmin } from '@/lib/session'
import { STORE_TAGS } from '@/lib/store-data'

/* ==========================================================================
   Orders.

   Same rules the rest of the admin follows: requireAdmin() first, validate
   before writing, never throw at the client for something they typed.

   REVALIDATION IS NARROW ON PURPOSE. An order appears nowhere on the public
   site, so a status change, a note or a delete has no public page to drop —
   those call revalidatePath on the admin routes only. Dropping the public
   content tags for them would throw away the whole cached site to redraw one
   admin row.

   The one exception is a restock, below, and it is not an exception to the
   rule so much as a consequence of it: putting stock back changes what /store
   and /events say is available, and a storefront that keeps advertising "sold
   out" after the order that held the last one was cancelled is wrong in the
   only way that costs the client money.

   ---------------------------------------------------------------------------
   RESTOCKING, AND WHY PRESSING THE BUTTON TWICE IS SAFE

   Checkout holds stock the moment an order is written — products.stock goes
   down, events.ticketsSold goes up, in the same transaction as the order. That
   hold has to come back when the order is cancelled or refunded, and it has to
   come back EXACTLY ONCE.

   Three things make that true, all inside one transaction:

     1. the previous status is read inside the transaction, not passed in from
        the page, so it cannot be a stale value from a screen rendered a minute
        ago
     2. stock only moves on a transition OUT of a status that still holds it
        INTO one that does not — cancelled → refunded moves nothing, because
        cancelled had already released it
     3. the status update is guarded on the status we read
        (WHERE id = ? AND status = ?), and the restock only runs if that update
        reported exactly one changed row. Two clicks racing each other means
        the second one matches nothing, changes nothing and restocks nothing.
   ========================================================================== */

export type OrderNoteState = {
  error?: string
  saved?: boolean
}

const GONE = 'That order is no longer here. It may have been deleted in another tab.'

/** Longest internal note kept. Generous — it is a note, not a document. */
const MAX_NOTE = 4000

const STATUSES: ReadonlySet<string> = new Set<string>(ORDER_STATUSES)

/**
 * The statuses in which an order no longer holds any stock. Everything else —
 * pending, paid, fulfilled — is still holding what checkout took.
 */
const RELEASED: ReadonlySet<OrderStatus> = new Set<OrderStatus>(['cancelled', 'refunded'])

/**
 * The two admin screens an order is drawn on. The layout goes too: counts
 * rendered above the page lag a status change otherwise, and a badge that
 * disagrees with the row under it is worse than no badge at all.
 */
function refreshOrderScreens(id?: number): void {
  revalidatePath('/admin/orders')
  if (id !== undefined) revalidatePath(`/admin/orders/${id}`)
  revalidatePath('/admin', 'layout')
}

/* -------------------------------- status --------------------------------- */

/**
 * Inline status change, from a row on the list or from the order itself. Bound
 * with both arguments: setOrderStatus.bind(null, id, 'paid').
 *
 * The status is checked against ORDER_STATUSES rather than trusted. These
 * actions are reachable as a POST by anything that can guess the id, and the
 * column is plain text in SQLite — an unchecked value would be written happily
 * and then render as an order in no state at all.
 */
export async function setOrderStatus(id: number, status: string): Promise<void> {
  await requireAdmin()

  if (!Number.isInteger(id) || !STATUSES.has(status)) return
  const next = status as OrderStatus

  const restocked = db.transaction((tx) => {
    const current = tx
      .select({ status: orders.status })
      .from(orders)
      .where(eq(orders.id, id))
      .get()

    if (!current || current.status === next) return false

    // Read before the write, so it describes the row we are about to change
    // rather than the row some earlier render happened to show.
    const givesStockBack = !RELEASED.has(current.status) && RELEASED.has(next)

    // Guarded on the status we just read. If another tab moved this order in
    // between, this matches no rows and everything below is skipped.
    const moved = tx
      .update(orders)
      .set({ status: next, updatedAt: new Date() })
      .where(and(eq(orders.id, id), eq(orders.status, current.status)))
      .run()

    if (Number(moved.changes) !== 1) return false
    if (!givesStockBack) return false

    const lines = tx.select().from(orderItems).where(eq(orderItems.orderId, id)).all()

    for (const line of lines) {
      if (line.quantity <= 0) continue

      // Null stock is unlimited, and unlimited + 3 is still unlimited. The
      // isNotNull() guard is what keeps an uncapped product from acquiring a
      // number it never had.
      if (line.productId !== null) {
        tx.update(products)
          .set({ stock: sql`${products.stock} + ${line.quantity}` })
          .where(and(eq(products.id, line.productId), isNotNull(products.stock)))
          .run()
      }

      // Floored at zero: a count that has been corrected by hand in the editor
      // since the order was placed must not be driven negative by giving back
      // more than it currently holds.
      if (line.eventId !== null) {
        tx.update(events)
          .set({ ticketsSold: sql`max(0, ${events.ticketsSold} - ${line.quantity})` })
          .where(eq(events.id, line.eventId))
          .run()
      }
    }

    return true
  })

  refreshOrderScreens(id)

  // Only when stock actually moved. A status change on its own has no public
  // page to drop; a restock changes what the store and the events page say is
  // available, and saying nothing there would leave a sold-out badge on
  // something that is back on sale.
  if (restocked) revalidateContent(STORE_TAGS.products, STORE_TAGS.events)
}

/* ------------------------------ admin note ------------------------------- */

/** The private note on one order. Nothing here is ever emailed or published. */
export async function saveOrderNote(
  _previous: OrderNoteState,
  formData: FormData,
): Promise<OrderNoteState> {
  await requireAdmin()

  const id = Number(String(formData.get('id') ?? '').trim())
  if (!Number.isInteger(id)) {
    return { error: 'That order could not be identified. Open it again from the list.' }
  }

  const row = await db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.id, id))
    .get()
  if (!row) return { error: GONE }

  await db
    .update(orders)
    .set({
      adminNote: String(formData.get('adminNote') ?? '').slice(0, MAX_NOTE),
      updatedAt: new Date(),
    })
    .where(eq(orders.id, id))

  refreshOrderScreens(id)
  return { saved: true }
}

/* -------------------------------- delete --------------------------------- */

/**
 * Bound with the id: deleteOrder.bind(null, id).
 *
 * The lines go with it — order_items is ON DELETE CASCADE — and no stock comes
 * back. That is deliberate: a delete is for a record that should never have
 * existed, and quietly adding three shirts to the store on the way out is not
 * something a delete button should do. Cancel the order first if the stock is
 * meant to return; the editor says so.
 */
export async function deleteOrder(id: number): Promise<void> {
  await requireAdmin()

  if (Number.isInteger(id)) {
    await db.delete(orders).where(eq(orders.id, id))
    refreshOrderScreens(id)
  }

  redirect('/admin/orders')
}
