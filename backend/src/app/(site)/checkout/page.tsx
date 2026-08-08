import type { Metadata } from 'next'
import { CheckoutForm } from '@/components/cart/CheckoutForm'
import { SectionHead } from '@/components/site/SectionHead'
import { stripeConfigured } from '@/lib/payments'
import { getStorePage } from '@/lib/store-data'

import '@/styles/cart.css'

/* ==========================================================================
   /checkout — one rack unit.

   The server's whole job here is to answer one question the browser cannot:
   is a payment provider actually configured? The answer decides whether the
   button says "Pay now" or "Place order", and the site never promises a
   payment page that does not exist. STRIPE_SECRET_KEY is only read here, on
   the server — stripeConfigured() returns a boolean, and a boolean is all
   that crosses to the client.

   The basket itself lives in localStorage, so the form is a client island.
   ========================================================================== */

export const metadata: Metadata = {
  title: 'Checkout',
  robots: { index: false, follow: false },
}

export default async function CheckoutPage() {
  const page = await getStorePage()

  return (
    <section className="sec cko-sec" aria-labelledby="checkout-heading">
      <div className="shell">
        <SectionHead
          channel="01"
          label="Checkout"
          heading="Checkout"
          id="checkout-heading"
          headingLevel={1}
        />

        <CheckoutForm
          stripeReady={stripeConfigured()}
          checkoutNote={page.checkoutNote}
          shippingNote={page.shippingNote}
        />
      </div>
    </section>
  )
}
