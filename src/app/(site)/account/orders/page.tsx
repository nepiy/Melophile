import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { OrderList } from '@/components/account/OrderList'
import { getAccount, getMyOrders } from '@/lib/account/queries'
import { claimGuestOrders, readOrderStatus } from '@/lib/orders/store'
import { accountsEnabled, serviceRoleAvailable } from '@/lib/supabase/config'

import '@/styles/orders.css'

/* ==========================================================================
   /account/orders — everything this customer has bought.

   READ AS THE CUSTOMER, NOT AS THE SERVER
   getMyOrders goes through the signed-in user's own Supabase client, so row
   level security applies: `orders_select_own` means Postgres itself refuses to
   return a row belonging to anybody else. If the `.eq('user_id', …)` in that
   query were wrong tomorrow, the database would still return nothing rather
   than somebody else's address — the guard is not this page's `if`.

   GUEST ORDERS ARE CLAIMED ON THE WAY IN
   Somebody buys a record, likes it, and makes an account a week later. That
   first order carries their email and no user id, so it is claimed here, on
   the page where its absence would be noticed. Doing it on arrival rather than
   only at sign-up also catches an order placed while signed out, which is a
   thing that happens on a shared machine every day.
   ========================================================================== */

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Your orders',
  robots: { index: false, follow: false },
}

export default async function AccountOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  if (!accountsEnabled()) return null

  const account = await getAccount()
  if (!account) redirect('/login?next=/account/orders')

  /* Best effort, and never in the way: a customer with no guest orders pays
     one cheap update that matches nothing, and a failure here must not stop
     them reading the history they do have. */
  if (serviceRoleAvailable()) {
    await claimGuestOrders(account.user.id, account.user.email)
  }

  const [orders, active] = await Promise.all([
    getMyOrders(account.user.id),
    // Nothing reaches the filter until it is one of the statuses the schema names.
    searchParams.then((query) => readOrderStatus(query.status)),
  ])

  return (
    <section className="ac-panel">
      <div className="ac-panel__strip" aria-hidden="true">
        <span className="mono ac-panel__chan">01</span>
        <span className="ac-panel__rule" />
        <span className="label ac-panel__strip-label">Orders</span>
      </div>

      <h2 className="ac-panel__title">Your orders</h2>
      <p className="ac-panel__text">
        Newest first. Open one for the lines, the postage address and where it has got to.
        Anything you bought as a guest with this email address is here too.
      </p>

      <OrderList orders={orders} active={active} />
    </section>
  )
}
