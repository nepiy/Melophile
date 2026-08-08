import type { Metadata } from 'next'
import { removeBlackout } from '@/lib/actions/bookings'
import { listBlackouts } from '@/lib/admin-queries'
import { formatDateLong, formatDateMono, pluralise, todayIso } from '@/lib/format'
import { requireAdmin } from '@/lib/session'
import { BlackoutForm } from './BlackoutForm'

import '@/styles/admin-desk.css'

/* ==========================================================================
   Blocked dates.

   A short list with a lot of authority behind it: the booking form reads these
   in the browser to grey a day out, and the server reads them again before it
   will accept a request. Adding one here closes that day in both places.

   Past and upcoming are separated rather than mixed. A list where last year's
   closures sit above next week's is noise, and the upcoming ones are the only
   rows that still do anything.
   ========================================================================== */

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Blackouts',
  robots: { index: false, follow: false },
}

const DAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const

/** The weekday of an ISO day. Built from parts, so it never shifts by a zone. */
function weekday(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!match) return ''
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    12, // midday, so a DST change cannot roll the date over
  )
  return DAYS[date.getDay()] ?? ''
}

export default async function AdminBlackoutsPage() {
  await requireAdmin()

  const today = todayIso()
  const rows = await listBlackouts()
  const upcoming = rows.filter((row) => row.date >= today)
  const past = rows.filter((row) => row.date < today)

  const groups = [
    { key: 'upcoming', heading: 'Today and after', rows: upcoming },
    { key: 'past', heading: 'Already passed', rows: past },
  ].filter((group) => group.rows.length > 0)

  return (
    <>
      <header className="ad-head">
        <div className="ad-head__strip" aria-hidden="true">
          <span className="mono ad-head__chan">10</span>
          <span className="ad-head__rule" />
          <span className="label">Diary</span>
        </div>
        <div className="ad-head__title">
          <h1 className="ad-head__h">Blocked dates</h1>
          <p className="ad-head__intro">
            Days marked here are refused by the booking form, in the browser and on the
            server.
          </p>
        </div>
      </header>

      <section className="ad-panel" aria-labelledby="bo-add-heading">
        <div className="ad-panel__head">
          <span className="label" id="bo-add-heading">
            Block a day
          </span>
        </div>
        <div className="ad-panel__body">
          <BlackoutForm today={today} />
        </div>
      </section>

      <section className="ad-panel" aria-labelledby="bo-list-heading">
        <div className="ad-panel__head">
          <span className="label" id="bo-list-heading">
            Blocked
          </span>
          <span className="mono desk-count">
            {upcoming.length} {pluralise(upcoming.length, 'day')} ahead
            {past.length > 0 ? ` · ${past.length} passed` : ''}
          </span>
        </div>

        <div className="ad-panel__body">
          {rows.length === 0 ? (
            <div className="empty">
              <p className="empty__title">No blocked dates</p>
              <p className="empty__text">
                Add one and the booking form stops offering that day.
              </p>
            </div>
          ) : (
            groups.map((group) => (
              <div className="bo-group" key={group.key}>
                <h2 className="label bo-grouphead">{group.heading}</h2>

                <ul className="ad-table">
                  {group.rows.map((row) => (
                    <li
                      className="ad-row bo-row"
                      key={row.id}
                      data-past={group.key === 'past' ? 'true' : undefined}
                    >
                      <span className="mono bo-row__date">
                        {formatDateMono(row.date)}
                      </span>
                      <span className="mono bo-row__day">{weekday(row.date)}</span>
                      <span className="bo-row__why">
                        {row.reason.trim() || 'No reason given'}
                      </span>

                      <span className="ad-row__tools">
                        <form action={removeBlackout.bind(null, row.id)}>
                          <button
                            type="submit"
                            className="btn btn--sm btn--ghost"
                            aria-label={`Unblock ${formatDateLong(row.date)}`}
                          >
                            Remove
                          </button>
                        </form>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
      </section>
    </>
  )
}
