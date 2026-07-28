import type { Metadata } from 'next'
import Link from 'next/link'
import { listCustomerOrders } from '@/lib/admin-users-queries'
import { formatMoney, pluralise, timeAgo } from '@/lib/format'
import {
  currencySymbol,
  orderStatusWord,
  paymentStatusWord,
  readOrderStatus,
  ORDER_STATUSES,
} from '@/lib/orders/store'
import { requireAdmin } from '@/lib/session'

import '@/styles/admin-events.css'
import '@/styles/admin-users.css'

/* ==========================================================================
   Customer orders.

   THE SAME SCREEN AS /admin/orders, READING A DIFFERENT DATABASE. That is not
   an accident and it is not duplication for its own sake:

     · /admin/orders is the SQLite store. It is what the shop wrote before
       customer accounts existed, and every order taken up to that point is
       still in it. Those rows are not going to move themselves
     · /admin/customer-orders is Postgres. It is where checkout writes now, it
       is what a signed-in customer reads under /account, and it is the only one
       of the two that knows which account an order belongs to

   Both are real, both hold money, and neither is a copy of the other — so the
   client is shown both, named for what they are. The shape is deliberately
   identical: the reference leads the row, the filter is a query string, an
   order awaiting payment is marked with a lamp hairline, and an order whose
   email did not go out says so in red. One screen learned twice.

   WHEN SUPABASE IS NOT CONFIGURED this page says which keys are missing rather
   than drawing an empty table. /admin/orders keeps working either way.
   ========================================================================== */

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Customer orders',
  robots: { index: false, follow: false },
}

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function readText(raw: string | string[] | undefined): string {
  const value = Array.isArray(raw) ? raw[0] : raw
  return (value ?? '').trim().slice(0, 120)
}

/** A send failure can be a whole SMTP transcript. One line of it, on the row. */
function shorten(reason: string, max = 120): string {
  const clean = reason.replace(/\s+/g, ' ').trim()
  if (!clean) return ''
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`
}

export default async function AdminCustomerOrdersPage({ searchParams }: PageProps) {
  await requireAdmin()

  const params = await searchParams
  const term = readText(params.q)
  const active = readOrderStatus(params.status)

  const read = await listCustomerOrders({ q: term, status: active })

  function tabHref(status: string | null): string {
    const query = new URLSearchParams()
    if (status) query.set('status', status)
    if (term) query.set('q', term)
    const suffix = query.toString()
    return suffix ? `/admin/customer-orders?${suffix}` : '/admin/customer-orders'
  }

  const head = (
    <header className="ad-head">
      <div className="ad-head__strip" aria-hidden="true">
        <span className="mono ad-head__chan">15</span>
        <span className="ad-head__rule" />
        <span className="label">Customer orders</span>
      </div>
      <div className="ad-head__title">
        <h1 className="ad-head__h">Customer orders</h1>
        <p className="ad-head__intro">
          Orders placed through the accounts system, newest first — the ones a customer
          can see under their own account. Orders taken before accounts existed are on the
          Orders screen and are not repeated here.
        </p>
      </div>
    </header>
  )

  if (!read.ok) {
    return (
      <>
        {head}
        <section className="ad-panel" aria-labelledby="au-offline">
          <div className="ad-panel__head">
            <span className="label" id="au-offline">
              Customer accounts are not switched on
            </span>
          </div>
          <div className="ad-panel__body">
            <p className="au-setup">{read.error}</p>
            <p className="au-setup__note">
              No order has been lost. Until these keys are set, checkout does not write
              here at all — the Orders screen is the one holding everything the shop has
              taken.
            </p>
          </div>
        </section>
      </>
    )
  }

  const { orders, counts, total, capped, unsent } = read.value

  return (
    <>
      {head}

      <form
        className="au-search"
        action="/admin/customer-orders"
        method="get"
        role="search"
      >
        <div className="au-search__field">
          <label className="label au-search__label" htmlFor="au-oq">
            Search orders
          </label>
          <input
            className="ad-input au-search__input"
            id="au-oq"
            name="q"
            type="search"
            defaultValue={term}
            maxLength={120}
            placeholder="Reference or email"
          />
        </div>

        {active ? <input type="hidden" name="status" value={active} /> : null}

        <div className="au-search__tools">
          <button type="submit" className="btn btn--sm">
            Search
          </button>
          {term ? (
            <Link
              href={
                active
                  ? `/admin/customer-orders?status=${active}`
                  : '/admin/customer-orders'
              }
              className="btn btn--sm btn--ghost"
            >
              Clear
            </Link>
          ) : null}
        </div>
      </form>

      <nav className="aor-tabs" aria-label="Filter orders by status">
        <Link
          href={tabHref(null)}
          className="aor-tab"
          aria-current={active === null ? 'page' : undefined}
        >
          All
          <span className="aor-tab__n">{counts.all}</span>
        </Link>
        {ORDER_STATUSES.map((status) => (
          <Link
            key={status}
            href={tabHref(status)}
            className="aor-tab"
            aria-current={active === status ? 'page' : undefined}
          >
            {orderStatusWord(status)}
            <span className="aor-tab__n">{counts[status]}</span>
          </Link>
        ))}
      </nav>

      <section className="ad-panel" aria-labelledby="au-orders">
        <div className="ad-panel__head">
          <span className="label" id="au-orders">
            {active ? orderStatusWord(active) : term ? 'Search results' : 'All orders'}
          </span>
          <span className="mono aor-count">
            {orders.length} {pluralise(orders.length, 'order')} · {counts.pending}{' '}
            awaiting payment
            {unsent > 0 ? ` · ${unsent} with no email sent` : ''}
            {capped ? ' · newest 500 read' : ''}
          </span>
        </div>

        <div className="ad-panel__body">
          {orders.length === 0 ? (
            <div className="empty">
              <p className="empty__title">
                {term && counts.all === 0
                  ? 'Nothing matches that search.'
                  : active
                    ? `Nothing marked ${orderStatusWord(active).toLowerCase()}`
                    : 'No orders yet'}
              </p>
              <p className="empty__text">
                {term && counts.all === 0
                  ? 'References and email addresses are searched. Clear the search to see everything.'
                  : active
                    ? `The other tabs hold ${counts.all} ${pluralise(
                        counts.all,
                        'order',
                      )}. Choose All to see everything.`
                    : `They will appear here the moment somebody buys something. ${total} ${pluralise(
                        total,
                        'order is',
                        'orders are',
                      )} on the database.`}
              </p>
            </div>
          ) : (
            <ul className="ad-table">
              {orders.map((order) => {
                const symbol = currencySymbol(order.currency)
                const waiting = order.order_status === 'pending'
                const reason = shorten(order.notify_error)
                const when = new Date(order.created_at)

                return (
                  <li
                    className="ad-row aor-row"
                    key={order.id}
                    data-wait={waiting ? 'true' : undefined}
                  >
                    <div className="aor-row__main">
                      <Link
                        href={`/admin/customer-orders/${order.id}`}
                        className="mono aor-row__ref"
                      >
                        {order.reference}
                      </Link>
                      <span className="aor-row__who">
                        {order.customer_name.trim() || 'No name given'}
                        {order.user_id ? '' : ' · Guest'}
                      </span>
                      <a className="mono aor-row__mail" href={`mailto:${order.email}`}>
                        {order.email}
                      </a>
                    </div>

                    <span className="mono ad-row__meta aor-row__meta">
                      <span className="aor-row__total">
                        {formatMoney(order.total_amount, symbol)}
                      </span>
                      <span>
                        {order.itemCount} {pluralise(order.itemCount, 'item')}
                      </span>
                    </span>

                    <span className="aor-row__flags">
                      <span className="ad-badge au-chip">
                        {paymentStatusWord(order.payment_status)}
                      </span>
                      <span className={`ad-badge${waiting ? ' ad-badge--new' : ''}`}>
                        {orderStatusWord(order.order_status)}
                      </span>
                      <span className="mono aor-row__ago">
                        {Number.isNaN(when.getTime()) ? '' : timeAgo(when)}
                      </span>
                    </span>

                    {order.notified ? null : (
                      <p className="aor-warn aor-row__warn">
                        <span className="label aor-warn__tag">No email sent</span>
                        <span className="aor-warn__text">
                          Saved and charged as normal, but no email was sent. The order
                          itself is safe.
                        </span>
                        {reason ? (
                          <span className="mono aor-warn__reason">{reason}</span>
                        ) : null}
                      </p>
                    )}

                    <span className="ad-row__tools">
                      <Link
                        href={`/admin/customer-orders/${order.id}`}
                        className="btn btn--sm"
                        aria-label={`Open order ${order.reference}`}
                      >
                        Open
                      </Link>
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </section>
    </>
  )
}
