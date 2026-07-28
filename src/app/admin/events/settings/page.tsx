import type { Metadata } from 'next'
import Link from 'next/link'
import { getEventsPageForEdit } from '@/lib/admin-events-queries'
import { requireAdmin } from '@/lib/session'
import { EventsSettingsForm, type EventsSettingsValues } from './EventsSettingsForm'

import '@/styles/admin-events.css'

/* ==========================================================================
   /admin/events/settings — the words around the dates.

   A server component: it reads the singleton uncached and shapes it for the
   form. The row can be missing on a database that was migrated but never
   seeded, so the defaults below match the column defaults in src/db/schema.ts
   — and saving inserts the row.
   ========================================================================== */

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Events page',
  robots: { index: false, follow: false },
}

export default async function AdminEventsSettingsPage() {
  await requireAdmin()

  const page = await getEventsPageForEdit()

  const values: EventsSettingsValues = {
    heading: page?.heading ?? 'Events',
    intro: page?.intro ?? '',
    emptyMessage: page?.emptyMessage ?? '',
    pastHeading: page?.pastHeading ?? 'Previously',
  }

  return (
    <>
      <header className="ad-head">
        <div className="ad-head__strip" aria-hidden="true">
          <span className="mono ad-head__chan">12</span>
          <span className="ad-head__rule" />
          <span className="label">Events page</span>
        </div>
        <div className="ad-head__title">
          <h1 className="ad-head__h">Events page</h1>
          <p className="ad-head__intro">
            The headings and the words around your dates. The intro is optional and blank
            is a designed state — the page renders no paragraph at all rather than an
            empty gap. The dates themselves are under Events.
          </p>
        </div>
        <div className="ad-head__aside">
          <Link href="/admin/events" className="btn btn--sm btn--ghost">
            All events
          </Link>
        </div>
      </header>

      <EventsSettingsForm page={values} />
    </>
  )
}
