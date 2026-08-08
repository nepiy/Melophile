import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'
import { DangerButton } from '@/components/admin/fields'
import type { BookingStatus } from '@/db/schema'
import { deleteBooking, setBookingStatus } from '@/lib/actions/bookings'
import { getBooking } from '@/lib/admin-queries'
import {
  formatDateLong,
  formatDateMono,
  formatTime,
  pluralise,
  sessionTypeLabel,
  timeAgo,
} from '@/lib/format'
import { safeUrl } from '@/lib/markdown'
import { requireAdmin } from '@/lib/session'
import { NoteForm } from './NoteForm'

import '@/styles/admin-desk.css'

/* ==========================================================================
   One studio request.

   Everything the person typed, on hairline rows, in the order they typed it.
   Two rules hold this screen together:

     · the notes are PLAIN TEXT. They are rendered as text with white-space:
       pre-wrap, never as markdown and never through
       dangerouslySetInnerHTML — this is the one place on the site where a
       stranger's words reach the screen, and they get no HTML at all
     · if the notification email failed, that is the first thing on the page,
       in full, with the reason. The client is told the request is stored and
       that nobody has been written to. Both halves matter.
   ========================================================================== */

export const dynamic = 'force-dynamic'

type PageProps = { params: Promise<{ id: string }> }

function noIndex(title: string): Metadata {
  return { title, robots: { index: false, follow: false } }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params
  const request = /^\d+$/.test(id) ? await getBooking(Number(id)) : null
  return noIndex(request ? `Request from ${request.name}` : 'Request')
}

const STATES: { status: BookingStatus; label: string }[] = [
  { status: 'new', label: 'New' },
  { status: 'confirmed', label: 'Confirmed' },
  { status: 'declined', label: 'Declined' },
  { status: 'done', label: 'Done' },
]

/** A Date to this site's canonical ISO day, in local time. */
function isoDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`
}

/** A Date to 24-hour 'HH:MM', which is what formatTime() reads. */
function isoTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(
    date.getMinutes(),
  ).padStart(2, '0')}`
}

export default async function BookingDetailPage({ params }: PageProps) {
  await requireAdmin()

  const { id } = await params
  if (!/^\d+$/.test(id)) notFound()

  const request = await getBooking(Number(id))
  if (!request) notFound()

  // Refused rather than rendered if it is not something a browser can open —
  // safeUrl() drops javascript: and friends. Blank and refused both omit the row.
  const reference = safeUrl(request.referenceUrl)

  // Only the subject is encoded: the address has already been through the
  // booking schema, which rejects spaces, quotes, commas and angle brackets, and
  // percent-encoding the @ helps no mail client anywhere.
  const replyHref = `mailto:${request.email}?subject=${encodeURIComponent(
    `Your studio request — ${formatDateLong(request.date)}`,
  )}`

  const lines: { label: string; value: ReactNode; mono?: boolean }[] = [
    { label: 'Name', value: request.name },
    {
      label: 'Email',
      value: (
        <a className="link" href={`mailto:${request.email}`}>
          {request.email}
        </a>
      ),
    },
  ]

  if (request.phone.trim()) {
    lines.push({
      label: 'Phone',
      value: (
        <a className="link" href={`tel:${request.phone.replace(/[^\d+]/g, '')}`}>
          {request.phone}
        </a>
      ),
      mono: true,
    })
  }

  lines.push(
    { label: 'Day', value: formatDateLong(request.date), mono: true },
    { label: 'Start time', value: formatTime(request.time), mono: true },
    { label: 'Session', value: sessionTypeLabel(request.sessionType) },
    {
      label: 'Length',
      value: `${request.durationHours} ${pluralise(request.durationHours, 'hour')}`,
      mono: true,
    },
    {
      label: 'People',
      value: `${request.people} ${pluralise(request.people, 'person', 'people')}`,
      mono: true,
    },
  )

  if (reference) {
    lines.push({
      label: 'Reference',
      value: (
        <a className="link" href={reference} target="_blank" rel="noopener noreferrer">
          {request.referenceUrl}
          <span className="vh"> (opens in a new tab)</span>
        </a>
      ),
    })
  }

  lines.push({
    label: 'Arrived',
    value: `${formatDateLong(isoDay(request.createdAt))} at ${formatTime(
      isoTime(request.createdAt),
    )} · ${timeAgo(request.createdAt)}`,
    mono: true,
  })

  return (
    <>
      <header className="ad-head">
        <div className="ad-head__strip" aria-hidden="true">
          <span className="mono ad-head__chan">09</span>
          <span className="ad-head__rule" />
          <span className="label">Request</span>
        </div>
        <div className="ad-head__title">
          <h1 className="ad-head__h">{request.name}</h1>
          <p className="mono bk-head__meta">
            {formatDateMono(request.date)} · {formatTime(request.time)} ·{' '}
            {sessionTypeLabel(request.sessionType)}
          </p>
          <p className="ad-head__intro">
            Sent from the contact page {timeAgo(request.createdAt)}. Nothing on this
            screen is public, and nothing you change here emails anyone.
          </p>
        </div>
        <div className="ad-head__aside">
          <a className="btn ad-btn--primary" href={replyHref}>
            Reply by email
          </a>
          <Link href="/admin/bookings" className="btn btn--sm btn--ghost">
            All requests
          </Link>
        </div>
      </header>

      {request.notified ? null : (
        <div className="ad-banner" role="alert">
          <span className="label ad-banner__tag">No email was sent</span>
          <p className="ad-banner__text">
            This request was saved, and the person was told it had been received — but the
            notification email to you failed, so nothing about it reached your inbox. The
            request itself is stored here in full and is not at risk. Check the mail
            settings, then reply by email as usual.
          </p>
          {request.notifyError.trim() ? (
            <p className="mono bk-banner__reason">{request.notifyError}</p>
          ) : (
            <p className="mono bk-banner__reason">
              No reason was recorded for the failure.
            </p>
          )}
        </div>
      )}

      <section className="ad-panel" aria-labelledby="bk-what">
        <div className="ad-panel__head">
          <span className="label" id="bk-what">
            What they asked for
          </span>
          <span className={`ad-badge ad-badge--${request.status}`}>
            {STATES.find((state) => state.status === request.status)?.label ??
              request.status}
          </span>
        </div>
        <div className="ad-panel__body">
          <dl className="bk-lines">
            {lines.map((line) => (
              <div className="bk-line" key={line.label}>
                <dt className="label bk-line__label">{line.label}</dt>
                <dd
                  className={`bk-line__value${line.mono ? ' bk-line__value--mono' : ''}`}
                >
                  {line.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="ad-panel" aria-labelledby="bk-notes">
        <div className="ad-panel__head">
          <span className="label" id="bk-notes">
            Their notes
          </span>
        </div>
        <div className="ad-panel__body">
          {request.notes.trim() ? (
            <p className="bk-notes">{request.notes}</p>
          ) : (
            <p className="bk-notes bk-notes--empty">They did not write anything here.</p>
          )}
        </div>
      </section>

      <section className="ad-panel" aria-labelledby="bk-status">
        <div className="ad-panel__head">
          <span className="label" id="bk-status">
            Status
          </span>
        </div>
        <div className="ad-panel__body">
          <p className="bk-note">
            Yours to track with. It changes nothing on the site and sends nothing to
            anyone.
          </p>
          <div
            className="bk-states"
            role="group"
            aria-label={`Status of the request from ${request.name}`}
          >
            {STATES.map((state) => (
              <form
                key={state.status}
                action={setBookingStatus.bind(null, request.id, state.status)}
              >
                <button
                  type="submit"
                  className="btn btn--sm bk-state"
                  aria-pressed={request.status === state.status}
                >
                  {state.label}
                </button>
              </form>
            ))}
          </div>
        </div>
      </section>

      <NoteForm id={request.id} note={request.adminNote} />

      {/* Its own form, and it has to be: a submit button inside the note form
          would post the note form, and a nested <form> is invalid HTML that the
          browser silently drops. */}
      <form className="bk-danger" action={deleteBooking.bind(null, request.id)}>
        <p className="bk-danger__text">
          Deleting removes this request and its note for good. Nothing is archived, and
          the person is not told. Reply first if you still need to.
        </p>
        <DangerButton confirmLabel="Delete it">
          Delete request
          <span className="vh"> from {request.name}</span>
        </DangerButton>
      </form>
    </>
  )
}
