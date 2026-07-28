import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'
import { DangerButton } from '@/components/admin/fields'
import { ORDER_STATUSES } from '@/db'
import { deleteOrder, setOrderStatus } from '@/lib/actions/orders'
import { getOrderForEdit } from '@/lib/admin-events-queries'
import { getStorePageForEdit } from '@/lib/admin-store-queries'
import {
  formatDateLong,
  formatMoney,
  formatTime,
  orderStatusLabel,
  pluralise,
  timeAgo,
} from '@/lib/format'
import { requireAdmin } from '@/lib/session'
import { OrderNoteForm } from './OrderNoteForm'

import '@/styles/admin-events.css'

/* ==========================================================================
   One order.

   Three rules hold this screen together, and all three are about not lying
   about money:

     · the lines are SNAPSHOTS. What is printed is what was charged, not what
       the item costs today. The page says so in one quiet line, because a
       price raised last month must not read as a discrepancy here
     · everything the customer typed is rendered as TEXT, with white-space:
       pre-wrap for the address. Never dangerouslySetInnerHTML — this and the
       booking notes are the two places a stranger's words reach the screen,
       and they get no HTML at all
     · if the receipt email failed, that is the first thing on the page, in
       full, with the reason. The client is told the order is stored, that it
       was charged as normal, and that nobody has been written to
   ========================================================================== */

export const dynamic = 'force-dynamic'

type PageProps = { params: Promise<{ id: string }> }

function noIndex(title: string): Metadata {
  return { title, robots: { index: false, follow: false } }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params
  const order = /^\d+$/.test(id) ? await getOrderForEdit(Number(id)) : null
  return noIndex(order ? `Order ${order.reference}` : 'Order')
}

/** A Date to this site's canonical ISO day, in local time. */
function isoDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`
}

/** A Date to 24-hour 'HH:MM', which is what formatTime() reads. */
function isoTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(
    date.getMinutes(),
  ).padStart(2, '0')}`
}

function stamp(date: Date): string {
  return `${formatDateLong(isoDay(date))} at ${formatTime(isoTime(date))}`
}

const PROVIDER_LABELS: Record<string, string> = {
  stripe: 'Stripe',
  none: 'No payment provider',
}

export default async function OrderDetailPage({ params }: PageProps) {
  await requireAdmin()

  const { id } = await params
  if (!/^\d+$/.test(id)) notFound()

  const order = await getOrderForEdit(Number(id))
  if (!order) notFound()

  const page = await getStorePageForEdit()
  const symbol = page?.currencySymbol || '£'

  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0)

  // Only the subject is encoded: the address has already been through the
  // checkout schema, which rejects spaces, quotes, commas and angle brackets,
  // and percent-encoding the @ helps no mail client anywhere.
  const replyHref = `mailto:${order.email}?subject=${encodeURIComponent(
    `Your order ${order.reference}`,
  )}`

  const customer: { label: string; value: ReactNode; mono?: boolean }[] = [
    { label: 'Name', value: order.name },
    {
      label: 'Email',
      value: (
        <a className="link" href={`mailto:${order.email}`}>
          {order.email}
        </a>
      ),
    },
  ]

  if (order.phone.trim()) {
    customer.push({
      label: 'Phone',
      value: (
        <a className="link" href={`tel:${order.phone.replace(/[^\d+]/g, '')}`}>
          {order.phone}
        </a>
      ),
      mono: true,
    })
  }

  if (order.shippingLines.trim()) {
    customer.push({
      label: 'Deliver to',
      // Plain text, and it stays plain: the line breaks the customer typed are
      // the only formatting this ever gets.
      value: <span className="aor-address">{order.shippingLines}</span>,
    })
  }

  customer.push({
    label: 'Placed',
    value: `${stamp(order.createdAt)} · ${timeAgo(order.createdAt)}`,
    mono: true,
  })

  const payment: { label: string; value: ReactNode; mono?: boolean }[] = [
    { label: 'Status', value: orderStatusLabel(order.status) },
    {
      label: 'Taken through',
      value: PROVIDER_LABELS[order.paymentProvider] ?? order.paymentProvider,
    },
  ]

  if (order.stripeSessionId.trim()) {
    payment.push({ label: 'Stripe session', value: order.stripeSessionId, mono: true })
  }

  payment.push({
    label: 'Paid',
    value: order.paidAt ? stamp(order.paidAt) : 'Not recorded as paid',
    mono: true,
  })

  return (
    <>
      <header className="ad-head">
        <div className="ad-head__strip" aria-hidden="true">
          <span className="mono ad-head__chan">13</span>
          <span className="ad-head__rule" />
          <span className="label">Order</span>
        </div>
        <div className="ad-head__title">
          <h1 className="ad-head__h mono aor-head__ref">{order.reference}</h1>
          <p className="mono aor-head__meta">
            {order.name} · {formatMoney(order.totalCents, symbol)} ·{' '}
            {orderStatusLabel(order.status)}
          </p>
          <p className="ad-head__intro">
            Placed {timeAgo(order.createdAt)}. Nothing on this screen is public, and
            nothing you change here emails anyone.
          </p>
        </div>
        <div className="ad-head__aside">
          <a className="btn ad-btn--primary" href={replyHref}>
            Email the customer
          </a>
          <Link href="/admin/orders" className="btn btn--sm btn--ghost">
            All orders
          </Link>
        </div>
      </header>

      {order.notified ? null : (
        <div className="ad-banner" role="alert">
          <span className="label ad-banner__tag">No email was sent</span>
          <p className="ad-banner__text">
            This order was recorded and charged as normal, and the customer saw their
            reference on screen — but the email failed, so no receipt reached them and no
            notification reached you. The order itself is stored here in full and is not
            at risk. Check the mail settings, then write to them from the button above.
          </p>
          {order.notifyError.trim() ? (
            <p className="mono aor-banner__reason">{order.notifyError}</p>
          ) : (
            <p className="mono aor-banner__reason">
              No reason was recorded for the failure.
            </p>
          )}
        </div>
      )}

      <section className="ad-panel" aria-labelledby="aor-items">
        <div className="ad-panel__head">
          <span className="label" id="aor-items">
            What they bought
          </span>
          <span className="mono aor-count">
            {itemCount} {pluralise(itemCount, 'item')}
          </span>
        </div>
        <div className="ad-panel__body">
          <p className="aor-note">Prices are as they were when the order was placed.</p>

          {order.items.length === 0 ? (
            <p className="aor-note">
              This order has no lines on it. That should not happen — keep it for the
              record rather than deleting it.
            </p>
          ) : (
            <>
              <div className="aor-items__head" aria-hidden="true">
                <span className="label">Qty</span>
                <span className="label">Item</span>
                <span className="label">Each</span>
                <span className="label">Line</span>
              </div>

              <ul className="aor-items">
                {order.items.map((item) => (
                  <li className="aor-item" key={item.id}>
                    <span className="mono aor-item__qty">
                      {item.quantity}
                      <span className="vh"> × </span>
                    </span>

                    <span className="aor-item__body">
                      <span className="aor-item__title">{item.titleSnapshot}</span>
                      {item.variantLabel ? (
                        <span className="mono aor-item__variant">
                          {item.variantLabel}
                        </span>
                      ) : null}
                    </span>

                    <span className="mono aor-item__unit">
                      {formatMoney(item.unitPriceCents, symbol)}
                    </span>

                    <span className="mono aor-item__total">
                      {formatMoney(item.unitPriceCents * item.quantity, symbol)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}

          <dl className="aor-totals">
            <div className="aor-total">
              <dt className="label">Subtotal</dt>
              <dd className="mono">{formatMoney(order.subtotalCents, symbol)}</dd>
            </div>
            <div className="aor-total">
              <dt className="label">Shipping</dt>
              <dd className="mono">{formatMoney(order.shippingCents, symbol)}</dd>
            </div>
            <div className="aor-total aor-total--grand">
              <dt className="label">Total</dt>
              <dd className="mono">
                {formatMoney(order.totalCents, symbol)}
                <span className="aor-total__ccy"> {order.currency}</span>
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="ad-panel" aria-labelledby="aor-who">
        <div className="ad-panel__head">
          <span className="label" id="aor-who">
            Who to send it to
          </span>
        </div>
        <div className="ad-panel__body">
          <dl className="aor-lines">
            {customer.map((line) => (
              <div className="aor-line" key={line.label}>
                <dt className="label aor-line__label">{line.label}</dt>
                <dd
                  className={`aor-line__value${line.mono ? ' aor-line__value--mono' : ''}`}
                >
                  {line.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="ad-panel" aria-labelledby="aor-payment">
        <div className="ad-panel__head">
          <span className="label" id="aor-payment">
            Payment
          </span>
        </div>
        <div className="ad-panel__body">
          <dl className="aor-lines">
            {payment.map((line) => (
              <div className="aor-line" key={line.label}>
                <dt className="label aor-line__label">{line.label}</dt>
                <dd
                  className={`aor-line__value${line.mono ? ' aor-line__value--mono' : ''}`}
                >
                  {line.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="ad-panel" aria-labelledby="aor-status">
        <div className="ad-panel__head">
          <span className="label" id="aor-status">
            Status
          </span>
        </div>
        <div className="ad-panel__body">
          <p className="aor-note">
            Yours to track with. It sends nothing to anyone. Marking an order cancelled or
            refunded puts what it was holding back on sale — the stock on each item and
            the tickets on each date. Doing it twice does not double it.
          </p>
          <div
            className="aor-states"
            role="group"
            aria-label={`Status of order ${order.reference}`}
          >
            {ORDER_STATUSES.map((status) => (
              <form key={status} action={setOrderStatus.bind(null, order.id, status)}>
                <button
                  type="submit"
                  className="btn btn--sm aor-state"
                  aria-pressed={order.status === status}
                >
                  {orderStatusLabel(status)}
                </button>
              </form>
            ))}
          </div>
        </div>
      </section>

      <OrderNoteForm id={order.id} note={order.adminNote} />

      {/* Its own form, and it has to be: a submit button inside the note form
          would post the note form, and a nested <form> is invalid HTML that the
          browser silently drops. */}
      <form className="aor-danger" action={deleteOrder.bind(null, order.id)}>
        <p className="aor-danger__text">
          Deleting removes this order, its lines and its note for good. Nothing is
          archived, the customer is not told, and no stock comes back — mark it cancelled
          first if the items should return to sale.
        </p>
        <DangerButton confirmLabel="Delete it">
          Delete order
          <span className="vh"> {order.reference}</span>
        </DangerButton>
      </form>
    </>
  )
}
