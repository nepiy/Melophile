import type { Metadata } from 'next'
import Link from 'next/link'
import { DangerButton, OrderButtons } from '@/components/admin/fields'
import { SmartImage } from '@/components/site/SmartImage'
import { deleteEvent, moveEvent, setEventStatus } from '@/lib/actions/events'
import { eventCounts, listEvents, type AdminEvent } from '@/lib/admin-events-queries'
import { getStorePageForEdit } from '@/lib/admin-store-queries'
import { formatEventWhen, formatMoney, isPastDate, pluralise } from '@/lib/format'
import { requireAdmin } from '@/lib/session'

import '@/styles/admin-events.css'

/* ==========================================================================
   Events, as the client operates them.

   ONE LIST, SPLIT IN TWO. A gig from last October and a gig next Friday are
   not the same kind of thing: one is a record and one is a job. Sorted purely
   by date they interleave every time the year turns over, and the client ends
   up reading past dates looking for the next one. So the split is the screen's
   first move — upcoming soonest first, past most recent first, each under its
   own mono heading.

   Everything that can be done without opening an event is on the row: publish
   it, delete it, and — only where two events share a slot on the same night —
   put them in order.
   ========================================================================== */

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Events',
  robots: { index: false, follow: false },
}

type Row = AdminEvent & {
  /** True when another event sits at the same time on the same day. */
  hasTwin: boolean
}

/** Two events are in the same slot when the date alone cannot separate them. */
function markTwins(list: AdminEvent[]): Row[] {
  const slots = new Map<string, number>()
  for (const event of list) {
    const key = `${event.date}T${event.startTime}`
    slots.set(key, (slots.get(key) ?? 0) + 1)
  }
  return list.map((event) => ({
    ...event,
    hasTwin: (slots.get(`${event.date}T${event.startTime}`) ?? 0) > 1,
  }))
}

function soldOut(event: AdminEvent): boolean {
  return event.capacity !== null && event.ticketsSold >= event.capacity
}

/** '143 / 200', or 'Uncapped' when there is no cap to count against. */
function ticketLine(event: AdminEvent): string {
  if (event.capacity === null) return 'Uncapped'
  return `${event.ticketsSold} / ${event.capacity}`
}

export default async function AdminEventsPage() {
  await requireAdmin()

  const [counts, all, page] = await Promise.all([
    eventCounts(),
    listEvents(),
    getStorePageForEdit(),
  ])

  // Ticket prices read in whatever the client set on the store page copy, not
  // in a pound sign hard-coded into the admin.
  const symbol = page?.currencySymbol || '£'

  const upcoming = markTwins(all.filter((event) => !isPastDate(event.date)))
  // Reversed: soonest-first is what you want ahead of you and exactly what you
  // do not want behind you. The most recent gig is the one anyone asks about.
  const past = markTwins(all.filter((event) => isPastDate(event.date))).reverse()

  // The counts come from their own query rather than from these two arrays: the
  // split rule lives in one place that way, and the head can say how many are
  // in draft without the list having to be walked a third time.
  const groups: { key: string; label: string; note: string; rows: Row[] }[] = [
    {
      key: 'upcoming',
      label: 'Upcoming',
      note: `${counts.upcoming} ${pluralise(counts.upcoming, 'date')}`,
      rows: upcoming,
    },
    {
      key: 'past',
      label: 'Previously',
      note: `${counts.past} ${pluralise(counts.past, 'date')}`,
      rows: past,
    },
  ]

  return (
    <>
      <header className="ad-head">
        <div className="ad-head__strip" aria-hidden="true">
          <span className="mono ad-head__chan">12</span>
          <span className="ad-head__rule" />
          <span className="label">Events</span>
        </div>
        <div className="ad-head__title">
          <h1 className="ad-head__h">Events</h1>
          <p className="ad-head__intro">
            Every date you have on, drafts included. Upcoming dates sit above past ones —
            the date you type is what decides which group an event is in, and it moves
            itself across the night it happens. Drafts are invisible on the site until you
            publish them.
          </p>
        </div>
        <div className="ad-head__aside">
          <Link href="/admin/events/new" className="btn btn--sm">
            New event
          </Link>
          <Link href="/admin/events/settings" className="btn btn--sm btn--ghost">
            Events page copy
          </Link>
        </div>
      </header>

      {all.length === 0 ? (
        <section className="ad-panel" aria-labelledby="events-heading">
          <div className="ad-panel__head">
            <span className="label" id="events-heading">
              Events
            </span>
          </div>
          <div className="ad-panel__body">
            <div className="empty">
              <p className="empty__title">No events yet</p>
              <p className="empty__text">
                Add one and it appears on the events page as soon as you publish it.
              </p>
            </div>
          </div>
        </section>
      ) : (
        groups.map((group) => {
          if (group.rows.length === 0 && group.key === 'past') return null

          return (
            <section
              className="ad-panel"
              key={group.key}
              aria-labelledby={`events-${group.key}`}
            >
              <div className="ad-panel__head">
                <span className="label" id={`events-${group.key}`}>
                  {group.label}
                </span>
                <span className="mono aev-count">
                  {group.note}
                  {group.key === 'upcoming' && counts.draft > 0
                    ? ` · ${counts.draft} in draft`
                    : ''}
                </span>
              </div>

              <div className="ad-panel__body">
                {group.rows.length === 0 ? (
                  <div className="empty">
                    <p className="empty__title">Nothing coming up</p>
                    <p className="empty__text">
                      Every date you have is behind you. Add the next one and it appears
                      here.
                    </p>
                  </div>
                ) : (
                  <ul className="ad-table">
                    {group.rows.map((event) => {
                      const nextStatus =
                        event.status === 'published' ? 'draft' : 'published'
                      const full = soldOut(event)

                      return (
                        <li
                          className="ad-row aev-row"
                          key={event.id}
                          data-past={group.key === 'past' ? 'true' : undefined}
                        >
                          <SmartImage
                            image={event.image}
                            alt=""
                            sizes="48px"
                            className="ad-row__thumb aev-row__art"
                            emptyLabel=""
                          />

                          <div className="aev-row__main">
                            <span className="mono aev-row__when">
                              {formatEventWhen(event.date, event.startTime)}
                            </span>
                            <Link
                              href={`/admin/events/${event.id}`}
                              className="ad-row__title aev-row__link"
                            >
                              {event.title}
                            </Link>
                            <span className="aev-row__venue">
                              {event.venue || 'No venue yet'}
                            </span>
                          </div>

                          <span className="mono ad-row__meta aev-row__meta">
                            <span className="aev-row__price">
                              {formatMoney(event.priceCents, symbol)}
                            </span>
                            <span>{ticketLine(event)}</span>
                          </span>

                          <span className="aev-row__flags">
                            <span
                              className={`ad-badge ad-badge--${
                                event.status === 'published' ? 'published' : 'draft'
                              }`}
                            >
                              {event.status === 'published' ? 'Published' : 'Draft'}
                            </span>
                            {full ? <span className="ad-badge">Sold out</span> : null}
                            {event.externalUrl ? (
                              <span className="mono aev-row__note">Sold elsewhere</span>
                            ) : null}
                          </span>

                          <span className="ad-row__tools">
                            {/* Offered only where they can do something: two
                                events at the same time on the same night. Any
                                other pair is separated by the date itself. */}
                            {event.hasTwin ? (
                              <OrderButtons
                                upAction={moveEvent.bind(null, event.id, 'up')}
                                downAction={moveEvent.bind(null, event.id, 'down')}
                              />
                            ) : null}

                            <form
                              action={setEventStatus.bind(null, event.id, nextStatus)}
                            >
                              <button type="submit" className="btn btn--sm btn--ghost">
                                {event.status === 'published' ? 'Unpublish' : 'Publish'}
                                <span className="vh"> {event.title}</span>
                              </button>
                            </form>

                            <Link
                              href={`/admin/events/${event.id}`}
                              className="btn btn--sm"
                            >
                              Edit
                              <span className="vh"> {event.title}</span>
                            </Link>

                            <form action={deleteEvent.bind(null, event.id)}>
                              <DangerButton confirmLabel="Delete it">
                                Delete
                                <span className="vh"> {event.title}</span>
                              </DangerButton>
                            </form>
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            </section>
          )
        })
      )}
    </>
  )
}
