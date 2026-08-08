import { eq, inArray } from 'drizzle-orm'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SectionHead } from '@/components/site/SectionHead'
import { db, orderItems, orders, products } from '@/db'
import { formatMoney, orderStatusLabel } from '@/lib/format'
import { safeUrl } from '@/lib/markdown'
import {
  currencySymbol,
  getOrderByReference,
  markPaid,
  orderStatusWord,
} from '@/lib/orders/store'
import { verifyOrderAccessToken } from '@/lib/order-access'
import { verifySessionPaid } from '@/lib/payments'
import { getSession } from '@/lib/session'
import { getStorePage } from '@/lib/store-data'
import { serviceRoleAvailable } from '@/lib/supabase/config'
import { getCurrentUser } from '@/lib/supabase/server'

import '@/styles/cart.css'

/* ==========================================================================
   /order/<reference> — the receipt.

   TWO RULES, AND THEY ARE BOTH ABOUT NOT TRUSTING THIS URL.

   1. A RETURN URL IS NOT A PAYMENT. Stripe sends the customer back here with
      ?session=cs_… and that parameter is just text in an address bar — anyone
      can type it. So the session is verified against Stripe's API before the
      order is marked paid, and the id must ALSO match the one recorded on
      this order when the session was created. Without that second check, a
      customer holding one genuinely paid session id could paste it onto any
      other pending order and mark it paid.

   2. A DOWNLOAD URL IS THE PRODUCT. It is what somebody is paying for, so it
      is not queried at all — not fetched, not passed down, not rendered —
      unless the order has actually been paid. The guard is on the query, not
      on the JSX, because a value that never leaves the database cannot leak
      through view-source or an RSC payload.

   force-dynamic because an order page that is cached is an order page that
   can be served to the wrong person, or that shows a stale status.

   ACCESS TO THE PAGE
   The reference is designed to be spoken over the phone and has far too little
   entropy to be an access credential. A guest therefore needs the HMAC bearer
   token issued at checkout. A signed-in owner and the admin may enter without
   that token. Every refusal is a 404, so guessing reveals nothing.

   WHERE THE ORDER IS READ FROM
   Postgres when it is configured, SQLite otherwise — the same branch checkout
   makes when it writes. Both loaders return the same small view below, so the
   two rules above are implemented once and cannot come apart. This page is
   read with the SERVICE ROLE on the Postgres path, because the buyer may be a
   guest with no session at all. That makes the authorization check above the
   boundary that must run before any personal data is returned.
   ========================================================================== */

export const dynamic = 'force-dynamic'

/** An order is one person's business, not a search result. */
export const metadata: Metadata = {
  title: 'Your order',
  robots: { index: false, follow: false },
}

type Params = { reference: string }
type Query = Record<string, string | string[] | undefined>

/** One line of a receipt, whichever store it came out of. */
type ViewLine = {
  key: string
  title: string
  variant: string
  unitPriceCents: number
  quantity: number
  /** The catalogue id, for the download lookup. Null for a ticket. */
  productId: number | null
}

/** Everything this page renders, and nothing it should not have. */
type View = {
  reference: string
  email: string
  statusText: string
  headline: string
  paid: boolean
  pending: boolean
  /** True when a payment provider was involved, which changes what we say. */
  viaProvider: boolean
  lines: ViewLine[]
  subtotalCents: number
  shippingCents: number
  totalCents: number
  shippingLines: string
  symbol: string
}

export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<Params>
  searchParams: Promise<Query>
}) {
  const [{ reference }, query, page] = await Promise.all([
    params,
    searchParams,
    getStorePage(),
  ])

  const returned = typeof query.session === 'string' ? query.session : ''
  const access = typeof query.access === 'string' ? query.access : ''

  if (!/^[A-Za-z0-9][A-Za-z0-9-]{1,31}$/.test(reference)) notFound()

  const view = serviceRoleAvailable()
    ? await fromPostgres(reference, returned, access)
    : await fromSqlite(reference, returned, access, page.currencySymbol)

  if (!view) notFound()

  /* ---- rule 2: downloads exist only for a paid order ---- */

  const downloads = new Map<number, string>()
  if (view.paid) {
    const productIds = view.lines
      .map((line) => line.productId)
      .filter((id): id is number => id !== null)

    if (productIds.length > 0) {
      // The catalogue is still SQLite on both paths, so a download link is
      // looked up here whichever database the order itself came from.
      const rows = await db
        .select({ id: products.id, downloadUrl: products.downloadUrl })
        .from(products)
        .where(inArray(products.id, productIds))
        .all()

      for (const row of rows) {
        // safeUrl rejects anything that is not an openable link, so a stray
        // javascript: in the admin field can never become an href.
        const href = safeUrl(row.downloadUrl)
        if (href) downloads.set(row.id, href)
      }
    }
  }

  const symbol = view.symbol

  return (
    <section className="sec ord-sec" aria-labelledby="order-heading">
      <div className="shell">
        <SectionHead
          channel="01"
          label="Order"
          heading={view.headline}
          id="order-heading"
          headingLevel={1}
        />

        <div className="ord">
          {/* The reference is the thing they will read down a phone, so it is
              the biggest piece of mono on the page and it is selectable. */}
          <div className="ord__plate">
            <div className="ord__plate-cell">
              <p className="label ord__k">Reference</p>
              <p className="mono ord__ref">{view.reference}</p>
            </div>
            <div className="ord__plate-cell">
              <p className="label ord__k">Status</p>
              <p className="mono ord__status" data-paid={view.paid ? 'true' : 'false'}>
                {view.statusText}
              </p>
            </div>
            <div className="ord__plate-cell">
              <p className="label ord__k">Email</p>
              <p className="mono ord__email">{view.email}</p>
            </div>
          </div>

          {/* Pending and no payment provider: say plainly what happens, rather
              than showing a payment page that was never going to exist. */}
          {view.pending ? (
            <div className="ord__pending">
              <p className="label ord__pending-label">
                {view.viaProvider ? 'Payment not confirmed' : 'Payment to arrange'}
              </p>
              <p className="ord__pending-text">
                {view.viaProvider
                  ? 'Your order is recorded and nothing has been lost. The payment has not come through yet — if you closed the payment page, reply to the confirmation email and we will send you a new one.'
                  : 'Your order is recorded and the items are held for you. No card was taken here, so the label will be in touch about payment.'}
              </p>
            </div>
          ) : null}

          <ul className="ord__lines">
            {view.lines.map((item) => {
              const href = item.productId === null ? null : downloads.get(item.productId)

              return (
                <li key={item.key} className="ord__line">
                  <div className="ord__line-body">
                    <p className="ord__line-title">
                      {item.title}
                      {item.variant ? (
                        <span className="ord__line-variant"> · {item.variant}</span>
                      ) : null}
                    </p>
                    <p className="mono ord__line-unit">
                      {formatMoney(item.unitPriceCents, symbol)} each
                    </p>

                    {/* Only ever reached when `paid` is true — see rule 2. */}
                    {href ? (
                      <a
                        className="btn btn--sm ord__dl"
                        href={href}
                        rel="noopener noreferrer"
                      >
                        Download
                        <span className="vh"> {item.title}</span>
                      </a>
                    ) : null}
                  </div>

                  <p className="mono ord__line-qty">×{item.quantity}</p>
                  <p className="mono ord__line-money">
                    {formatMoney(item.unitPriceCents * item.quantity, symbol)}
                  </p>
                </li>
              )
            })}
          </ul>

          <dl className="ord__rows">
            <div className="ord__row">
              <dt className="label">Subtotal</dt>
              <dd className="mono">{formatMoney(view.subtotalCents, symbol)}</dd>
            </div>
            {view.shippingCents > 0 ? (
              <div className="ord__row">
                <dt className="label">Postage</dt>
                <dd className="mono">{formatMoney(view.shippingCents, symbol)}</dd>
              </div>
            ) : null}
            <div className="ord__row ord__row--total">
              <dt className="label">Total</dt>
              <dd className="mono ord__total">{formatMoney(view.totalCents, symbol)}</dd>
            </div>
          </dl>

          {view.shippingLines ? (
            <div className="ord__ship">
              <p className="label ord__k">Posting to</p>
              <p className="ord__ship-lines">{view.shippingLines}</p>
            </div>
          ) : null}

          <div className="ord__next">
            <p className="label ord__k">What happens next</p>
            <p className="ord__next-text">
              {page.successMessage ||
                'A confirmation is on its way to the address above. Keep the reference — it is how we find this order.'}
            </p>
            {view.paid && downloads.size > 0 ? (
              <p className="mono ord__next-note">
                Your downloads are on this page and in the confirmation email.
              </p>
            ) : null}
            <Link href="/store" className="btn ord__go">
              Back to the store
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ==========================================================================
   The two loaders. Each one settles its own store's order, under rule 1, and
   hands back the same view.
   ========================================================================== */

/** SQLite — exactly what this page has always done. */
async function fromSqlite(
  reference: string,
  returned: string,
  access: string,
  symbol: string,
): Promise<View | null> {
  let order = await db.select().from(orders).where(eq(orders.reference, reference)).get()
  if (!order) return null
  if (!(await mayReadOrder(reference, access))) return null

  /* ---- rule 1: verify, never assume ---- */

  if (
    returned &&
    order.status === 'pending' &&
    // The id has to be the one we recorded for THIS order. A paid session
    // belonging to somebody else must not settle this one.
    returned === order.stripeSessionId &&
    (await verifySessionPaid(returned))
  ) {
    const paidAt = new Date()
    await db
      .update(orders)
      .set({ status: 'paid', paidAt, updatedAt: paidAt })
      .where(eq(orders.id, order.id))
    order = { ...order, status: 'paid', paidAt, updatedAt: paidAt }
  }

  const items = await db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, order.id))
    .all()

  const viaProvider = order.paymentProvider === 'stripe'

  return {
    reference: order.reference,
    email: order.email,
    statusText: orderStatusLabel(order.status),
    headline: sqliteHeadline(order.status, viaProvider),
    paid: order.status === 'paid',
    pending: order.status === 'pending',
    viaProvider,
    lines: items.map((item) => ({
      key: String(item.id),
      title: item.titleSnapshot,
      variant: item.variantLabel,
      unitPriceCents: item.unitPriceCents,
      quantity: item.quantity,
      productId: item.productId,
    })),
    subtotalCents: order.subtotalCents,
    shippingCents: order.shippingCents,
    totalCents: order.totalCents,
    shippingLines: order.shippingLines,
    symbol,
  }
}

/** Postgres — the same rules, against orders + order_items + payments. */
async function fromPostgres(
  reference: string,
  returned: string,
  access: string,
): Promise<View | null> {
  const found = await getOrderByReference(reference)
  if (!found.ok) return null
  let order = found.order

  if (!verifyOrderAccessToken(reference, access)) {
    const [admin, user] = await Promise.all([callerIsAdmin(), getCurrentUser()])
    if (!admin && (!user || !order.user_id || order.user_id !== user.id)) return null
  }

  /* ---- rule 1: verify, never assume ----
     The session id lives on the payments row written when the session was
     created, because a session belongs to an attempt at paying rather than to
     the order. The check is the same one: the id in the URL must be the id we
     recorded for THIS order, AND Stripe must agree it is paid. */
  const stored = order.payments.find(
    (payment) => payment.payment_provider === 'stripe' && payment.transaction_id,
  )?.transaction_id

  if (
    returned &&
    order.order_status === 'pending' &&
    returned === stored &&
    (await verifySessionPaid(returned))
  ) {
    const settled = await markPaid(reference, { transactionId: returned })
    // Re-read rather than patching the object by hand: markPaid declines to
    // settle an order that is no longer pending, and this page must show what
    // the database actually says.
    if (settled.ok) {
      const again = await getOrderByReference(reference)
      if (again.ok) order = again.order
    }
  }

  const paidPayment = order.payments.find((payment) => payment.payment_status === 'paid')
  const viaProvider = order.payments.some(
    (payment) => payment.payment_provider === 'stripe',
  )
  const paid = order.payment_status === 'paid'

  return {
    reference: order.reference,
    email: order.email,
    statusText: orderStatusWord(order.order_status),
    headline: postgresHeadline(order.order_status, viaProvider && Boolean(paidPayment)),
    paid,
    pending: order.order_status === 'pending',
    viaProvider,
    lines: order.items.map((item) => ({
      key: item.id,
      title: item.product_name,
      variant: item.variant_label,
      unitPriceCents: item.unit_price,
      quantity: item.quantity,
      /* A ticket's product_id is an event id, and there is nothing to download
         against it. product_kind is what tells the two apart — never the
         number itself. */
      productId: item.product_kind === 'ticket' ? null : item.product_id,
    })),
    subtotalCents: order.subtotal_amount,
    shippingCents: order.shipping_amount,
    totalCents: order.total_amount,
    shippingLines: order.shipping_address,
    symbol: currencySymbol(order.currency),
  }
}

/** SQLite orders have no customer identity, so only a bearer token or admin may read. */
async function mayReadOrder(reference: string, access: string): Promise<boolean> {
  return verifyOrderAccessToken(reference, access) || callerIsAdmin()
}

async function callerIsAdmin(): Promise<boolean> {
  try {
    const session = await getSession()
    return Boolean(session && !session.user.mustChangePassword)
  } catch {
    return false
  }
}

/** The headline keeps the word the button used: pay → paid, place → placed. */
function sqliteHeadline(status: string, viaProvider: boolean): string {
  if (status === 'cancelled') return 'Order cancelled'
  if (status === 'refunded') return 'Order refunded'
  if (status === 'fulfilled') return 'Order sent'
  if (status === 'paid') return viaProvider ? 'Payment received' : 'Order placed'
  return 'Order placed'
}

function postgresHeadline(status: string, chargedByProvider: boolean): string {
  if (status === 'cancelled') return 'Order cancelled'
  if (status === 'refunded') return 'Order refunded'
  if (status === 'delivered') return 'Order delivered'
  if (status === 'shipped') return 'Order sent'
  if (status === 'processing') return 'Order being packed'
  if (status === 'paid') return chargedByProvider ? 'Payment received' : 'Order placed'
  return 'Order placed'
}
