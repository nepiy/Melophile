import type { Metadata } from 'next'
import { CheckoutForm } from '@/components/cart/CheckoutForm'
import { SectionHead } from '@/components/site/SectionHead'
import { stripeConfigured } from '@/lib/payments'
import { getStorePage } from '@/lib/store-data'
import { getAccount, getAddresses } from '@/lib/account/queries'
import { accountsEnabled } from '@/lib/supabase/config'

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
  const account = accountsEnabled() ? await getAccount() : null
  const addresses = account ? await getAddresses(account.user.id) : []
  const address = addresses.find((item) => item.is_default) ?? addresses[0]
  const deliveryAddress = address
    ? [
        address.recipient,
        address.street_address,
        [address.city, address.state].filter(Boolean).join(', '),
        address.postal_code,
        address.country,
      ]
        .filter(Boolean)
        .join('\n')
    : ''

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
          initialCustomer={
            account
              ? {
                  name: account.profile.full_name,
                  email: account.user.email,
                  phone:
                    `${account.profile.phone_country_code} ${account.profile.phone_number}`.trim(),
                  shippingLines: deliveryAddress,
                }
              : undefined
          }
        />
      </div>
    </section>
  )
}
