import type { Metadata } from 'next'
import { EventList } from '@/components/events/EventCard'
import { SectionHead } from '@/components/site/SectionHead'
import { isPastDate, pluralise } from '@/lib/format'
import { getEvents, getEventsPage, getStorePage } from '@/lib/store-data'

import '@/styles/events.css'

/* ==========================================================================
   /events — what is booked in, and what has been.

   getEvents() returns every published date, soonest first, past ones included.
   The split happens here rather than in the query because both halves belong
   on the page: a label with nothing coming up but a year of gigs behind it has
   a history worth showing, and a page that hid it would look like a label that
   had never put anything on.

   Past dates are reversed, so "Previously" reads most recent first — the way
   anyone scanning a back catalogue expects it.
   ========================================================================== */

export async function generateMetadata(): Promise<Metadata> {
  const page = await getEventsPage()
  return {
    title: page.heading || 'Events',
    description: page.intro || undefined,
  }
}

export default async function EventsPage() {
  const [page, store, all] = await Promise.all([
    getEventsPage(),
    getStorePage(),
    getEvents(),
  ])

  const upcoming = all.filter((event) => !isPastDate(event.date))
  const past = all.filter((event) => isPastDate(event.date)).reverse()

  const symbol = store.currencySymbol
  const emptyMessage = page.emptyMessage || 'Nothing booked in right now.'
  const pastHeading = page.pastHeading || 'Previously'

  return (
    <section className="sec ev" aria-labelledby="events-heading">
      <div className="shell">
        <SectionHead
          channel="01"
          label="Events"
          heading={page.heading}
          intro={page.intro}
          id="events-heading"
          headingLevel={1}
          aside={
            upcoming.length > 0 ? (
              <p className="mono dim">
                {upcoming.length} {pluralise(upcoming.length, 'date')}
              </p>
            ) : null
          }
        />

        {upcoming.length > 0 ? (
          <EventList events={upcoming} symbol={symbol} labelledBy="events-heading" />
        ) : (
          <div className="empty ev-empty">
            <p className="empty__title">{emptyMessage}</p>
            <p className="empty__text">
              {past.length > 0
                ? 'The dates below have already happened. New ones appear here as soon as they are announced.'
                : 'New dates appear here as soon as they are announced.'}
            </p>
          </div>
        )}

        {past.length > 0 ? (
          <>
            <div className="ev-group">
              <h2 className="ev-group__h" id="past-events-heading">
                {pastHeading}
              </h2>
              <span className="ev-group__rule" aria-hidden="true" />
              <p className="mono ev-group__n">
                {past.length} {pluralise(past.length, 'date')}
              </p>
            </div>

            <EventList
              events={past}
              symbol={symbol}
              past
              labelledBy="past-events-heading"
            />
          </>
        ) : null}
      </div>
    </section>
  )
}
