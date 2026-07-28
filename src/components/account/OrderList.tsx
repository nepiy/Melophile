import Link from 'next/link'
import {
  currencySymbol,
  itemCount,
  orderStatusWord,
  paymentStatusWord,
  ORDER_STATUSES,
  type FullOrder,
} from '@/lib/orders/store'
import { formatDateLong, formatMoney, pluralise } from '@/lib/format'
import type { OrderStatus, PaymentStatus } from '@/lib/supabase/types'

/* ==========================================================================
   The customer's own order history, as a ledger.

   A SERVER COMPONENT ON PURPOSE, AND THE FILTER IS A LINK
   The status filter is a set of links carrying `?status=`, not a client-side
   toggle. It costs no JavaScript, every filtered view has its own address a
   customer can bookmark or send to us, and it keeps working with scripting
   off. The admin's order screen filters exactly the same way.

   The rows are given to it already read under row level security — this
   component never queries anything, so there is no path through it that could
   return somebody else's order.
   ========================================================================== */

/** Lamp for good news, peak for a stop, plain for everything in between. */
function orderTone(status: OrderStatus): 'lamp' | 'peak' | undefined {
  if (status === 'cancelled' || status === 'refunded') return 'peak'
  if (status === 'paid' || status === 'delivered') return 'lamp'
  return undefined
}

function paymentTone(status: PaymentStatus): 'lamp' | 'peak' | undefined {
  if (status === 'failed') return 'peak'
  if (status === 'paid') return 'lamp'
  return undefined
}

export function OrderList({
  orders,
  active,
}: {
  /** Newest first, already filtered to this customer by Postgres itself. */
  orders: FullOrder[]
  /** The status being shown, or null for everything. */
  active: OrderStatus | null
}) {
  const shown = active ? orders.filter((order) => order.order_status === active) : orders

  // An empty list means two different things, and saying "no orders yet" while
  // there are four on another tab would be a lie the page tells about itself.
  const filteredEmpty = orders.length > 0 && shown.length === 0

  return (
    <>
      {orders.length > 0 ? (
        <nav className="or-filters" aria-label="Filter orders by status">
          <div className="or-filters__list">
            <Filter
              href="/account/orders"
              label="All"
              n={orders.length}
              current={!active}
            />
            {ORDER_STATUSES.map((status) => {
              const n = orders.filter((order) => order.order_status === status).length
              if (n === 0) return null
              return (
                <Filter
                  key={status}
                  href={`/account/orders?status=${status}`}
                  label={orderStatusWord(status)}
                  n={n}
                  current={active === status}
                />
              )
            })}
          </div>
        </nav>
      ) : null}

      {shown.length === 0 ? (
        <div className="ac-empty">
          <p className="ac-empty__title">
            {filteredEmpty ? 'Nothing at that status' : 'No orders yet'}
          </p>
          <p className="ac-empty__text">
            {filteredEmpty
              ? `The other tabs hold ${orders.length} ${pluralise(orders.length, 'order')}. Choose All to see everything.`
              : 'Records, beats, merch and tickets all land here the moment you buy one, with the reference and everything that happens to it after.'}
          </p>
          <div className="ac-empty__actions">
            <Link
              className="btn btn--sm"
              href={filteredEmpty ? '/account/orders' : '/store'}
            >
              {filteredEmpty ? 'Show every order' : 'Have a look at the store'}
            </Link>
          </div>
        </div>
      ) : (
        <ul className="or-list">
          {shown.map((order) => {
            const symbol = currencySymbol(order.currency)
            const things = itemCount(order.items)

            return (
              <li key={order.id} className="or-row">
                <div className="or-row__main">
                  <Link
                    className="mono or-row__ref"
                    href={`/account/orders/${order.reference}`}
                  >
                    {order.reference}
                  </Link>

                  <p className="mono or-row__meta">
                    <span>{formatDateLong(order.created_at.slice(0, 10))}</span>
                    <span>
                      {things} {pluralise(things, 'item')}
                    </span>
                  </p>
                </div>

                <div className="or-row__side">
                  <span className="or-row__total">
                    {formatMoney(order.total_amount, symbol)}
                  </span>

                  <span className="or-chips">
                    <span
                      className="label ac-chip"
                      data-tone={paymentTone(order.payment_status)}
                    >
                      {paymentStatusWord(order.payment_status)}
                    </span>
                    <span
                      className="label ac-chip"
                      data-tone={orderTone(order.order_status)}
                    >
                      {orderStatusWord(order.order_status)}
                    </span>
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}

function Filter({
  href,
  label,
  n,
  current,
}: {
  href: string
  label: string
  n: number
  current: boolean
}) {
  return (
    <Link
      className="label or-filter"
      href={href}
      aria-current={current ? 'page' : undefined}
    >
      {label}
      <span className="or-filter__n">{n}</span>
    </Link>
  )
}
