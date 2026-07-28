import type { Metadata } from 'next'
import { getHomeForEdit } from '@/lib/admin-queries'
import { requireAdmin } from '@/lib/session'
import { HomeForm, type HomeFormValues } from './HomeForm'

import '@/styles/admin-pages.css'

/* ==========================================================================
   /admin/home — every user-visible string on the front page.

   A server component: it reads the row uncached and shapes it for the form. The
   row can be missing on a database that was migrated but never seeded, so the
   defaults below match the column defaults in src/db/schema.ts — and saving
   inserts the row.
   ========================================================================== */

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Home page',
  robots: { index: false, follow: false },
}

export default async function AdminHomePage() {
  await requireAdmin()

  const home = await getHomeForEdit()

  const values: HomeFormValues = {
    wordmarkLine1: home?.wordmarkLine1 ?? 'MELOPHILE',
    wordmarkLine2: home?.wordmarkLine2 ?? 'RECORDS',
    wordmarkTagline: home?.wordmarkTagline ?? '',
    scrollCue: home?.scrollCue ?? 'Scroll',
    musicHeading: home?.musicHeading ?? 'Music',
    musicIntro: home?.musicIntro ?? '',
    musicCta: home?.musicCta ?? 'See all music',
    servicesHeading: home?.servicesHeading ?? 'Our services',
    servicesIntro: home?.servicesIntro ?? '',
    contactHeading: home?.contactHeading ?? 'Contact',
    contactCta: home?.contactCta ?? 'Book the studio',
    featuredCount: String(home?.featuredCount ?? 4),
  }

  return (
    <>
      <header className="ad-head">
        <div className="ad-head__strip" aria-hidden="true">
          <span className="mono ad-head__chan">05</span>
          <span className="ad-head__rule" />
          <span className="label">Front page</span>
        </div>
        <div className="ad-head__title">
          <h1 className="ad-head__h">Home page</h1>
          <p className="ad-head__intro">
            Every word on the front page, in the order you scroll past it. The releases
            and services themselves are edited in their own sections — these are the
            headings, the intros and the button labels around them.
          </p>
        </div>
      </header>

      <HomeForm home={values} />
    </>
  )
}
