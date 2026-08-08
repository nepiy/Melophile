import 'server-only'

import type { PricedCart } from '@/lib/cart'
import { orderReference } from '@/lib/format'
import { logActivity } from '@/lib/account/queries'
import { createAdminClient } from '@/lib/supabase/admin'
import { serviceRoleAvailable } from '@/lib/supabase/config'
import type {
  OrderItemRow,
  OrderRow,
  OrderStatus,
  PaymentRow,
  PaymentStatus,
} from '@/lib/supabase/types'

/* ==========================================================================
   Orders, in Postgres.

   WHY ORDERS MOVED AND THE CATALOGUE DID NOT
   The catalogue is content the label edits — a few hundred rows, versioned
   with the site, read on every page. SQLite is exactly right for that and it
   stays. An order is somebody's money and somebody's address: it belongs to a
   customer, it has to survive a redeploy, and it has to be readable by that
   customer from wherever they signed in. So `priceCart()` still prices from
   SQLite, and the PricedCart it returns is written down here.

   EVERY AMOUNT IS AN INTEGER IN PENCE, COPIED STRAIGHT FROM THE PRICED CART.
   No arithmetic happens in this file beyond adding up what was already worked
   out, and no price is ever read back out of the catalogue to render an old
   order: `product_name`, `variant_label` and `unit_price` are SNAPSHOTS. A
   price change tomorrow must not rewrite what somebody was charged last month,
   and a deleted product must not empty a receipt.

   THE SERVICE ROLE, AND WHY
   Row level security gives customers SELECT on their own orders and nothing
   else — there is deliberately no INSERT policy, because a browser that can
   insert an order is a browser that can invent a paid one. So every write here
   goes through `createAdminClient()`, which is server-only and bypasses RLS.
   The public confirmation page reads through it too, because the buyer there
   may be a guest with no session at all.

   NOTHING HERE THROWS.
   Supabase may be switched off entirely — that is a supported state of this
   site, not a fault — so every function returns `{ ok: false, error }` and the
   caller decides what to say. A checkout must never 500 because a database it
   is not using is absent.
   ========================================================================== */

const OFFLINE =
  'Orders are not stored in Postgres on this deployment, because Supabase is not configured.'

export type OrderCustomer = {
  name: string
  email: string
  phone: string
  /** The posting address as the customer typed it. Ignored for a digital basket. */
  shippingLines: string
}

export type CreateOrderInput = {
  cart: PricedCart
  customer: OrderCustomer
  /** The buyer's account id, or null for a guest. Guest checkout is supported. */
  userId: string | null
  /** Recorded on the account activity trail, which is the only table with a home for it. */
  ip: string
}

export type CreateOrderResult =
  { ok: true; reference: string; id: string } | { ok: false; error: string }

export type Ack = { ok: true } | { ok: false; error: string }

/** An order with everything hanging off it. What every order screen renders. */
export type FullOrder = OrderRow & {
  items: OrderItemRow[]
  payments: PaymentRow[]
}

export type ReadOrderResult =
  { ok: true; order: FullOrder } | { ok: false; error: string }

/** True when orders are written to Postgres rather than to SQLite. */
export function postgresOrders(): boolean {
  return serviceRoleAvailable()
}

/** Whatever went wrong, as one sentence a person could be shown. */
function reason(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = String((error as { message: unknown }).message).trim()
    if (message) return message
  }
  return fallback
}

/* --------------------------------------------------------------------------
   Writing an order
   -------------------------------------------------------------------------- */

/**
 * Writes the order and its lines.
 *
 * PostgREST has no transaction spanning two requests, so the two inserts are
 * two round trips. An order with no lines is worse than no order at all — it
 * is a total with nothing to justify it — so a failed line insert deletes the
 * header again and reports the failure, leaving nothing half-written.
 */
export async function createOrder({
  cart,
  customer,
  userId,
  ip,
}: CreateOrderInput): Promise<CreateOrderResult> {
  if (!serviceRoleAvailable()) return { ok: false, error: OFFLINE }

  const reference = orderReference()

  try {
    const admin = createAdminClient()

    const { data: header, error: headerError } = await admin
      .from('orders')
      .insert({
        reference,
        // Null for a guest. The column is nullable on purpose, and claiming the
        // order later is a matter of matching the email — see claimGuestOrders.
        user_id: userId,
        email: customer.email,
        customer_name: customer.name,
        phone: customer.phone,
        subtotal_amount: cart.subtotalCents,
        shipping_amount: cart.shippingCents,
        total_amount: cart.totalCents,
        currency: cart.currency,
        payment_status: 'unpaid',
        order_status: 'pending',
        // An address is only asked for, and only kept, when something has to be posted.
        shipping_address: cart.hasPhysical ? customer.shippingLines : '',
      })
      .select('id, reference')
      .single()

    if (headerError || !header) {
      return {
        ok: false,
        error: reason(headerError, 'The order could not be written.'),
      }
    }

    const lines = cart.lines
      .filter((line) => line.quantity > 0)
      .map((line) => ({
        order_id: header.id,
        /* The catalogue row's id, kept as a plain integer because the catalogue
           lives in another database entirely. `product_kind` is what tells a
           ticket's event id apart from a product's id — there is one column for
           both, and guessing from the number would be a bug waiting to happen. */
        product_id: line.id,
        product_kind: line.kind,
        product_name: line.title,
        variant_label: line.variant,
        quantity: line.quantity,
        unit_price: line.unitPriceCents,
      }))

    if (lines.length > 0) {
      const { error: linesError } = await admin.from('order_items').insert(lines)
      if (linesError) {
        await admin.from('orders').delete().eq('id', header.id)
        return {
          ok: false,
          error: reason(linesError, 'The order lines could not be written.'),
        }
      }
    }

    /* The audit trail, for a signed-in buyer only — a guest has no account to
       write it against. It is written here rather than by the caller because
       this is the one place that knows the row really landed, and because the
       activity table is the only place in this schema with a home for the ip.
       logActivity never throws: losing a log line must not fail a checkout. */
    if (userId) {
      await logActivity(
        userId,
        'order_placed',
        {
          reference: header.reference,
          total: cart.totalCents,
          currency: cart.currency,
          items: cart.itemCount,
        },
        { ip },
      )
    }

    return { ok: true, reference: header.reference, id: header.id }
  } catch (error) {
    return { ok: false, error: reason(error, 'The order could not be written.') }
  }
}

/* --------------------------------------------------------------------------
   Payments — one row per attempt, so a retry is visible rather than silent
   -------------------------------------------------------------------------- */

export type PaymentAttempt = {
  provider: string
  /** The provider's id for this attempt. For Stripe, the checkout session id. */
  transactionId: string
  amount: number
  currency: string
  status: PaymentStatus
}

/**
 * Records a payment attempt against an order.
 *
 * This is also where the Stripe session id is kept. The Postgres orders table
 * has no column for it, and it should not: a session belongs to an attempt at
 * paying, not to the order, and there can be more than one. The confirmation
 * page matches the id in the return URL against this row before it will settle
 * anything — see /order/[reference].
 */
export async function attachPayment(
  orderId: string,
  attempt: PaymentAttempt,
): Promise<Ack> {
  if (!serviceRoleAvailable()) return { ok: false, error: OFFLINE }

  try {
    const admin = createAdminClient()
    const { error } = await admin.from('payments').insert({
      order_id: orderId,
      payment_provider: attempt.provider,
      transaction_id: attempt.transactionId,
      amount: attempt.amount,
      currency: attempt.currency,
      payment_status: attempt.status,
    })
    if (error) return { ok: false, error: reason(error, 'The payment was not recorded.') }
    return { ok: true }
  } catch (error) {
    return { ok: false, error: reason(error, 'The payment was not recorded.') }
  }
}

/**
 * Settles an order: paid on the order, and paid on a payments row too, so the
 * ledger and the order never disagree about whether money arrived.
 *
 * Only a pending order is settled. An order that has been cancelled or
 * refunded must not be dragged back to paid by a late return URL, and an order
 * already paid is left alone — this runs on every load of the confirmation
 * page, so it has to be safe to run twice.
 */
export async function markPaid(
  reference: string,
  { transactionId, provider = 'stripe' }: { transactionId: string; provider?: string },
): Promise<Ack> {
  if (!serviceRoleAvailable()) return { ok: false, error: OFFLINE }

  try {
    const admin = createAdminClient()

    const { data: order, error: updateError } = await admin
      .from('orders')
      .update({ payment_status: 'paid', order_status: 'paid' })
      .eq('reference', reference)
      .eq('order_status', 'pending')
      .select('id, total_amount, currency')
      .maybeSingle()

    if (updateError) {
      return { ok: false, error: reason(updateError, 'The order was not marked paid.') }
    }
    // Nothing matched: already settled, or cancelled. Not an error, and not a
    // reason to write a second payments row.
    if (!order) return { ok: true }

    /* Settle the attempt that was already recorded, if there is one. Otherwise
       write the row now — a free order never had an attempt, and neither did
       an order settled by hand. */
    const settled = transactionId
      ? await admin
          .from('payments')
          .update({ payment_status: 'paid' })
          .eq('order_id', order.id)
          .eq('transaction_id', transactionId)
          .select('id')
      : { data: null }

    if (!settled.data || settled.data.length === 0) {
      await admin.from('payments').insert({
        order_id: order.id,
        payment_provider: provider,
        transaction_id: transactionId,
        amount: order.total_amount,
        currency: order.currency,
        payment_status: 'paid',
      })
    }

    return { ok: true }
  } catch (error) {
    return { ok: false, error: reason(error, 'The order was not marked paid.') }
  }
}

/** Records whether the label's own notification email went out. Never lies. */
export async function recordNotification(
  orderId: string,
  result: { ok: true } | { ok: false; error: string },
): Promise<Ack> {
  if (!serviceRoleAvailable()) return { ok: false, error: OFFLINE }

  try {
    const admin = createAdminClient()
    const { error } = await admin
      .from('orders')
      .update({ notified: result.ok, notify_error: result.ok ? '' : result.error })
      .eq('id', orderId)
    if (error) return { ok: false, error: reason(error, 'Could not record the email.') }
    return { ok: true }
  } catch (error) {
    return { ok: false, error: reason(error, 'Could not record the email.') }
  }
}

/* --------------------------------------------------------------------------
   Reading
   -------------------------------------------------------------------------- */

/**
 * One order by its reference, with lines and payments.
 *
 * Deliberately the SERVICE ROLE, because the public confirmation page has to
 * work for a guest who has no session and therefore no row level security
 * identity. Everything a signed-in customer sees under /account goes through
 * getMyOrders/getMyOrder instead, where RLS does the guarding — do not use
 * this function to build a customer's history.
 */
export async function getOrderByReference(reference: string): Promise<ReadOrderResult> {
  if (!serviceRoleAvailable()) return { ok: false, error: OFFLINE }

  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('orders')
      .select('*, items:order_items(*), payments:payments(*)')
      .eq('reference', reference)
      .maybeSingle()

    if (error) return { ok: false, error: reason(error, 'That order could not be read.') }
    if (!data) return { ok: false, error: 'No order has that reference.' }

    const order = data as FullOrder
    // Lines oldest first, so a receipt reads in the order it was built.
    // Payments newest first, so the latest attempt is the one to hand.
    const items = [...(order.items ?? [])].sort((a, b) =>
      a.created_at.localeCompare(b.created_at),
    )
    const payments = [...(order.payments ?? [])].sort((a, b) =>
      b.created_at.localeCompare(a.created_at),
    )

    return { ok: true, order: { ...order, items, payments } }
  } catch (error) {
    return { ok: false, error: reason(error, 'That order could not be read.') }
  }
}

/**
 * Hands a customer the orders they placed as a guest before they registered.
 *
 * Matched on the email, case-insensitively, and only where `user_id` is still
 * null — an order already attached to somebody is never reassigned, whatever
 * address it carries. Supabase only lets an account exist with an email it has
 * seen, so this cannot be used to adopt a stranger's order by claiming their
 * address; the account holder had to receive mail there to get in.
 */
export async function claimGuestOrders(
  userId: string,
  email: string,
): Promise<{ ok: true; claimed: number } | { ok: false; error: string }> {
  if (!serviceRoleAvailable()) return { ok: false, error: OFFLINE }

  const address = email.trim().toLowerCase()
  if (!address) return { ok: true, claimed: 0 }

  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('orders')
      .update({ user_id: userId })
      .is('user_id', null)
      .ilike('email', address)
      .select('id')

    if (error) {
      return { ok: false, error: reason(error, 'Guest orders could not be claimed.') }
    }
    return { ok: true, claimed: data?.length ?? 0 }
  } catch (error) {
    return { ok: false, error: reason(error, 'Guest orders could not be claimed.') }
  }
}

/* ==========================================================================
   Words and shapes shared by every order screen.

   Kept here so the account list, the account detail, the public confirmation
   and the invoice cannot drift into three different names for one status.
   ========================================================================== */

/**
 * The status words.
 *
 * `pending`, `paid`, `cancelled` and `refunded` use the same words as
 * `orderStatusLabel` in @/lib/format, which is what the admin renders. The
 * three Postgres-only statuses take the names of the steps below, so the chip
 * on a row and the step on the strip never say different things about the same
 * order. A full Record, so adding a status to the union breaks the build here
 * rather than printing a raw `shipped` at a customer.
 */
const ORDER_WORD: Record<OrderStatus, string> = {
  pending: 'Awaiting payment',
  paid: 'Paid',
  processing: 'Processing',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
}

export function orderStatusWord(status: OrderStatus): string {
  return ORDER_WORD[status] ?? status
}

/**
 * Every status, in the order an order actually moves through them.
 *
 * One list, because a filter strip and the validator that reads `?status=`
 * disagreeing about which values exist is a tab that leads to an empty page.
 */
export const ORDER_STATUSES = Object.keys(ORDER_WORD) as OrderStatus[]

/** Narrows a query parameter to a real status, or null for "everything". */
export function readOrderStatus(raw: string | string[] | undefined): OrderStatus | null {
  const value = Array.isArray(raw) ? raw[0] : raw
  if (!value) return null
  return ORDER_STATUSES.includes(value as OrderStatus) ? (value as OrderStatus) : null
}

const PAYMENT_WORD: Record<PaymentStatus, string> = {
  unpaid: 'Unpaid',
  pending: 'Payment pending',
  paid: 'Paid',
  failed: 'Payment failed',
  refunded: 'Refunded',
}

export function paymentStatusWord(status: PaymentStatus): string {
  return PAYMENT_WORD[status] ?? status
}

/** Where an order has got to. Cancelled and refunded are not on this line. */
export const ORDER_STEPS = [
  'Placed',
  'Paid',
  'Processing',
  'Shipped',
  'Delivered',
] as const

/**
 * The step an order is standing on, or null when the strip does not apply.
 *
 * A cancelled or refunded order has left the line rather than stopped part way
 * along it, and drawing it as a timeline with three grey steps ahead of it
 * would be a picture of something that is never going to happen.
 */
export function orderStepIndex(status: OrderStatus): number | null {
  switch (status) {
    case 'pending':
      return 0
    case 'paid':
      return 1
    case 'processing':
      return 2
    case 'shipped':
      return 3
    case 'delivered':
      return 4
    default:
      return null
  }
}

/**
 * The symbol for a currency an order was taken in.
 *
 * Read from the ORDER, not from today's store settings: an order taken in
 * pounds must keep rendering in pounds if the label ever switches currency.
 */
const SYMBOLS: Record<string, string> = { GBP: '£', USD: '$', EUR: '€' }

export function currencySymbol(code: string): string {
  const key = code.trim().toUpperCase()
  if (!key) return '£'
  return SYMBOLS[key] ?? `${key} `
}

/** The line total. One place, so no screen multiplies it its own way. */
export function lineTotal(item: OrderItemRow): number {
  return item.unit_price * item.quantity
}

/** How many things are in an order, rather than how many lines it has. */
export function itemCount(items: OrderItemRow[]): number {
  return items.reduce((sum, item) => sum + item.quantity, 0)
}

/** The payment that matters: the settled one, else the most recent attempt. */
export function principalPayment(payments: PaymentRow[]): PaymentRow | null {
  return payments.find((p) => p.payment_status === 'paid') ?? payments[0] ?? null
}
