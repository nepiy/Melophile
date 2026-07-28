import type { Metadata } from 'next'
import Link from 'next/link'
import { listUsers, type AdminUser, type UserCounts } from '@/lib/admin-users-queries'
import { formatDateShort, pluralise, timeAgo } from '@/lib/format'
import { requireAdmin } from '@/lib/session'
import type { AccountStatus } from '@/lib/supabase/types'

// admin-events.css as well as this screen's own: the status tabs, the mono
// panel readout and the row hairlines are the ones the orders admin already
// draws, and a second copy of them under a second prefix would be two things
// to keep in step rather than one.
import '@/styles/admin-events.css'
import '@/styles/admin-users.css'

/* ==========================================================================
   Customers.

   The people with accounts on the site — not the orders they placed, which are
   next door under Customer orders. This screen answers three questions and is
   built around them: who is this, can they sign in, and when were they last
   here.

   THE SEARCH IS A QUERY STRING, NOT JAVASCRIPT. A filtered list can be
   bookmarked, sent to somebody and stepped back through, and it works with
   scripting off. The status tabs carry the search with them, so narrowing by
   one does not silently throw away the other.

   WHEN SUPABASE IS NOT CONFIGURED this screen says so, in the words that name
   the missing keys. It does not render an empty table: "no customers" and
   "cannot see the customers" are different facts, and only one of them is
   about the business.
   ========================================================================== */

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Customers',
  robots: { index: false, follow: false },
}

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

type Tab = { value: AccountStatus | 'all'; label: string; key: keyof UserCounts }

const TABS: Tab[] = [
  { value: 'all', label: 'All', key: 'all' },
  { value: 'active', label: 'Active', key: 'active' },
  { value: 'suspended', label: 'Suspended', key: 'suspended' },
  { value: 'banned', label: 'Banned', key: 'banned' },
]

/** The three states a customer can be filtered to. Nothing else reaches a query. */
const FILTERABLE: readonly string[] = ['active', 'suspended', 'banned']

function readStatus(raw: string | string[] | undefined): AccountStatus | null {
  const value = Array.isArray(raw) ? raw[0] : raw
  if (!value || !FILTERABLE.includes(value)) return null
  return value as AccountStatus
}

function readText(raw: string | string[] | undefined): string {
  const value = Array.isArray(raw) ? raw[0] : raw
  return (value ?? '').trim().slice(0, 120)
}

const METHOD: Record<string, string> = {
  email: 'Email & password',
  google: 'Google',
}

const STATUS_WORD: Record<AccountStatus, string> = {
  active: 'Active',
  suspended: 'Suspended',
  banned: 'Banned',
  deleted: 'Deleted',
}

/** Two letters for a customer with no picture. Never an empty circle. */
function initials(user: AdminUser): string {
  const source = user.fullName.trim() || user.username?.trim() || user.email
  const words = source.split(/[\s@._-]+/).filter(Boolean)
  const letters = words
    .slice(0, 2)
    .map((word) => word[0] ?? '')
    .join('')
  return (letters || source.slice(0, 2)).toUpperCase()
}

/** A timestamptz to 'x days ago'. Blank rather than 'Invalid Date' on rubbish. */
function ago(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '' : timeAgo(date)
}

export default async function AdminUsersPage({ searchParams }: PageProps) {
  await requireAdmin()

  const params = await searchParams
  const term = readText(params.q)
  const active = readStatus(params.status)

  const read = await listUsers({ q: term, status: active })

  /** A tab link that keeps the search it was clicked from. */
  function tabHref(value: AccountStatus | 'all'): string {
    const query = new URLSearchParams()
    if (value !== 'all') query.set('status', value)
    if (term) query.set('q', term)
    const suffix = query.toString()
    return suffix ? `/admin/users?${suffix}` : '/admin/users'
  }

  const head = (
    <header className="ad-head">
      <div className="ad-head__strip" aria-hidden="true">
        <span className="mono ad-head__chan">14</span>
        <span className="ad-head__rule" />
        <span className="label">Customers</span>
      </div>
      <div className="ad-head__title">
        <h1 className="ad-head__h">Customers</h1>
        <p className="ad-head__intro">
          Everyone with an account on the site, newest first. Nothing here is public. Open
          a customer to read their profile, their addresses, what they have bought and
          everything that has happened on the account.
        </p>
      </div>
    </header>
  )

  if (!read.ok) {
    return (
      <>
        {head}
        <section className="ad-panel" aria-labelledby="au-offline">
          <div className="ad-panel__head">
            <span className="label" id="au-offline">
              Customer accounts are not switched on
            </span>
          </div>
          <div className="ad-panel__body">
            <p className="au-setup">{read.error}</p>
            <p className="au-setup__note">
              Everything else in this admin — bookings, the store, releases, events, the
              site copy — is unaffected and carries on working exactly as it does now.
              This screen is empty because it cannot see the database, not because there
              is nobody in it.
            </p>
          </div>
        </section>
      </>
    )
  }

  const { users, counts, total, capped } = read.value

  return (
    <>
      {head}

      <form className="au-search" action="/admin/users" method="get" role="search">
        <div className="au-search__field">
          <label className="label au-search__label" htmlFor="au-q">
            Search customers
          </label>
          <input
            className="ad-input au-search__input"
            id="au-q"
            name="q"
            type="search"
            defaultValue={term}
            maxLength={120}
            placeholder="Email, username or name"
          />
        </div>

        {/* The tab travels with the search, so searching inside Suspended does
            not silently drop you back into everybody. */}
        {active ? <input type="hidden" name="status" value={active} /> : null}

        <div className="au-search__tools">
          <button type="submit" className="btn btn--sm">
            Search
          </button>
          {term ? (
            <Link
              href={active ? `/admin/users?status=${active}` : '/admin/users'}
              className="btn btn--sm btn--ghost"
            >
              Clear
            </Link>
          ) : null}
        </div>
      </form>

      <nav className="aor-tabs" aria-label="Filter customers by status">
        {TABS.map((tab) => {
          const current = tab.value === 'all' ? active === null : active === tab.value
          return (
            <Link
              key={tab.value}
              href={tabHref(tab.value)}
              className="aor-tab"
              aria-current={current ? 'page' : undefined}
            >
              {tab.label}
              <span className="aor-tab__n">{counts[tab.key]}</span>
            </Link>
          )
        })}
      </nav>

      <section className="ad-panel" aria-labelledby="au-list">
        <div className="ad-panel__head">
          <span className="label" id="au-list">
            {active ? STATUS_WORD[active] : term ? 'Search results' : 'All customers'}
          </span>
          <span className="mono aor-count">
            {users.length} {pluralise(users.length, 'customer')} · {total} on the database
            {capped ? ' · newest 500 read' : ''}
          </span>
        </div>

        <div className="ad-panel__body">
          {users.length === 0 ? (
            <div className="empty">
              <p className="empty__title">
                {term && counts.all === 0
                  ? 'Nothing matches that search.'
                  : active
                    ? `Nobody is ${STATUS_WORD[active].toLowerCase()}`
                    : 'No customers yet'}
              </p>
              <p className="empty__text">
                {term && counts.all === 0
                  ? 'Email addresses, usernames and full names are searched. Clear the search to see everyone.'
                  : active
                    ? `The other tabs hold ${counts.all} ${pluralise(
                        counts.all,
                        'customer',
                      )}. Choose All to see everyone.`
                    : 'They will appear here the moment somebody creates an account on the site.'}
              </p>
            </div>
          ) : (
            <ul className="ad-table">
              {users.map((user) => {
                const name = user.fullName.trim() || 'No name given'
                const last = ago(user.last_login_at)

                return (
                  <li
                    className="ad-row au-row"
                    key={user.id}
                    data-flag={user.status === 'active' ? undefined : 'true'}
                  >
                    <span className="au-row__face">
                      {user.avatarUrl ? (
                        // A remote avatar from Supabase storage, not site
                        // content: it has no stored row and next/image has no
                        // remote pattern for it.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          className="au-face"
                          src={user.avatarUrl}
                          alt=""
                          width={40}
                          height={40}
                          loading="lazy"
                        />
                      ) : (
                        <span className="mono au-face au-face--text" aria-hidden="true">
                          {initials(user)}
                        </span>
                      )}
                    </span>

                    <div className="au-row__main">
                      <Link href={`/admin/users/${user.id}`} className="au-row__name">
                        {name}
                      </Link>
                      <span className="mono au-row__handle">
                        {user.username ? `@${user.username}` : 'No username'}
                      </span>
                      <a className="mono au-row__mail" href={`mailto:${user.email}`}>
                        {user.email}
                      </a>
                    </div>

                    <span className="mono ad-row__meta au-row__meta">
                      <span>{METHOD[user.auth_method] ?? user.auth_method}</span>
                      <span>Joined {formatDateShort(user.created_at.slice(0, 10))}</span>
                      <span>{last ? `Last in ${last}` : 'Never signed in'}</span>
                    </span>

                    <span className="au-row__flags">
                      <span className="ad-badge au-status" data-status={user.status}>
                        {STATUS_WORD[user.status] ?? user.status}
                      </span>
                      <span
                        className="ad-badge au-chip"
                        data-tone={user.email_verified ? undefined : 'warn'}
                      >
                        {user.email_verified ? 'Verified' : 'Unverified'}
                      </span>
                    </span>

                    <span className="ad-row__tools">
                      <Link href={`/admin/users/${user.id}`} className="btn btn--sm">
                        Open
                        <span className="vh"> {name}</span>
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
