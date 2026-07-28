import type { Metadata } from 'next'
import Link from 'next/link'
import { BOOKING_STATUSES, type BookingStatus } from '@/db/schema'
import { setBookingStatus } from '@/lib/actions/bookings'
import { bookingCounts, listBookings } from '@/lib/admin-queries'
import {
  formatDateLong,
  formatTime,
  pluralise,
  sessionTypeLabel,
  timeAgo,
} from '@/lib/format'
import { requireAdmin } from '@/lib/session'

import '@/styles/admin-desk.css'

/* ==========================================================================
   Booking requests — the screen the client opens most, so it is built to be
   read rather than studied.

   Newest first, everything by default, and a new request marked twice over: the
   badge and a lamp hairline down the left of the row. The status tabs are
   links, not JS — the filter is a query string, so a filtered list can be
   bookmarked and the back button does what it looks like it does.

   The one thing this screen must never do is imply an email went out when it
   did not. `notified === false` puts a red-hairlined warning on the row with
   the reason, truncated here and in full on the request itself.
   ========================================================================== */

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Bookings',
  robots: { index: false, follow: false },
}

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const TABS: { value: BookingStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'new', label: 'New' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'declined', label: 'Declined' },
  { value: 'done', label: 'Done' },
]

const STATUS_LABEL: Record<BookingStatus, string> = {
  new: 'New',
  confirmed: 'Confirmed',
  declined: 'Declined',
  done: 'Done',
}

/**
 * The inline status buttons. The visible word is the outcome; the accessible
 * name says whose request it is, because a column of bare "Confirm" buttons
 * tells a screen reader nothing about which row it is standing in.
 */
const MOVES: { status: BookingStatus; label: string; say: (name: string) => string }[] = [
  { status: 'confirmed', label: 'Confirm', say: (n) => `Mark ${n} confirmed` },
  { status: 'declined', label: 'Decline', say: (n) => `Mark ${n} declined` },
  { status: 'done', label: 'Done', say: (n) => `Mark ${n} done` },
  { status: 'new', label: 'Reopen', say: (n) => `Put ${n} back to new` },
]

/** Only the statuses this row is not already in. */
function movesFor(status: BookingStatus) {
  return MOVES.filter((move) => move.status !== status)
}

const STATUS_VALUES: readonly string[] = BOOKING_STATUSES

function readStatus(raw: string | string[] | undefined): BookingStatus | null {
  const value = Array.isArray(raw) ? raw[0] : raw
  if (!value || !STATUS_VALUES.includes(value)) return null
  return value as BookingStatus
}

/** A send failure can be a whole SMTP transcript. One line of it, on the row. */
function shorten(reason: string, max = 120): string {
  const clean = reason.replace(/\s+/g, ' ').trim()
  if (!clean) return ''
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`
}

export default async function AdminBookingsPage({ searchParams }: PageProps) {
  await requireAdmin()

  const active = readStatus((await searchParams).status)
  const [counts, requests] = await Promise.all([
    bookingCounts(),
    listBookings(active ?? undefined),
  ])

  const unsent = requests.filter((request) => !request.notified).length

  // An empty list means two different things. A filter with nothing in it is not
  // an empty inbox, and telling the client "no requests yet" when there are
  // eleven under another tab would be a lie the screen tells about itself.
  const emptyFilter = counts.all > 0 ? active : null

  return (
    <>
      <header className="ad-head">
        <div className="ad-head__strip" aria-hidden="true">
          <span className="mono ad-head__chan">09</span>
          <span className="ad-head__rule" />
          <span className="label">Requests</span>
        </div>
        <div className="ad-head__title">
          <h1 className="ad-head__h">Bookings</h1>
          <p className="ad-head__intro">
            Every studio request the contact form has taken, newest first. Nothing here is
            on the public site — set a status to keep track of what you have answered, and
            open a request to read the notes and reply.
          </p>
        </div>
      </header>

      <nav className="bk-tabs" aria-label="Filter requests by status">
        {TABS.map((tab) => {
          const current = tab.value === 'all' ? active === null : active === tab.value
          return (
            <Link
              key={tab.value}
              href={
                tab.value === 'all'
                  ? '/admin/bookings'
                  : `/admin/bookings?status=${tab.value}`
              }
              className="bk-tab"
              aria-current={current ? 'page' : undefined}
            >
              {tab.label}
              <span className="bk-tab__n">{counts[tab.value]}</span>
            </Link>
          )
        })}
      </nav>

      <section className="ad-panel" aria-labelledby="bookings-heading">
        <div className="ad-panel__head">
          <span className="label" id="bookings-heading">
            {active ? STATUS_LABEL[active] : 'All requests'}
          </span>
          <span className="mono desk-count">
            {requests.length} {pluralise(requests.length, 'request')} · {counts.new} new
            {unsent > 0 ? ` · ${unsent} with no email sent` : ''}
          </span>
        </div>

        <div className="ad-panel__body">
          {requests.length === 0 ? (
            <div className="empty">
              <p className="empty__title">
                {emptyFilter
                  ? `Nothing marked ${STATUS_LABEL[emptyFilter].toLowerCase()}`
                  : 'No booking requests yet'}
              </p>
              <p className="empty__text">
                {emptyFilter
                  ? `The other tabs hold ${counts.all} ${pluralise(
                      counts.all,
                      'request',
                    )}. Choose All to see everything.`
                  : 'They will appear here as soon as someone sends one from the contact page.'}
              </p>
            </div>
          ) : (
            <ul className="ad-table">
              {requests.map((request) => {
                const reason = shorten(request.notifyError)

                return (
                  <li
                    className="ad-row bk-row"
                    key={request.id}
                    data-new={request.status === 'new' ? 'true' : undefined}
                  >
                    <div className="bk-row__main">
                      <Link
                        href={`/admin/bookings/${request.id}`}
                        className="ad-row__title bk-row__link"
                      >
                        {request.name}
                      </Link>
                      <span className="mono bk-row__when">
                        {formatDateLong(request.date)} · {formatTime(request.time)}
                      </span>
                      <span className="mono ad-row__meta bk-row__meta">
                        <span>{sessionTypeLabel(request.sessionType)}</span>
                        <span>
                          {request.durationHours}{' '}
                          {pluralise(request.durationHours, 'hour')}
                        </span>
                        <span>
                          {request.people} {pluralise(request.people, 'person', 'people')}
                        </span>
                      </span>
                    </div>

                    <span className="bk-row__flags">
                      <span className={`ad-badge ad-badge--${request.status}`}>
                        {STATUS_LABEL[request.status]}
                      </span>
                      <span className="mono bk-row__ago">
                        {timeAgo(request.createdAt)}
                      </span>
                    </span>

                    {request.notified ? null : (
                      <p className="bk-warn bk-row__warn">
                        <span className="label bk-warn__tag">No email sent</span>
                        <span className="bk-warn__text">
                          Saved, but no email was sent. The request itself is safe.
                        </span>
                        {reason ? (
                          <span className="mono bk-warn__reason">{reason}</span>
                        ) : null}
                      </p>
                    )}

                    <span className="ad-row__tools">
                      {movesFor(request.status).map((move) => (
                        <form
                          key={move.status}
                          action={setBookingStatus.bind(null, request.id, move.status)}
                        >
                          <button
                            type="submit"
                            className="btn btn--sm btn--ghost"
                            aria-label={move.say(request.name)}
                          >
                            {move.label}
                          </button>
                        </form>
                      ))}

                      <Link
                        href={`/admin/bookings/${request.id}`}
                        className="btn btn--sm"
                        aria-label={`Open the request from ${request.name}`}
                      >
                        Open
                      </Link>
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </section>
    </>
  )
}
