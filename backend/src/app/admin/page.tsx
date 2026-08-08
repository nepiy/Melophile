import { desc, eq } from 'drizzle-orm'
import type { Metadata } from 'next'
import Link from 'next/link'
import { artists, blackouts, bookings, db, releases, services } from '@/db'
import { adminStats } from '@/lib/admin-users-queries'
import { formatMoney, pluralise, timeAgo, todayIso } from '@/lib/format'
import { requireAdmin } from '@/lib/session'

import '@/styles/admin-users.css'

/* ==========================================================================
   Dashboard. Not a report — a short answer to "what needs me today", then
   four lines telling the client how to do the three jobs they came here for.
   Every count is mono, every sentence is the serif.
   ========================================================================== */

export const metadata: Metadata = {
  title: 'Dashboard',
  robots: { index: false, follow: false },
}

type StatusRow = { status: string }

function count(rows: StatusRow[], status: string): number {
  return rows.filter((row) => row.status === status).length
}

export default async function AdminDashboardPage() {
  await requireAdmin()

  // Two Postgres views, or one sentence saying why not. Never zeros: a
  // dashboard that reports "£0 revenue" when it simply cannot see the database
  // is worse than one that says it cannot see the database.
  const accounts = await adminStats()

  const [releaseRows, artistRows, serviceRows, bookingRows, blackoutRows] =
    await Promise.all([
      db.select({ status: releases.status }).from(releases).all(),
      db.select({ status: artists.status }).from(artists).all(),
      db.select({ status: services.status }).from(services).all(),
      db
        .select({ status: bookings.status, createdAt: bookings.createdAt })
        .from(bookings)
        .orderBy(desc(bookings.createdAt))
        .all(),
      db.select({ date: blackouts.date }).from(blackouts).all(),
    ])

  const newBookings = count(bookingRows, 'new')
  const latest = bookingRows[0]
  const today = todayIso()
  const upcomingBlackouts = blackoutRows.filter((row) => row.date >= today).length

  const notNotified = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(eq(bookings.notified, false))
    .all()

  const stats = [
    {
      href: '/admin/releases',
      label: 'Releases',
      value: count(releaseRows, 'published'),
      note: `${count(releaseRows, 'draft')} in draft`,
    },
    {
      href: '/admin/artists',
      label: 'Artists',
      value: count(artistRows, 'published'),
      note: `${count(artistRows, 'draft')} in draft`,
    },
    {
      href: '/admin/services',
      label: 'Services',
      value: count(serviceRows, 'published'),
      note: `${count(serviceRows, 'draft')} in draft`,
    },
    {
      href: '/admin/blackouts',
      label: 'Blocked dates',
      value: upcomingBlackouts,
      note: 'today or later',
    },
  ]

  return (
    <>
      <header className="ad-head">
        <div className="ad-head__strip" aria-hidden="true">
          <span className="mono ad-head__chan">01</span>
          <span className="ad-head__rule" />
          <span className="label">Overview</span>
        </div>
        <div className="ad-head__title">
          <h1 className="ad-head__h">Dashboard</h1>
          <p className="ad-head__intro">
            Everything the public site shows is edited from here. A change is live the
            moment you save it — there is nothing to deploy.
          </p>
        </div>
        <div className="ad-head__aside">
          <a href="/" className="arrow-link" target="_blank" rel="noopener noreferrer">
            View the site
            <span className="arrow-link__line" aria-hidden="true" />
            <span className="vh">(opens in a new tab)</span>
          </a>
        </div>
      </header>

      <section className="ad-panel" aria-labelledby="attention-heading">
        <div className="ad-panel__head">
          <span className="label" id="attention-heading">
            Needs attention
          </span>
        </div>

        <div className="ad-panel__body">
          <ul className="ad-attend">
            <li className="ad-attend__item">
              <span className="mono ad-attend__n">
                {String(newBookings).padStart(2, '0')}
              </span>
              <div className="ad-attend__body">
                <p className="ad-attend__text">
                  {newBookings === 0
                    ? 'No new booking requests. Everything that came in has been answered.'
                    : `${newBookings} new booking ${pluralise(
                        newBookings,
                        'request',
                      )} waiting for a reply.`}
                </p>
                {latest ? (
                  <p className="mono ad-attend__meta">
                    Last request {timeAgo(latest.createdAt)}
                  </p>
                ) : (
                  <p className="mono ad-attend__meta">No requests yet</p>
                )}
              </div>
              <Link href="/admin/bookings" className="btn btn--sm">
                Open bookings
              </Link>
            </li>

            {notNotified.length > 0 ? (
              <li className="ad-attend__item">
                <span className="mono ad-attend__n">
                  {String(notNotified.length).padStart(2, '0')}
                </span>
                <div className="ad-attend__body">
                  <p className="ad-attend__text">
                    {notNotified.length} {pluralise(notNotified.length, 'request')} saved
                    without sending an email notification. The request is safe — the send
                    failed. Check them, and check the mail settings.
                  </p>
                </div>
                <Link href="/admin/bookings" className="btn btn--sm">
                  Review them
                </Link>
              </li>
            ) : null}
          </ul>
        </div>
      </section>

      <section className="ad-sec" aria-labelledby="counts-heading">
        <h2 className="label ad-sec__head" id="counts-heading">
          Published now
        </h2>
        <ul className="ad-stats">
          {stats.map((stat) => (
            <li className="ad-stat" key={stat.href}>
              <Link href={stat.href} className="ad-stat__link">
                <span className="mono ad-stat__n">{stat.value}</span>
                <span className="label ad-stat__label">{stat.label}</span>
                <span className="mono ad-stat__note">{stat.note}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="ad-panel ad-howto" aria-labelledby="howto-heading">
        <div className="ad-panel__head">
          <span className="label" id="howto-heading">
            How to
          </span>
        </div>
        <div className="ad-panel__body">
          <ol className="ad-howto__list">
            <li className="ad-howto__item">
              <span className="mono ad-howto__n">01</span>
              <p className="ad-howto__text">
                <strong>Add a release.</strong> Releases → New release. Give it a title,
                the artist, the date and the catalogue number, drop the sleeve into the
                image slot and write the alt text. Set it to Published and save, and it
                appears in the catalogue and on the home page.
              </p>
            </li>
            <li className="ad-howto__item">
              <span className="mono ad-howto__n">02</span>
              <p className="ad-howto__text">
                <strong>Add an artist.</strong> Artists → New artist. A name, one short
                paragraph, one photo. Leave it as Draft while you are still writing —
                draft rows are invisible on the site, and you can publish them later
                without touching anything else.
              </p>
            </li>
            <li className="ad-howto__item">
              <span className="mono ad-howto__n">03</span>
              <p className="ad-howto__text">
                <strong>Swap the About photos.</strong> About → the photo slots. Drop a
                new file into any slot, write the alt text, save. An empty slot is only
                visible in here; the public page closes up around it.
              </p>
            </li>
            <li className="ad-howto__item">
              <span className="mono ad-howto__n">04</span>
              <p className="ad-howto__text">
                <strong>Change the words on the site.</strong> Settings holds the nav
                labels and the footer, Contact holds the address, hours and the booking
                copy. They are the same words the pages read — edit them here and they
                change there.
              </p>
            </li>
          </ol>
        </div>
      </section>

      {/* Customer accounts, added below everything that was already here. The
          figures come from admin_user_stats and admin_order_stats, computed in
          Postgres rather than by pulling every row across and counting it. */}
      <section className="ad-sec" aria-labelledby="accounts-heading">
        <h2 className="label ad-sec__head" id="accounts-heading">
          Customers and revenue
        </h2>

        {accounts.ok ? (
          <>
            <ul className="ad-stats">
              <li className="ad-stat">
                <Link href="/admin/users" className="ad-stat__link">
                  <span className="mono ad-stat__n">
                    {accounts.value.users.total_users}
                  </span>
                  <span className="label ad-stat__label">Customers</span>
                  <span className="mono ad-stat__note">
                    {accounts.value.users.verified_users} confirmed their email
                  </span>
                </Link>
              </li>
              <li className="ad-stat">
                <Link href="/admin/users?status=active" className="ad-stat__link">
                  <span className="mono ad-stat__n">
                    {accounts.value.users.active_users}
                  </span>
                  <span className="label ad-stat__label">Active</span>
                  <span className="mono ad-stat__note">
                    {accounts.value.users.active_last_30_days} signed in this month
                  </span>
                </Link>
              </li>
              <li className="ad-stat">
                <Link href="/admin/users?status=suspended" className="ad-stat__link">
                  <span className="mono ad-stat__n">
                    {accounts.value.users.suspended_users}
                  </span>
                  <span className="label ad-stat__label">Suspended</span>
                  <span className="mono ad-stat__note">cannot sign in</span>
                </Link>
              </li>
              <li className="ad-stat">
                <Link href="/admin/users?status=banned" className="ad-stat__link">
                  <span className="mono ad-stat__n">
                    {accounts.value.users.banned_users}
                  </span>
                  <span className="label ad-stat__label">Banned</span>
                  <span className="mono ad-stat__note">cannot sign in</span>
                </Link>
              </li>
              <li className="ad-stat">
                <div className="au-stat">
                  <span className="mono ad-stat__n">
                    {accounts.value.users.new_last_7_days}
                  </span>
                  <span className="label ad-stat__label">New this week</span>
                  <span className="mono ad-stat__note">
                    {accounts.value.users.new_last_30_days} in the last 30 days
                  </span>
                </div>
              </li>
            </ul>

            <h3 className="label au-substat" id="revenue-heading">
              Orders through customer accounts
            </h3>

            <ul className="ad-stats" aria-labelledby="revenue-heading">
              <li className="ad-stat">
                <Link href="/admin/customer-orders" className="ad-stat__link">
                  <span className="mono ad-stat__n">
                    {accounts.value.orders.total_orders}
                  </span>
                  <span className="label ad-stat__label">Orders</span>
                  <span className="mono ad-stat__note">
                    {accounts.value.orders.paid_orders} paid
                  </span>
                </Link>
              </li>
              <li className="ad-stat">
                <Link
                  href="/admin/customer-orders?status=pending"
                  className="ad-stat__link"
                >
                  <span className="mono ad-stat__n">
                    {accounts.value.orders.pending_orders}
                  </span>
                  <span className="label ad-stat__label">Awaiting payment</span>
                  <span className="mono ad-stat__note">nothing taken yet</span>
                </Link>
              </li>
              <li className="ad-stat">
                <div className="au-stat">
                  {/* Integer pence, formatted at the last possible moment. */}
                  <span className="mono ad-stat__n">
                    {formatMoney(accounts.value.orders.revenue_total)}
                  </span>
                  <span className="label ad-stat__label">Taken, all time</span>
                  <span className="mono ad-stat__note">paid orders only</span>
                </div>
              </li>
              <li className="ad-stat">
                <div className="au-stat">
                  <span className="mono ad-stat__n">
                    {formatMoney(accounts.value.orders.revenue_30_days)}
                  </span>
                  <span className="label ad-stat__label">Last 30 days</span>
                  <span className="mono ad-stat__note">paid orders only</span>
                </div>
              </li>
              <li className="ad-stat">
                <div className="au-stat">
                  <span className="mono ad-stat__n">
                    {formatMoney(accounts.value.orders.average_order_value)}
                  </span>
                  <span className="label ad-stat__label">Average order</span>
                  <span className="mono ad-stat__note">across paid orders</span>
                </div>
              </li>
            </ul>
          </>
        ) : (
          <div className="ad-panel">
            <div className="ad-panel__body">
              <p className="au-setup">{accounts.error}</p>
              <p className="au-setup__note">
                No figure is shown rather than a row of zeros — there may well be
                customers and orders on the database; this dashboard simply cannot see
                them. Everything above is unaffected.
              </p>
            </div>
          </div>
        )}
      </section>
    </>
  )
}
