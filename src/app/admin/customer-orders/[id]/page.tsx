import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'
import { DangerButton, Field, TextArea, TextInput } from '@/components/admin/fields'
import {
  deleteOrder,
  saveOrderNote,
  saveTracking,
  setOrderStatus,
  setPaymentStatus,
} from '@/lib/actions/admin-customer-orders'
import { getCustomerOrder, orderLabel, PAYMENT_STATUSES } from '@/lib/admin-users-queries'
import { formatDateLong, formatMoney, pluralise, timeAgo } from '@/lib/format'
import { safeUrl } from '@/lib/markdown'
import {
  currencySymbol,
  itemCount,
  lineTotal,
  orderStatusWord,
  paymentStatusWord,
  ORDER_STATUSES,
} from '@/lib/orders/store'
import { requireAdmin } from '@/lib/session'

import '@/styles/admin-events.css'
import '@/styles/admin-users.css'

/* ==========================================================================
   One customer order, in Postgres.

   Built to the same three rules as /admin/orders/[id], because they are the
   rules that stop an order screen lying about money:

     · the lines are SNAPSHOTS. What is printed is what was charged, not what
       the item costs today — the page says so in one quiet line, so a price
       raised last month does not read as a discrepancy here
     · everything the customer typed is rendered as TEXT, with white-space:
       pre-wrap for the address. Never dangerouslySetInnerHTML
     · if the confirmation email failed, that is the first thing on the page, in
       full, with the reason

   TWO STATUS CONTROLS, NOT ONE. Where an order has got to and whether the money
   arrived are different facts: an order can be paid and unshipped, or shipped
   and refunded. Collapsing them into one row of buttons would force a lie in
   one direction or the other.

   The payments list below them is the provider's record and is never written
   from this screen. Marking an order paid by hand is a note about the order,
   not a transaction, and inventing a payments row for it would put money in the
   ledger that nobody sent.
   ========================================================================== */

export const dynamic = 'force-dynamic'

type PageProps = {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params
  const reference = await orderLabel(id)
  return {
    title: reference ? `Order ${reference}` : 'Order',
    robots: { index: false, follow: false },
  }
}

/** What the redirect after a save is allowed to say. Anything else says nothing. */
const DONE: Record<string, string> = {
  tracking: 'Changes saved.',
  note: 'Note saved.',
}

const PROBLEM: Record<string, string> = {
  date: 'That delivery date is not a date. Nothing was changed.',
  tracking: 'The tracking details were not saved. Try again.',
  note: 'The note was not saved. Try again.',
}

function one(raw: string | string[] | undefined): string {
  const value = Array.isArray(raw) ? raw[0] : raw
  return value ?? ''
}

function stamp(iso: string | null): string {
  if (!iso) return ''
  const date = formatDateLong(iso.slice(0, 10))
  const time = iso.slice(11, 16)
  return time ? `${date} · ${time} UTC` : date
}

type Line = { label: string; value: ReactNode; mono?: boolean }

function Lines({ lines }: { lines: Line[] }) {
  return (
    <dl className="aor-lines">
      {lines.map((line) => (
        <div className="aor-line" key={line.label}>
          <dt className="label aor-line__label">{line.label}</dt>
          <dd className={`aor-line__value${line.mono ? ' aor-line__value--mono' : ''}`}>
            {line.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}

export default async function AdminCustomerOrderPage({
  params,
  searchParams,
}: PageProps) {
  await requireAdmin()

  const { id } = await params
  const read = await getCustomerOrder(id)

  if (!read.ok) {
    return (
      <>
        <header className="ad-head">
          <div className="ad-head__strip" aria-hidden="true">
            <span className="mono ad-head__chan">15</span>
            <span className="ad-head__rule" />
            <span className="label">Customer order</span>
          </div>
          <div className="ad-head__title">
            <h1 className="ad-head__h">Customer order</h1>
          </div>
        </header>

        <section className="ad-panel" aria-labelledby="au-offline">
          <div className="ad-panel__head">
            <span className="label" id="au-offline">
              Customer accounts are not switched on
            </span>
          </div>
          <div className="ad-panel__body">
            <p className="au-setup">{read.error}</p>
            <p className="au-setup__note">
              This order cannot be read because the accounts database cannot be reached,
              not because it is missing.
            </p>
          </div>
        </section>
      </>
    )
  }

  if (!read.value) notFound()

  const { order, items, payments, customer } = read.value
  const query = await searchParams

  const symbol = currencySymbol(order.currency)
  const things = itemCount(items)
  const waiting = order.order_status === 'pending'
  const tracking = safeUrl(order.tracking_url)

  // Post-then-redirect: the action sends the browser back here with one word
  // saying what landed. Anything else in the parameter says nothing at all.
  const done = one(query.done)
  const problem = PROBLEM[one(query.problem)] ?? ''

  const placed = new Date(order.created_at)
  const since = Number.isNaN(placed.getTime()) ? '' : timeAgo(placed)

  // Only the subject is encoded: the address came through the checkout schema,
  // and percent-encoding the @ helps no mail client anywhere.
  const replyHref = `mailto:${order.email}?subject=${encodeURIComponent(
    `Your order ${order.reference}`,
  )}`

  const who: Line[] = [
    {
      label: 'Account',
      value: customer ? (
        <Link className="link" href={`/admin/users/${customer.id}`}>
          {customer.fullName.trim() || customer.username || customer.email}
        </Link>
      ) : (
        'Guest — this order was placed without an account'
      ),
    },
    { label: 'Name on the order', value: order.customer_name.trim() || 'Not given' },
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
    who.push({
      label: 'Phone',
      value: (
        <a className="link" href={`tel:${order.phone.replace(/[^\d+]/g, '')}`}>
          {order.phone}
        </a>
      ),
      mono: true,
    })
  }

  if (order.shipping_address.trim()) {
    who.push({
      label: 'Deliver to',
      // Plain text, and it stays plain: the line breaks the customer typed are
      // the only formatting this ever gets.
      value: <span className="aor-address">{order.shipping_address}</span>,
    })
  }

  who.push({ label: 'Placed', value: stamp(order.created_at), mono: true })

  return (
    <>
      <header className="ad-head">
        <div className="ad-head__strip" aria-hidden="true">
          <span className="mono ad-head__chan">15</span>
          <span className="ad-head__rule" />
          <span className="label">Customer order</span>
        </div>
        <div className="ad-head__title">
          <h1 className="ad-head__h mono aor-head__ref">{order.reference}</h1>
          <p className="mono aor-head__meta">
            {order.customer_name.trim() || order.email} ·{' '}
            {formatMoney(order.total_amount, symbol)} ·{' '}
            {orderStatusWord(order.order_status)}
          </p>
          <p className="ad-head__intro">
            {since ? `Placed ${since}. ` : ''}Nothing on this screen is public, and
            nothing you change here emails anyone.
          </p>
        </div>
        <div className="ad-head__aside">
          <a className="btn ad-btn--primary" href={replyHref}>
            Email the customer
          </a>
          <Link href="/admin/customer-orders" className="btn btn--sm btn--ghost">
            All customer orders
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
          <p className="mono aor-banner__reason">
            {order.notify_error.trim() || 'No reason was recorded for the failure.'}
          </p>
        </div>
      )}

      {problem ? (
        <p className="ad-formerror" role="alert">
          {problem}
        </p>
      ) : null}

      <section className="ad-panel" aria-labelledby="aor-items">
        <div className="ad-panel__head">
          <span className="label" id="aor-items">
            What they bought
          </span>
          <span className="mono aor-count">
            {things} {pluralise(things, 'item')}
          </span>
        </div>
        <div className="ad-panel__body">
          <p className="aor-note">Prices are as they were when the order was placed.</p>

          {items.length === 0 ? (
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
                {items.map((item) => (
                  <li className="aor-item" key={item.id}>
                    <span className="mono aor-item__qty">
                      {item.quantity}
                      <span className="vh"> × </span>
                    </span>

                    <span className="aor-item__body">
                      <span className="aor-item__title">{item.product_name}</span>
                      {item.variant_label ? (
                        <span className="mono aor-item__variant">
                          {item.variant_label}
                        </span>
                      ) : null}
                    </span>

                    <span className="mono aor-item__unit">
                      {formatMoney(item.unit_price, symbol)}
                    </span>

                    <span className="mono aor-item__total">
                      {formatMoney(lineTotal(item), symbol)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}

          <dl className="aor-totals">
            <div className="aor-total">
              <dt className="label">Subtotal</dt>
              <dd className="mono">{formatMoney(order.subtotal_amount, symbol)}</dd>
            </div>
            <div className="aor-total">
              <dt className="label">Shipping</dt>
              <dd className="mono">{formatMoney(order.shipping_amount, symbol)}</dd>
            </div>
            <div className="aor-total aor-total--grand">
              <dt className="label">Total</dt>
              <dd className="mono">
                {formatMoney(order.total_amount, symbol)}
                <span className="aor-total__ccy"> {order.currency}</span>
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="ad-panel" aria-labelledby="au-who">
        <div className="ad-panel__head">
          <span className="label" id="au-who">
            Who to send it to
          </span>
          {customer ? null : <span className="ad-badge au-chip">Guest</span>}
        </div>
        <div className="ad-panel__body">
          <Lines lines={who} />
        </div>
      </section>

      <section className="ad-panel" aria-labelledby="au-payments">
        <div className="ad-panel__head">
          <span className="label" id="au-payments">
            Payments
          </span>
          <span className="mono aor-count">
            {payments.length} {pluralise(payments.length, 'attempt')}
          </span>
        </div>
        <div className="ad-panel__body">
          <p className="aor-note">
            One row per attempt, written by the payment provider — a retry is a second row
            rather than a rewritten one. Nothing on this screen adds to this list.
          </p>

          {payments.length === 0 ? (
            <p className="aor-note">
              No attempt has been recorded. A free order never has one, and neither does
              an order settled by hand.
            </p>
          ) : (
            <ul className="au-pays">
              {payments.map((payment) => (
                <li className="au-pay" key={payment.id}>
                  <span className="au-pay__main">
                    <span className="au-pay__who">
                      {payment.payment_provider || 'Unknown provider'}
                    </span>
                    <span className="mono au-pay__txn">
                      {payment.transaction_id || 'No transaction id'}
                    </span>
                    {payment.failure_reason.trim() ? (
                      <span className="au-pay__why">{payment.failure_reason}</span>
                    ) : null}
                  </span>

                  <span className="mono au-pay__sum">
                    {formatMoney(payment.amount, currencySymbol(payment.currency))}
                  </span>

                  <span className="au-pay__flags">
                    <span className="ad-badge au-chip">
                      {paymentStatusWord(payment.payment_status)}
                    </span>
                    <span className="mono aor-row__ago">{stamp(payment.created_at)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="ad-panel" aria-labelledby="au-state">
        <div className="ad-panel__head">
          <span className="label" id="au-state">
            Where it has got to
          </span>
          {waiting ? (
            <span className="ad-badge ad-badge--new">Awaiting payment</span>
          ) : null}
        </div>
        <div className="ad-panel__body">
          <p className="aor-note">
            The customer sees this on their own order page. It sends nothing to anyone,
            and it moves no stock — the stock counts live in the catalogue database, which
            these orders do not touch.
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
                  aria-pressed={order.order_status === status}
                >
                  {orderStatusWord(status)}
                </button>
              </form>
            ))}
          </div>
        </div>
      </section>

      <section className="ad-panel" aria-labelledby="au-money">
        <div className="ad-panel__head">
          <span className="label" id="au-money">
            Whether the money arrived
          </span>
          <span className="mono aor-count">
            {paymentStatusWord(order.payment_status)}
          </span>
        </div>
        <div className="ad-panel__body">
          <p className="aor-note">
            Kept apart from the status above on purpose: an order can be paid and not yet
            posted, or posted and later refunded. This is the figure the dashboard counts
            as revenue.
          </p>

          <div
            className="aor-states"
            role="group"
            aria-label={`Payment status of order ${order.reference}`}
          >
            {PAYMENT_STATUSES.map((status) => (
              <form key={status} action={setPaymentStatus.bind(null, order.id, status)}>
                <button
                  type="submit"
                  className="btn btn--sm aor-state"
                  aria-pressed={order.payment_status === status}
                >
                  {paymentStatusWord(status)}
                </button>
              </form>
            ))}
          </div>
        </div>
      </section>

      {/* Ordinary form posts, each with its own action. No client component and
          no JS: the page comes back with the values it saved. */}
      <form className="ad-form au-form" action={saveTracking}>
        <input type="hidden" name="orderId" value={order.id} />

        <section className="ad-panel" aria-labelledby="au-tracking">
          <div className="ad-panel__head">
            <span className="label" id="au-tracking">
              Tracking
            </span>
            {tracking ? (
              <a
                className="mono aor-count au-track__link"
                href={tracking}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open the tracking page
                <span className="vh"> (opens in a new tab)</span>
              </a>
            ) : null}
          </div>

          <div className="ad-panel__body">
            <p className="aor-note">
              Shown to the customer on their own order page. Saving it emails nobody —
              write to them from the button at the top if they should know.
            </p>

            <div className="ad-cols">
              <Field
                label="Tracking number"
                htmlFor="trackingNumber"
                hint="Whatever the courier calls it. Left blank, the customer is shown nothing."
              >
                <TextInput
                  id="trackingNumber"
                  name="trackingNumber"
                  defaultValue={order.tracking_number}
                  maxLength={200}
                />
              </Field>

              <Field
                label="Tracking link"
                htmlFor="trackingUrl"
                hint="The courier's page for this parcel. Anything that is not a web address is stored but never linked."
              >
                <TextInput
                  id="trackingUrl"
                  name="trackingUrl"
                  type="url"
                  defaultValue={order.tracking_url}
                  maxLength={500}
                  placeholder="https://"
                />
              </Field>
            </div>

            <Field
              label="Delivered on"
              htmlFor="deliveredOn"
              hint="The day it arrived. Clear it to say it has not."
            >
              <TextInput
                id="deliveredOn"
                name="deliveredOn"
                type="date"
                defaultValue={order.delivered_at ? order.delivered_at.slice(0, 10) : ''}
              />
            </Field>

            <div className="au-save">
              <button type="submit" className="btn ad-btn--primary">
                Save tracking
              </button>
              <p className="ad-status mono" role="status">
                {done === 'tracking' ? DONE.tracking : ''}
              </p>
            </div>
          </div>
        </section>
      </form>

      <form className="ad-form au-form" action={saveOrderNote}>
        <input type="hidden" name="orderId" value={order.id} />

        <section className="ad-panel" aria-labelledby="au-note">
          <div className="ad-panel__head">
            <span className="label" id="au-note">
              Your note
            </span>
            <span className="mono aor-count">Private</span>
          </div>

          <div className="ad-panel__body">
            <Field
              label="Note to yourself"
              htmlFor="adminNote"
              hint="Only you see this. It is never emailed, never shown to the customer, and never on the site. What went in the box, why it was refunded."
            >
              <TextArea
                id="adminNote"
                name="adminNote"
                defaultValue={order.admin_note}
                rows={5}
                maxLength={4000}
              />
            </Field>

            <div className="au-save">
              <button type="submit" className="btn ad-btn--primary">
                Save note
              </button>
              <p className="ad-status mono" role="status">
                {done === 'note' ? DONE.note : ''}
              </p>
            </div>
          </div>
        </section>
      </form>

      {/* Its own form, and it has to be: a submit button inside the note form
          would post the note form, and a nested <form> is invalid HTML that the
          browser silently drops. */}
      <form className="aor-danger" action={deleteOrder.bind(null, order.id)}>
        <p className="aor-danger__text">
          Deleting removes this order, its lines, its payment rows and its note for good.
          Nothing is archived, the customer is not told, and it disappears from their own
          order history too. Mark it cancelled or refunded instead if it happened and went
          wrong — that is what those states are for.
        </p>
        <DangerButton confirmLabel="Delete it">
          Delete order
          <span className="vh"> {order.reference}</span>
        </DangerButton>
      </form>
    </>
  )
}
