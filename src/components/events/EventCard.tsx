import Link from 'next/link'
import { Reveal } from '@/components/site/Reveal'
import { SmartImage } from '@/components/site/SmartImage'
import { formatEventWhen, formatMoney, pluralise } from '@/lib/format'
import type { EventFull } from '@/lib/store-data'

/* ==========================================================================
   One date, and the vocabulary both events pages agree on.

   THE HONESTY RULE, WHICH IS THE WHOLE REASON availability() EXISTS: a ticket
   count is a claim about the world, and the only counts we are entitled to
   make are the ones the database can prove. An uncapped event has no number,
   so it says nothing at all rather than "selling fast". An event with 140 left
   says "Tickets available" — not "9 left", not a bar chart, not a countdown.
   The one time a number is printed is the one time it is genuinely useful: ten
   or fewer, where it changes what a person does today.

   Both the listing and the detail page render the answer through the same two
   exports, so the card and the ticket panel can never disagree about whether
   something is nearly gone.

   No 'use client' here on purpose — this is a server component and the row it
   is handed never crosses into the browser bundle.
   ========================================================================== */

/** Ten or fewer is a real reason to hurry. Eleven is not. */
export const LOW_TICKET_THRESHOLD = 10

export type Availability =
  /** Uncapped — we hold no number, so we make no claim. */
  | { level: 'none' }
  | { level: 'out'; text: string }
  | { level: 'low'; text: string }
  | { level: 'open'; text: string }

export type EventStock = Pick<EventFull, 'capacity' | 'ticketsLeft' | 'soldOut'>

export function availability(event: EventStock): Availability {
  if (event.capacity === null || event.ticketsLeft === null) return { level: 'none' }
  if (event.soldOut || event.ticketsLeft <= 0) return { level: 'out', text: 'Sold out' }
  if (event.ticketsLeft <= LOW_TICKET_THRESHOLD) {
    const n = event.ticketsLeft
    return { level: 'low', text: `${n} ${pluralise(n, 'ticket')} left` }
  }
  return { level: 'open', text: 'Tickets available' }
}

export function eventHref(event: { slug: string }): string {
  return `/events/${event.slug}`
}

/**
 * The availability line, wherever it appears. Sold out is a chip because it is
 * a state; the rest is a line of chrome because it is a fact.
 */
export function AvailabilityNote({ event }: { event: EventStock }) {
  const avail = availability(event)
  if (avail.level === 'none') return null

  if (avail.level === 'out') {
    return <span className="ev-chip ev-chip--out">{avail.text}</span>
  }

  return (
    <span className="mono ev-avail" data-level={avail.level}>
      {avail.text}
    </span>
  )
}

/* --------------------------------------------------------------------------
   The card

   A link and only a link. Choosing a number of tickets happens on the detail
   page, where the venue, the doors time and the price are all in view.

   A past card carries no price and no availability: it is not for sale, and a
   price beside a date that has gone reads as an offer. What is left is the
   record that it happened.
   -------------------------------------------------------------------------- */

export type EventCardProps = {
  event: EventFull
  /** The store's currency symbol, so a ticket costs the same here as in the basket. */
  symbol: string
  past?: boolean
  imageSizes?: string
}

export function EventCard({
  event,
  symbol,
  past = false,
  imageSizes = '(max-width: 560px) 92vw, (max-width: 900px) 40vw, 260px',
}: EventCardProps) {
  return (
    <Link href={eventHref(event)} className="ev-card" data-past={past ? 'true' : 'false'}>
      <SmartImage
        image={event.image}
        alt={event.image?.alt || `${event.title} — event poster`}
        sizes={imageSizes}
        className="ev-card__art"
        emptyLabel="No poster yet"
      />

      <div className="ev-card__body">
        <p className="mono ev-card__when">
          {formatEventWhen(event.date, event.startTime)}
        </p>

        <h3 className="ev-card__title">{event.title}</h3>

        {event.venue ? <p className="ev-card__venue">{event.venue}</p> : null}

        {past ? null : (
          <p className="ev-card__foot">
            <span className="mono ev-card__price">
              {formatMoney(event.priceCents, symbol)}
            </span>
            <AvailabilityNote event={event} />
          </p>
        )}
      </div>
    </Link>
  )
}

/** The rack both groups are drawn in, so upcoming and past share one skeleton. */
export function EventList({
  events,
  symbol,
  past = false,
  labelledBy,
}: {
  events: EventFull[]
  symbol: string
  past?: boolean
  labelledBy?: string
}) {
  return (
    <ul className="ev-list" aria-labelledby={labelledBy}>
      {events.map((event, i) => (
        // Capped stagger, for the same reason the store grid staggers by
        // column: a row twelve down should not wait most of a second to
        // arrive after it has already been scrolled into view.
        <Reveal as="li" key={event.id} index={Math.min(i, 3)} className="ev-list__item">
          <EventCard event={event} symbol={symbol} past={past} />
        </Reveal>
      ))}
    </ul>
  )
}
