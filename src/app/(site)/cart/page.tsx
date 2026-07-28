import type { Metadata } from 'next'
import { CartView } from '@/components/cart/CartView'
import { SectionHead } from '@/components/site/SectionHead'
import { getStorePage } from '@/lib/store-data'

import '@/styles/cart.css'

/* ==========================================================================
   /cart — one rack unit.

   The page itself is a server component and knows nothing about the basket:
   the basket lives in the customer's browser, so the contents and the totals
   are the client island's job. All this does is fetch the client's copy
   (the postage note) and hand it down.

   Not indexed — a basket is one person's, and it is empty for everybody else.
   ========================================================================== */

export const metadata: Metadata = {
  title: 'Basket',
  robots: { index: false, follow: true },
}

export default async function CartPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [page, query] = await Promise.all([getStorePage(), searchParams])

  // Stripe's cancel_url is /cart?cancelled=1. Coming back from an abandoned
  // payment page is a normal thing to do, so it is not an error state.
  const cancelled = query.cancelled === '1'

  return (
    <section className="sec bsk-sec" aria-labelledby="cart-heading">
      <div className="shell">
        <SectionHead
          channel="01"
          label="Basket"
          heading="Your basket"
          id="cart-heading"
          headingLevel={1}
        />

        <CartView shippingNote={page.shippingNote} cancelled={cancelled} />
      </div>
    </section>
  )
}
