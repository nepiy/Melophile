import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getAccount, getMyActivity } from '@/lib/account/queries'
import { formatDateLong } from '@/lib/format'
import { accountsEnabled } from '@/lib/supabase/config'
import type { ActivityType } from '@/lib/supabase/types'

/* ==========================================================================
   /account/activity — the audit trail, in plain English.

   It is written by the service role because there is deliberately no INSERT
   policy on the table: a customer must not be able to add to their own
   history, and neither can this page. There is no edit, no delete and no
   filter that hides a line. That is the whole point of an audit trail, and the
   line at the top says so rather than leaving it to be discovered.

   Every ActivityType gets a sentence. The map below is typed as a full
   Record<ActivityType, string>, so adding a value to the union in
   supabase/types.ts breaks the build here rather than rendering a raw
   `suspended_by_admin` at somebody.
   ========================================================================== */

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Activity',
  robots: { index: false, follow: false },
}

const SENTENCE: Record<ActivityType, string> = {
  signed_up: 'Account created',
  signed_in: 'Signed in',
  signed_out: 'Signed out',
  password_changed: 'Password changed',
  password_reset_requested: 'Password reset requested',
  profile_updated: 'Profile updated',
  address_added: 'Address added',
  address_updated: 'Address updated',
  address_deleted: 'Address deleted',
  avatar_updated: 'Picture updated',
  email_verified: 'Email confirmed',
  order_placed: 'Order placed',
  account_deleted: 'Account deleted',
  suspended_by_admin: 'Account suspended by staff',
  banned_by_admin: 'Account closed by staff',
  reinstated_by_admin: 'Account reinstated by staff',
}

export default async function AccountActivityPage() {
  if (!accountsEnabled()) return null

  const account = await getAccount()
  if (!account) redirect('/login?next=/account/activity')

  const entries = await getMyActivity(account.user.id)

  return (
    <section className="ac-panel">
      <div className="ac-panel__strip" aria-hidden="true">
        <span className="mono ac-panel__chan">01</span>
        <span className="ac-panel__rule" />
        <span className="label ac-panel__strip-label">Activity</span>
      </div>

      <h2 className="ac-panel__title">What has happened on this account</h2>
      <p className="ac-panel__text">
        This is your account&rsquo;s history. It cannot be edited, by you or by us.
      </p>

      {entries.length === 0 ? (
        <div className="ac-empty">
          <p className="ac-empty__title">Nothing here yet</p>
          <p className="ac-empty__text">
            Signing in, changing something, placing an order — it all lands here, so you
            can see anything that happens on the account.
          </p>
          <div className="ac-empty__actions">
            <Link className="btn btn--sm" href="/store">
              Have a look at the store
            </Link>
          </div>
        </div>
      ) : (
        <ol className="ac-log">
          {entries.map((entry) => {
            const agent = shortAgent(entry.user_agent)

            return (
              <li key={entry.id} className="ac-log__item">
                <p className="mono ac-log__when">{stamp(entry.created_at)}</p>

                <div>
                  <p className="ac-log__what">{SENTENCE[entry.activity_type]}</p>

                  {entry.ip_address || agent ? (
                    <p className="mono ac-log__meta">
                      {entry.ip_address ? <span>{entry.ip_address}</span> : null}
                      {agent ? <span>{agent}</span> : null}
                    </p>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}

/**
 * A timestamp, as a date and a 24-hour time.
 *
 * Built from the ISO string by hand rather than through toLocaleString: the
 * server's locale and the browser's are not the same, and the difference shows
 * up as a hydration mismatch. Postgres hands these back in UTC, so that is
 * what is shown — labelled, rather than quietly wrong by an hour.
 */
function stamp(iso: string): string {
  const date = formatDateLong(iso.slice(0, 10))
  const time = iso.slice(11, 16)
  return time ? `${date} · ${time} UTC` : date
}

/**
 * The browser and the machine, out of a user agent string.
 *
 * A full user agent is 140 characters of vendor noise. What is worth reading
 * on a security page is "was that me, on my own laptop", and two words answer
 * that better than the whole string does.
 */
function shortAgent(raw: string): string {
  const ua = raw.trim()
  if (!ua) return ''

  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\/|Opera/.test(ua)
      ? 'Opera'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Chrome\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : ''

  const platform = /iPhone|iPad/.test(ua)
    ? 'iOS'
    : /Android/.test(ua)
      ? 'Android'
      : /Mac OS X/.test(ua)
        ? 'macOS'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Linux/.test(ua)
            ? 'Linux'
            : ''

  const words = [browser, platform].filter(Boolean).join(' on ')
  // Nothing recognised: show the head of the string rather than nothing, so an
  // unfamiliar sign-in is still something you can look at.
  return words || `${ua.slice(0, 28)}${ua.length > 28 ? '…' : ''}`
}
