import type { Metadata } from 'next'
import Link from 'next/link'
import { getStorePageForEdit } from '@/lib/admin-store-queries'
import { formatMoney } from '@/lib/format'
import { requireAdmin } from '@/lib/session'
import { StoreSettingsForm, type StoreSettingsValues } from './StoreSettingsForm'

import '@/styles/admin-store.css'

/* ==========================================================================
   /admin/store/settings — the words around the store, and the money it is in.

   A server component: it reads the singleton uncached and shapes it for the
   form. The row can be missing on a database that was migrated but never
   seeded, so the defaults below match the column defaults in src/db/schema.ts
   — and saving inserts the row.

   Shipping is stored in pence and edited in pounds, the same round trip every
   price in the store makes: formatMoney(cents, '') out, parseMoney() back in.
   ========================================================================== */

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Store page',
  robots: { index: false, follow: false },
}

export default async function AdminStoreSettingsPage() {
  await requireAdmin()

  const page = await getStorePageForEdit()

  const values: StoreSettingsValues = {
    heading: page?.heading ?? 'Store',
    intro: page?.intro ?? '',
    merchHeading: page?.merchHeading ?? 'Merch',
    merchIntro: page?.merchIntro ?? '',
    musicHeading: page?.musicHeading ?? 'Music',
    musicIntro: page?.musicIntro ?? '',
    beatsHeading: page?.beatsHeading ?? 'Beats',
    beatsIntro: page?.beatsIntro ?? '',
    emptyMessage: page?.emptyMessage ?? '',
    currency: page?.currency ?? 'GBP',
    currencySymbol: page?.currencySymbol ?? '£',
    shipping: formatMoney(page?.shippingCents ?? 0, ''),
    shippingNote: page?.shippingNote ?? '',
    checkoutNote: page?.checkoutNote ?? '',
    successMessage: page?.successMessage ?? '',
  }

  return (
    <>
      <header className="ad-head">
        <div className="ad-head__strip" aria-hidden="true">
          <span className="mono ad-head__chan">11</span>
          <span className="ad-head__rule" />
          <span className="label">Store page</span>
        </div>
        <div className="ad-head__title">
          <h1 className="ad-head__h">Store page</h1>
          <p className="ad-head__intro">
            The headings and the words around what you sell, plus the money the store
            works in. Every intro is optional and blank is a designed state — the page
            renders no paragraph at all rather than an empty gap. The items themselves are
            under Store.
          </p>
        </div>
        <div className="ad-head__aside">
          <Link href="/admin/store" className="btn btn--sm btn--ghost">
            All items
          </Link>
        </div>
      </header>

      <StoreSettingsForm page={values} />
    </>
  )
}
