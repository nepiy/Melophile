import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'
import { AvailabilityNote, availability } from '@/components/events/EventCard'
import { TicketPicker } from '@/components/events/TicketPicker'
import { SmartImage } from '@/components/site/SmartImage'
import { formatEventWhen, formatMoney, formatTime, isPastDate } from '@/lib/format'
import { RichText, safeUrl } from '@/lib/markdown'
import { getEventBySlug, getEventsPage, getStorePage } from '@/lib/store-data'

import '@/styles/events.css'

/* ==========================================================================
   One date.

   THE TICKET PANEL IS A LADDER, AND THE ORDER MATTERS:
     1. the date has gone      — nothing to buy, and we say so plainly
     2. the venue sells them   — we link out and stop; their box office is the
                                 authority on both stock and price
     3. we sold them all       — one clear statement, said once
     4. otherwise              — the picker

   Rule 2 also suppresses our own ticket count. Our capacity column describes
   tickets *we* would have sold; printing "4 tickets left" beside a button that
   goes to somebody else's box office is a number about the wrong shop, which
   is exactly the invented scarcity the rest of this page refuses to do.
   ========================================================================== */

type Params = { slug: string }

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>
}): Promise<Metadata> {
  const { slug } = await params
  const event = await getEventBySlug(slug)
  if (!event) return { title: 'Events' }

  const when = formatEventWhen(event.date, event.startTime)
  return {
    title: event.venue ? `${event.title} — ${event.venue}` : event.title,
    description: event.venue
      ? `${event.title} at ${event.venue}. ${when}.`
      : `${event.title}. ${when}.`,
  }
}

export default async function EventPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params
  const [page, store, event] = await Promise.all([
    getEventsPage(),
    getStorePage(),
    getEventBySlug(slug),
  ])
  if (!event) notFound()

  const symbol = store.currencySymbol
  const past = isPastDate(event.date)
  const when = formatEventWhen(event.date, event.startTime)
  const external = event.externalUrl ? safeUrl(event.externalUrl) : null
  const sellsElsewhere = event.externalUrl.trim() !== ''
  const avail = availability(event)

  const addressLines = event.addressLines
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  /* The facts, in the order someone deciding whether to go asks for them. */
  const facts: { k: string; v: ReactNode }[] = [{ k: 'Date', v: when }]
  if (event.doorsTime) {
    facts.push({ k: 'Doors', v: `Doors ${formatTime(event.doorsTime)}` })
  }
  if (event.venue || addressLines.length > 0) {
    facts.push({
      k: 'Where',
      v: (
        <address className="ev-facts__addr">
          {event.venue ? <span className="ev-facts__venue">{event.venue}</span> : null}
          {addressLines.map((line, i) => (
            <span key={`${i}-${line}`} className="ev-facts__line">
              {line}
            </span>
          ))}
        </address>
      ),
    })
  }

  return (
    <section className="sec ev" aria-labelledby="event-heading">
      <div className="shell">
        <p className="mono ev-crumbs">
          <Link href="/events" className="ev-crumbs__link">
            {page.heading || 'Events'}
          </Link>
          <span className="ev-crumbs__sep" aria-hidden="true">
            /
          </span>
          <span className="ev-crumbs__here">{when}</span>
        </p>

        <div className="ev-detail">
          <div className="ev-detail__art">
            <SmartImage
              image={event.image}
              alt={event.image?.alt || `${event.title} — event poster`}
              sizes="(max-width: 880px) 92vw, 44vw"
              className="ev-detail__frame"
              priority
              emptyLabel="No poster yet"
            />
          </div>

          <div className="ev-detail__body">
            {past ? <span className="ev-chip ev-detail__badge">Past event</span> : null}

            <h1 id="event-heading" className="ev-detail__title">
              {event.title}
            </h1>

            <dl className="ev-facts">
              {facts.map((row) => (
                <div key={row.k} className="ev-facts__row">
                  <dt className="label ev-facts__k">{row.k}</dt>
                  <dd className="mono ev-facts__v">{row.v}</dd>
                </div>
              ))}
            </dl>

            {event.description ? (
              <div className="ev-detail__desc">
                <RichText value={event.description} />
              </div>
            ) : null}

            <aside className="ev-buy" aria-labelledby="tickets-heading">
              <h2 className="label ev-buy__label" id="tickets-heading">
                Tickets
              </h2>

              <p className="mono ev-buy__when">{when}</p>

              {past ? null : (
                <p className="ev-buy__price">{formatMoney(event.priceCents, symbol)}</p>
              )}

              {/* 1 — gone. */}
              {past ? (
                <p className="ev-buy__note">This event has been and gone.</p>
              ) : sellsElsewhere ? (
                /* 2 — somebody else's box office. */
                <>
                  {external ? (
                    <a
                      className="btn btn--solid ev-buy__go"
                      href={external}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Get tickets
                    </a>
                  ) : null}
                  <p className="ev-buy__note">
                    {external
                      ? 'Tickets are sold by the venue. This link opens their site in a new tab.'
                      : 'Tickets are sold by the venue. Contact them directly for this date.'}
                  </p>
                </>
              ) : avail.level === 'out' ? (
                /* 3 — said once, without shouting. */
                <>
                  <AvailabilityNote event={event} />
                  <p className="ev-buy__note">
                    Every ticket for this date has gone. Nothing else is coming back on
                    sale for it.
                  </p>
                </>
              ) : (
                /* 4 — the picker. */
                <>
                  <AvailabilityNote event={event} />
                  <TicketPicker
                    eventId={event.id}
                    title={event.title}
                    ticketsLeft={event.ticketsLeft}
                  />
                  <p className="ev-buy__note">
                    Tickets are emailed the moment the payment clears. Nothing is posted.
                  </p>
                </>
              )}
            </aside>
          </div>
        </div>
      </div>
    </section>
  )
}
