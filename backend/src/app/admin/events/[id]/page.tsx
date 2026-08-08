import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { AdminImage } from '@/components/admin/fields'
import { eventHref } from '@/components/events/EventCard'
import { getEventForEdit, type AdminEvent } from '@/lib/admin-events-queries'
import { getStorePageForEdit } from '@/lib/admin-store-queries'
import { formatEventWhen, formatMoney } from '@/lib/format'
import { requireAdmin } from '@/lib/session'
import { EventForm, type EventFormValues } from './EventForm'

import '@/styles/admin-events.css'

/* ==========================================================================
   One event. `new` creates.

   A server component: it reads the row uncached, shapes it for the form, and
   does the one conversion the client must never do for themselves.

   MONEY. priceCents is integer minor units — 1800 is £18.00. The editor shows
   and accepts pounds, so the pence become a pounds string HERE, on the way out,
   and the pounds become pence in saveEvent on the way in. formatMoney(1800, '')
   is '18' and parseMoney('18') is 1800, which is what makes load → save →
   reload leave the number alone.
   ========================================================================== */

export const dynamic = 'force-dynamic'

type PageProps = { params: Promise<{ id: string }> }

function noIndex(title: string): Metadata {
  return { title, robots: { index: false, follow: false } }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params
  if (id === 'new') return noIndex('New event')

  const event = /^\d+$/.test(id) ? await getEventForEdit(Number(id)) : null
  return noIndex(event ? event.title : 'Event')
}

function toAdminImage(event: AdminEvent | null): AdminImage | null {
  const image = event?.image
  if (!image) return null
  return {
    id: image.id,
    path: image.path,
    width: image.width,
    height: image.height,
    alt: image.alt,
    isPlaceholder: image.isPlaceholder,
  }
}

export default async function EventEditorPage({ params }: PageProps) {
  await requireAdmin()

  const { id } = await params
  const isNew = id === 'new'
  if (!isNew && !/^\d+$/.test(id)) notFound()

  const event = isNew ? null : await getEventForEdit(Number(id))
  if (!isNew && !event) notFound()

  const page = await getStorePageForEdit()
  const symbol = page?.currencySymbol || '£'

  const values: EventFormValues = {
    id: event?.id ?? null,
    title: event?.title ?? '',
    slug: event?.slug ?? '',
    description: event?.description ?? '',
    venue: event?.venue ?? '',
    addressLines: event?.addressLines ?? '',
    date: event?.date ?? '',
    startTime: event?.startTime ?? '',
    doorsTime: event?.doorsTime ?? '',
    // A new event starts blank rather than at 0, so the price is typed once
    // rather than corrected from a number nobody chose.
    price: event ? formatMoney(event.priceCents, '') : '',
    // Blank is uncapped, and it has to survive the round trip: '' out, null in.
    capacity: event && event.capacity !== null ? String(event.capacity) : '',
    ticketsSold: event ? String(event.ticketsSold) : '',
    externalUrl: event?.externalUrl ?? '',
    status: event?.status ?? 'draft',
    image: toAdminImage(event),
  }

  return (
    <>
      <header className="ad-head">
        <div className="ad-head__strip" aria-hidden="true">
          <span className="mono ad-head__chan">{isNew ? 'NEW' : '12'}</span>
          <span className="ad-head__rule" />
          <span className="label">Event</span>
        </div>
        <div className="ad-head__title">
          <h1 className="ad-head__h">{event ? event.title : 'New event'}</h1>
          {event ? (
            <p className="mono aev-head__meta">
              {formatEventWhen(event.date, event.startTime)} ·{' '}
              {formatMoney(event.priceCents, symbol)} ·{' '}
              {event.status === 'published' ? 'Published' : 'Draft'}
            </p>
          ) : null}
          <p className="ad-head__intro">
            {isNew
              ? 'Fill in what you have. The price is in pounds and pence — type 18.00, not 1800. Save it as a draft and finish it later, or publish it now and tickets are on sale.'
              : 'Every change here is live on the site the moment you save it. Set it back to draft to take it off sale without deleting it.'}
          </p>
        </div>
        <div className="ad-head__aside">
          <Link href="/admin/events" className="btn btn--sm btn--ghost">
            All events
          </Link>
        </div>
      </header>

      <EventForm
        event={values}
        currencySymbol={symbol}
        viewUrl={
          event && event.status === 'published' ? eventHref({ slug: event.slug }) : null
        }
      />
    </>
  )
}
