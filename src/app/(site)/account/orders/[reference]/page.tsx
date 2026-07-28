import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { getAccount, getMyOrder } from '@/lib/account/queries'
import { formatDateLong, formatMoney, pluralise } from '@/lib/format'
import { safeUrl } from '@/lib/markdown'
import {
  currencySymbol,
  lineTotal,
  orderStatusWord,
  orderStepIndex,
  paymentStatusWord,
  principalPayment,
  ORDER_STEPS,
} from '@/lib/orders/store'
import { accountsEnabled } from '@/lib/supabase/config'
import type { OrderStatus } from '@/lib/supabase/types'

import '@/styles/orders.css'

/* ==========================================================================
   /account/orders/<reference> — one order, in full.

   NOT THIS CUSTOMER'S ORDER IS notFound(), NOT A 403
   getMyOrder reads through the customer's own client, so row level security
   already makes another person's order unreadable — this page cannot show it
   even if the reference is guessed correctly. What is left to decide is what
   to SAY, and the answer is 404: a 403 would confirm that the reference exists
   and belongs to somebody, which is a fact worth nothing to the person asking
   and something to the person guessing.

   The progress strip is the honest part of this page. It shows where the order
   has got to and does not invent a step it has not reached, and an order that
   was cancelled or refunded gets a sentence instead — a timeline with three
   grey steps ahead of it would be a picture of something that will never
   happen.
   ========================================================================== */

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Your order',
  robots: { index: false, follow: false },
}

export default async function AccountOrderPage({
  params,
}: {
  params: Promise<{ reference: string }>
}) {
  if (!accountsEnabled()) return null

  const { reference } = await params

  const account = await getAccount()
  if (!account) redirect(`/login?next=/account/orders/${reference}`)

  const order = await getMyOrder(account.user.id, reference)
  if (!order) notFound()

  const symbol = currencySymbol(order.currency)
  const step = orderStepIndex(order.order_status)
  const payment = principalPayment(order.payments)
  const things = order.items.reduce((sum, item) => sum + item.quantity, 0)
  const tracking = safeUrl(order.tracking_url)

  return (
    <section className="ac-panel">
      <div className="ac-panel__strip" aria-hidden="true">
        <span className="mono ac-panel__chan">01</span>
        <span className="ac-panel__rule" />
        <span className="label ac-panel__strip-label">Order</span>
      </div>

      <h2 className="ac-panel__title">
        <span className="mono">{order.reference}</span>
      </h2>
      <p className="ac-panel__text">
        Placed {formatDateLong(order.created_at.slice(0, 10))} · {things}{' '}
        {pluralise(things, 'item')} · {formatMoney(order.total_amount, symbol)}
      </p>

      {step === null ? (
        <Stopped status={order.order_status} />
      ) : (
        <ol className="or-steps">
          {ORDER_STEPS.map((word, index) => {
            const state = index < step ? 'done' : index === step ? 'now' : 'ahead'
            return (
              <li key={word} className="or-step" data-state={state}>
                <span className="or-step__mark" aria-hidden="true" />
                <span className="label or-step__word">
                  {word}
                  {state === 'now' ? (
                    <span className="vh"> — where it is now</span>
                  ) : null}
                </span>
              </li>
            )
          })}
        </ol>
      )}

      {/* ---- what is in it ---- */}

      <h3 className="label ac-panel__foot" id="order-lines">
        What is in it
      </h3>

      <ul className="or-lines" aria-labelledby="order-lines">
        {order.items.map((item) => (
          <li key={item.id} className="or-line">
            <p className="or-line__title">
              <span className="mono">{item.quantity}×</span> {item.product_name}
              {item.variant_label ? (
                <span className="or-line__variant"> · {item.variant_label}</span>
              ) : null}
            </p>
            <p className="mono or-line__unit">
              {formatMoney(item.unit_price, symbol)} each
            </p>
            <p className="or-line__money">{formatMoney(lineTotal(item), symbol)}</p>
          </li>
        ))}
      </ul>

      <dl className="or-sums">
        <div className="or-sum">
          <dt className="label">Subtotal</dt>
          <dd>{formatMoney(order.subtotal_amount, symbol)}</dd>
        </div>
        {order.shipping_amount > 0 ? (
          <div className="or-sum">
            <dt className="label">Postage</dt>
            <dd>{formatMoney(order.shipping_amount, symbol)}</dd>
          </div>
        ) : null}
        <div className="or-sum or-sum--total">
          <dt className="label">Total</dt>
          <dd>{formatMoney(order.total_amount, symbol)}</dd>
        </div>
      </dl>

      {/* ---- where it is going ---- */}

      {order.shipping_address ? (
        <>
          <h3 className="label ac-panel__foot">Posting to</h3>
          <p className="or-ship">{order.shipping_address}</p>
        </>
      ) : null}

      {order.tracking_number ? (
        <div className="or-track">
          <p className="label or-track__label">Tracking</p>
          <p className="mono or-track__no">{order.tracking_number}</p>
          {tracking ? (
            <p className="or-track__text">
              <a
                className="link"
                href={tracking}
                rel="noopener noreferrer"
                target="_blank"
              >
                Track this parcel
                <span className="vh"> — opens the courier&rsquo;s site in a new tab</span>
              </a>
            </p>
          ) : (
            <p className="or-track__text">
              Quote that number to the courier to see where the parcel is.
            </p>
          )}
          {order.delivered_at ? (
            <p className="or-track__text">
              Delivered {formatDateLong(order.delivered_at.slice(0, 10))}.
            </p>
          ) : null}
        </div>
      ) : null}

      {/* ---- what was paid, and how ---- */}

      <h3 className="label ac-panel__foot">Payment</h3>

      <dl className="ac-rows">
        <Row label="Status">{paymentStatusWord(order.payment_status)}</Row>
        <Row label="Order">{orderStatusWord(order.order_status)}</Row>

        {payment ? (
          <>
            <Row label="Taken by">
              {payment.payment_provider === 'stripe'
                ? 'Stripe'
                : payment.payment_provider === 'none'
                  ? 'Nothing to pay'
                  : payment.payment_provider}
            </Row>
            <Row label="Amount">
              <span className="mono">{formatMoney(payment.amount, symbol)}</span>
            </Row>
            {payment.transaction_id ? (
              <Row label="Reference">
                <span className="mono ac-row__val--ref">{payment.transaction_id}</span>
              </Row>
            ) : null}
            {payment.failure_reason ? (
              <Row label="What went wrong">{payment.failure_reason}</Row>
            ) : null}
          </>
        ) : (
          <Row label="Record">
            {order.payment_status === 'unpaid'
              ? 'Nothing has been taken for this order yet.'
              : 'No payment attempt is recorded against this order.'}
          </Row>
        )}
      </dl>

      <div className="or-foot">
        <a className="btn btn--sm" href={`/api/invoice/${order.reference}`}>
          Download invoice
        </a>
        <Link className="link" href="/account/orders">
          All your orders
        </Link>
      </div>
    </section>
  )
}

/* --------------------------------------------------------------------------
   Furniture
   -------------------------------------------------------------------------- */

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="ac-row">
      <dt className="label ac-row__key">{label}</dt>
      <dd className="ac-row__val">{children}</dd>
    </div>
  )
}

/** The two statuses that leave the line rather than stopping part way along it. */
function Stopped({ status }: { status: OrderStatus }) {
  const refunded = status === 'refunded'

  return (
    <div className="or-stopped">
      <p className="label or-stopped__label">{orderStatusWord(status)}</p>
      <p className="or-stopped__text">
        {refunded
          ? 'This order was refunded. The money has gone back to the card it came from, which can take a few days to appear on a statement.'
          : 'This order was cancelled, so nothing was sent and nothing further will be taken. Anything already paid has been returned.'}
      </p>
      <p className="or-stopped__text">
        <Link className="link" href="/contact">
          Write to us
        </Link>{' '}
        if that is not what you expected.
      </p>
    </div>
  )
}
