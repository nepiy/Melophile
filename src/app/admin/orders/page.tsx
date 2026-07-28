import type { Metadata } from 'next'
import Link from 'next/link'
import { ORDER_STATUSES, type OrderStatus } from '@/db'
import { listOrders, orderCounts } from '@/lib/admin-events-queries'
import { getStorePageForEdit } from '@/lib/admin-store-queries'
import { formatMoney, orderStatusLabel, pluralise, timeAgo } from '@/lib/format'
import { requireAdmin } from '@/lib/session'

import '@/styles/admin-events.css'

/* ==========================================================================
   Orders.

   This is the one screen in the admin that is about money that has already
   moved, so it is built to be trusted at a glance rather than studied.

   Newest first, everything by default. The reference leads the row because
   that is what a customer reads down a phone — it is the only string on the
   screen the client will ever be asked to match against something a stranger
   is holding.

   An order still waiting on payment is the one that needs attention, and it is
   marked the way a new booking is: the badge and a lamp hairline down the left
   of the row.

   The one thing this screen must never do is imply a receipt went out when it
   did not. `notified === false` puts a red-hairlined warning on the row with
   the reason, truncated here and in full on the order itself.
   ========================================================================== */

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Orders',
  robots: { index: false, follow: false },
}

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const TABS: { value: OrderStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  ...ORDER_STATUSES.map((status) => ({
    value: status,
    label: orderStatusLabel(status),
  })),
]

const STATUS_VALUES: readonly string[] = ORDER_STATUSES

/** Nothing reaches a query until it is one of the five the schema names. */
function readStatus(raw: string | string[] | undefined): OrderStatus | null {
  const value = Array.isArray(raw) ? raw[0] : raw
  if (!value || !STATUS_VALUES.includes(value)) return null
  return value as OrderStatus
}

/** A send failure can be a whole SMTP transcript. One line of it, on the row. */
function shorten(reason: string, max = 120): string {
  const clean = reason.replace(/\s+/g, ' ').trim()
  if (!clean) return ''
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`
}

export default async function AdminOrdersPage({ searchParams }: PageProps) {
  await requireAdmin()

  const active = readStatus((await searchParams).status)
  const [counts, list, page] = await Promise.all([
    orderCounts(),
    listOrders(active ?? undefined),
    getStorePageForEdit(),
  ])

  const symbol = page?.currencySymbol || '£'
  const unsent = list.filter((order) => !order.notified).length

  // An empty list means two different things. A filter with nothing under it is
  // not an empty ledger, and saying "no orders yet" while there are eleven on
  // another tab would be a lie the screen tells about itself.
  const emptyFilter = counts.all > 0 ? active : null

  return (
    <>
      <header className="ad-head">
        <div className="ad-head__strip" aria-hidden="true">
          <span className="mono ad-head__chan">13</span>
          <span className="ad-head__rule" />
          <span className="label">Orders</span>
        </div>
        <div className="ad-head__title">
          <h1 className="ad-head__h">Orders</h1>
          <p className="ad-head__intro">
            Everything the store has taken, newest first. Nothing here is on the public
            site. The reference is what the customer quotes — open an order to read the
            lines, change what it is marked as, and reply.
          </p>
        </div>
      </header>

      <nav className="aor-tabs" aria-label="Filter orders by status">
        {TABS.map((tab) => {
          const current = tab.value === 'all' ? active === null : active === tab.value
          return (
            <Link
              key={tab.value}
              href={
                tab.value === 'all'
                  ? '/admin/orders'
                  : `/admin/orders?status=${tab.value}`
              }
              className="aor-tab"
              aria-current={current ? 'page' : undefined}
            >
              {tab.label}
              <span className="aor-tab__n">{counts[tab.value]}</span>
            </Link>
          )
        })}
      </nav>

      <section className="ad-panel" aria-labelledby="orders-heading">
        <div className="ad-panel__head">
          <span className="label" id="orders-heading">
            {active ? orderStatusLabel(active) : 'All orders'}
          </span>
          <span className="mono aor-count">
            {list.length} {pluralise(list.length, 'order')} · {counts.pending} awaiting
            payment
            {unsent > 0 ? ` · ${unsent} with no email sent` : ''}
          </span>
        </div>

        <div className="ad-panel__body">
          {list.length === 0 ? (
            <div className="empty">
              <p className="empty__title">
                {emptyFilter
                  ? `Nothing marked ${orderStatusLabel(emptyFilter).toLowerCase()}`
                  : 'No orders yet'}
              </p>
              <p className="empty__text">
                {emptyFilter
                  ? `The other tabs hold ${counts.all} ${pluralise(
                      counts.all,
                      'order',
                    )}. Choose All to see everything.`
                  : 'They will appear here the moment someone buys something.'}
              </p>
            </div>
          ) : (
            <ul className="ad-table">
              {list.map((order) => {
                const reason = shorten(order.notifyError)
                const waiting = order.status === 'pending'
                const items = order.items.reduce((sum, item) => sum + item.quantity, 0)

                return (
                  <li
                    className="ad-row aor-row"
                    key={order.id}
                    data-wait={waiting ? 'true' : undefined}
                  >
                    <div className="aor-row__main">
                      <Link
                        href={`/admin/orders/${order.id}`}
                        className="mono aor-row__ref"
                      >
                        {order.reference}
                      </Link>
                      <span className="aor-row__who">{order.name}</span>
                      <a className="mono aor-row__mail" href={`mailto:${order.email}`}>
                        {order.email}
                      </a>
                    </div>

                    <span className="mono ad-row__meta aor-row__meta">
                      <span className="aor-row__total">
                        {formatMoney(order.totalCents, symbol)}
                      </span>
                      <span>
                        {items} {pluralise(items, 'item')}
                      </span>
                    </span>

                    <span className="aor-row__flags">
                      <span className={`ad-badge${waiting ? ' ad-badge--new' : ''}`}>
                        {orderStatusLabel(order.status)}
                      </span>
                      <span className="mono aor-row__ago">
                        {timeAgo(order.createdAt)}
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
                        href={`/admin/orders/${order.id}`}
                        className="btn btn--sm"
                        aria-label={`Open order ${order.reference} from ${order.name}`}
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
