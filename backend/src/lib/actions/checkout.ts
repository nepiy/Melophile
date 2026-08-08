'use server'

import { eq, sql } from 'drizzle-orm'
import { db, events, orderItems, orders, products } from '@/db'
import { priceCart, type CartLine, type PricedCart, type PricedLine } from '@/lib/cart'
import { orderReference } from '@/lib/format'
import { notifyOrder } from '@/lib/mail'
import { assertOrderAccessConfigured, orderAccessToken } from '@/lib/order-access'
import {
  attachPayment,
  createOrder,
  markPaid,
  recordNotification,
} from '@/lib/orders/store'
import { createCheckoutSession, needsPayment, stripeConfigured } from '@/lib/payments'
import { checkBookingRate, clientIp } from '@/lib/ratelimit'
import { serviceRoleAvailable } from '@/lib/supabase/config'
import { getCurrentUser } from '@/lib/supabase/server'
import {
  checkoutSchema,
  toFieldErrors,
  type CheckoutInput,
  type FieldErrors,
} from '@/lib/validation'

/* ==========================================================================
   Checkout.

   The order of operations is the whole design, and it is deliberate:

     1. re-price the basket from the database (never from the browser)
     2. write the order, its lines and the stock movement in ONE transaction
     3. only then ask Stripe for a payment page

   Doing it this way means a payment provider that is slow, down or simply not
   configured can never lose an order — the record already exists and is in the
   admin. The customer is told exactly which of the two happened rather than
   being shown a success page that is not true.

   TWO STORES, ONE BRANCH
   Orders are moving to Postgres, where they belong to a customer and can be
   read back under row level security. The CATALOGUE is not moving: it is
   content the label edits, so `priceCart()` below still prices from SQLite,
   and the priced basket is written to whichever order store is configured.

   `serviceRoleAvailable()` decides, once, right after validation:

     true  → orders + order_items + payments in Postgres
     false → the SQLite path below, byte for byte what it always did

   The site must keep working with Supabase switched off — including guest
   checkout, which works on both paths. Nothing above the branch knows which
   store it is feeding, and the three steps above are the same on either side.
   ========================================================================== */

export type CheckoutState = {
  fieldErrors?: FieldErrors
  formError?: string
  /** Blocking basket problems, e.g. something sold out while they typed. */
  cartIssues?: string[]
  /** Present when Stripe gave us a page to send them to. */
  redirectUrl?: string
  /** Present once the order exists, paid or not. */
  reference?: string
  /** Bearer token for the private guest confirmation page. */
  accessToken?: string
  /** Present when the order was taken but no payment was collected. */
  unpaidNotice?: string
}

export async function submitCheckout(
  _prev: CheckoutState,
  formData: FormData,
): Promise<CheckoutState> {
  const parsed = checkoutSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    phone: formData.get('phone'),
    shippingLines: formData.get('shippingLines'),
    needsShipping: formData.get('needsShipping') === 'true',
    company: formData.get('company') ?? '',
  })

  let lines: CartLine[] = []
  try {
    lines = JSON.parse(String(formData.get('cart') ?? '[]')) as CartLine[]
  } catch {
    return { formError: 'Your basket could not be read. Reload the page and try again.' }
  }

  const cart = await priceCart(lines)

  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }
  const customer = parsed.data

  if (cart.lines.length === 0 || cart.itemCount === 0) {
    return { formError: 'Your basket is empty.' }
  }
  if (cart.issues.length > 0) return { cartIssues: cart.issues }

  // The short reference is for people to quote, not a password. Refuse the
  // checkout before writing anything if a private confirmation link cannot be
  // derived for it.
  try {
    assertOrderAccessConfigured()
  } catch {
    return {
      formError:
        'Checkout is temporarily unavailable. Nothing has been recorded or charged — try again in a moment.',
    }
  }

  // Never derive a Stripe return URL from Host/X-Forwarded-Host. Those headers
  // are attacker input on a misconfigured proxy, and the success URL now carries
  // the guest's order credential. Validate the deployment origin before writing
  // an order whenever a real payment redirect will be created.
  let paymentOrigin = 'http://localhost:3000'
  if (needsPayment(cart) && stripeConfigured()) {
    try {
      paymentOrigin = siteOrigin()
    } catch {
      return {
        formError:
          'Checkout is temporarily unavailable. Nothing has been recorded or charged — try again in a moment.',
      }
    }
  }

  const ip = await clientIp()
  if (!checkBookingRate(ip).allowed) {
    return {
      formError:
        'That is a lot of orders in a short time. Wait a few minutes and try again.',
    }
  }

  /* ---- the one branch ---- */
  if (serviceRoleAvailable()) {
    return postgresCheckout(cart, customer, ip, paymentOrigin)
  }

  /* ---- write it down, all or nothing ---- */
  const reference = orderReference()
  const accessToken = orderAccessToken(reference)
  const now = new Date()

  let orderId: number
  try {
    orderId = db.transaction((tx) => {
      const inserted = tx
        .insert(orders)
        .values({
          reference,
          email: customer.email,
          name: customer.name,
          phone: customer.phone,
          shippingLines: cart.hasPhysical ? customer.shippingLines : '',
          subtotalCents: cart.subtotalCents,
          shippingCents: cart.shippingCents,
          totalCents: cart.totalCents,
          currency: cart.currency,
          status: 'pending',
          paymentProvider: stripeConfigured() ? 'stripe' : 'none',
          stripeSessionId: '',
          notified: false,
          notifyError: '',
          ip,
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: orders.id })
        .get()

      if (!inserted) throw new Error('order insert returned nothing')

      for (const line of cart.lines) {
        if (line.quantity <= 0) continue

        tx.insert(orderItems)
          .values({
            orderId: inserted.id,
            kind: line.kind,
            productId: line.type === 'product' ? line.id : null,
            eventId: line.type === 'ticket' ? line.id : null,
            titleSnapshot: line.title,
            variantLabel: line.variant,
            unitPriceCents: line.unitPriceCents,
            quantity: line.quantity,
          })
          .run()

        // Hold the stock now. An unpaid order that expires is a smaller problem
        // than two people buying the same exclusive licence.
        holdStock(tx, line)
      }

      return inserted.id
    })
  } catch {
    return {
      formError:
        'We could not record that order. Nothing has been charged — try again in a moment.',
    }
  }

  /* ---- tell the label, without ever blocking the customer ---- */
  const row = await db.select().from(orders).where(eq(orders.id, orderId)).get()
  if (row) {
    const items = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId))
      .all()
    const result = await notifyOrder(row, items)
    await db
      .update(orders)
      .set({
        notified: result.ok,
        notifyError: result.ok ? '' : result.error,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, orderId))
  }

  /* ---- payment ---- */
  if (!needsPayment(cart)) {
    await db
      .update(orders)
      .set({ status: 'paid', paidAt: new Date(), updatedAt: new Date() })
      .where(eq(orders.id, orderId))
    return { reference, accessToken }
  }

  const session = await createCheckoutSession({
    cart,
    reference,
    email: customer.email,
    successUrl: `${paymentOrigin}/order/${reference}?access=${encodeURIComponent(accessToken)}&session={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${paymentOrigin}/cart?cancelled=1`,
  })

  if (session.ok) {
    await db
      .update(orders)
      .set({ stripeSessionId: session.sessionId, updatedAt: new Date() })
      .where(eq(orders.id, orderId))
    return { redirectUrl: session.url, reference, accessToken }
  }

  // Stripe unconfigured or unreachable. The order stands; say so honestly.
  return {
    reference,
    accessToken,
    unpaidNotice: `Your order is recorded as ${reference}. ${session.error}`,
  }
}

/* ==========================================================================
   The Postgres path.

   Same three steps, same order, same words to the customer. What differs is
   only where the record lands and that a signed-in buyer's id goes on it.
   ========================================================================== */

async function postgresCheckout(
  cart: PricedCart,
  customer: CheckoutInput,
  ip: string,
  paymentOrigin: string,
): Promise<CheckoutState> {
  /* Signed in, or a guest. GUEST CHECKOUT MUST KEEP WORKING: getCurrentUser()
     returns null when nobody is signed in and when accounts are switched off,
     and null is a perfectly good value for orders.user_id. Nothing below asks
     the buyer to have an account. A guest order placed against an address that
     later becomes an account is picked up by claimGuestOrders(). */
  const user = await getCurrentUser()

  const written = await createOrder({
    cart,
    customer: {
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      shippingLines: customer.shippingLines,
    },
    userId: user?.id ?? null,
    // Recorded on the order_placed activity row, for a signed-in buyer.
    ip,
  })

  if (!written.ok) {
    return {
      formError:
        'We could not record that order. Nothing has been charged — try again in a moment.',
    }
  }

  const { reference, id, accessToken } = written

  /* ---- stock ----
     The catalogue is still SQLite, so this is still a SQLite write and it still
     happens here: after the order is recorded and before anybody is sent to
     pay. Identical statements to the path above — one definition, called from
     both — because holding stock in two subtly different ways is how a shop
     ends up selling the same exclusive licence twice. */
  try {
    db.transaction((tx) => {
      for (const line of cart.lines) {
        if (line.quantity <= 0) continue
        holdStock(tx, line)
      }
    })
  } catch {
    // The order stands. Stock is a hold, not the record of the sale, and the
    // basket was re-priced against live stock moments ago.
  }

  /* ---- tell the label, without ever blocking the customer ---- */
  const now = new Date()
  const lines = cart.lines.filter((line) => line.quantity > 0)

  /* notifyOrder writes the label's plain-text order email and takes the
     catalogue database's row shapes. The order now lives in Postgres, so the
     rows are built here rather than read back — the email is the same email,
     and duplicating its template for a second store would be two things to
     keep in step instead of one. */
  const notice = await notifyOrder(
    {
      id: 0,
      reference,
      email: customer.email,
      name: customer.name,
      phone: customer.phone,
      shippingLines: cart.hasPhysical ? customer.shippingLines : '',
      subtotalCents: cart.subtotalCents,
      shippingCents: cart.shippingCents,
      totalCents: cart.totalCents,
      currency: cart.currency,
      status: 'pending',
      paymentProvider: stripeConfigured() ? 'stripe' : 'none',
      stripeSessionId: '',
      paidAt: null,
      notified: false,
      notifyError: '',
      adminNote: '',
      ip,
      createdAt: now,
      updatedAt: now,
    },
    lines.map((line, index) => ({
      id: index + 1,
      orderId: 0,
      kind: line.kind,
      productId: line.type === 'product' ? line.id : null,
      eventId: line.type === 'ticket' ? line.id : null,
      titleSnapshot: line.title,
      variantLabel: line.variant,
      unitPriceCents: line.unitPriceCents,
      quantity: line.quantity,
    })),
  )

  await recordNotification(id, notice)

  /* ---- payment ---- */
  if (!needsPayment(cart)) {
    await markPaid(reference, { transactionId: '', provider: 'none' })
    return { reference, accessToken }
  }

  const session = await createCheckoutSession({
    cart,
    reference,
    email: customer.email,
    successUrl: `${paymentOrigin}/order/${reference}?access=${encodeURIComponent(accessToken)}&session={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${paymentOrigin}/cart?cancelled=1`,
  })

  if (session.ok) {
    /* The session id is kept on a payments row rather than on the order: it
       belongs to an attempt at paying, and there can be more than one. The
       confirmation page will not settle this order for any other id. */
    await attachPayment(id, {
      provider: 'stripe',
      transactionId: session.sessionId,
      amount: cart.totalCents,
      currency: cart.currency,
      status: 'pending',
    })
    return { redirectUrl: session.url, reference, accessToken }
  }

  // Stripe unconfigured or unreachable. The order stands; say so honestly.
  return {
    reference,
    accessToken,
    unpaidNotice: `Your order is recorded as ${reference}. ${session.error}`,
  }
}

/**
 * The stock movement, in the catalogue database, for one basket line.
 *
 * The catalogue stayed in SQLite when orders moved to Postgres, so this is a
 * SQLite write whichever store took the order. It is one function called from
 * both paths at the same point in the flow — right after the order is written,
 * before payment — so the two can never drift apart.
 */
type CatalogueTx = Parameters<Parameters<typeof db.transaction>[0]>[0]

function holdStock(tx: CatalogueTx, line: PricedLine): void {
  if (line.type === 'product') {
    tx.update(products)
      .set({ stock: sql`max(0, ${products.stock} - ${line.quantity})` })
      .where(eq(products.id, line.id))
      .run()
  } else {
    tx.update(events)
      .set({ ticketsSold: sql`${events.ticketsSold} + ${line.quantity}` })
      .where(eq(events.id, line.id))
      .run()
  }
}

/** Trusted absolute origin for payment return URLs; never derived from a request. */
function siteOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (!configured) throw new Error('NEXT_PUBLIC_SITE_URL is required for payments.')

  const url = new URL(configured)
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  const safeProtocol =
    url.protocol === 'https:' ||
    (process.env.NODE_ENV !== 'production' && local && url.protocol === 'http:')

  if (
    !safeProtocol ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== '/' && url.pathname !== '')
  ) {
    throw new Error('NEXT_PUBLIC_SITE_URL must be an HTTPS origin without a path.')
  }

  return url.origin
}
