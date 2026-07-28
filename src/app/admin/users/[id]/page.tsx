import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'
import { DangerButton } from '@/components/admin/fields'
import { deleteUser } from '@/lib/actions/admin-users'
import { getUserDetail, userLabel } from '@/lib/admin-users-queries'
import { formatDateLong, formatMoney, pluralise, timeAgo } from '@/lib/format'
import { currencySymbol, orderStatusWord, paymentStatusWord } from '@/lib/orders/store'
import { requireAdmin } from '@/lib/session'
import type {
  AccountStatus,
  ActivityType,
  AddressRow,
  Gender,
  ProfileRow,
} from '@/lib/supabase/types'
import { UserNoteForm } from './UserNoteForm'

// admin-events.css as well as this screen's own: the definition rows, the
// pre-wrap address block and the danger footer are the ones the order editor
// already draws, and a second copy under a second prefix would be two things to
// keep in step rather than one.
import '@/styles/admin-events.css'
import '@/styles/admin-users.css'

/* ==========================================================================
   One customer.

   Everything the account holds, in the order somebody actually asks for it:
   who they are, what they told us about themselves, where things get posted,
   what they bought, what has happened on the account, and only then the
   buttons that change any of it.

   THREE RULES HOLD THIS SCREEN TOGETHER
     · everything the customer typed is rendered as TEXT. The bio and the
       addresses get white-space: pre-wrap and no HTML at all — this is one of
       the few places a stranger's words reach the admin, and they get the same
       treatment as a booking note
     · the activity trail is read-only, here as everywhere. There is no INSERT
       policy on it for customers and no update or delete policy for anyone, so
       this page can show it and nothing on this page can rewrite it
     · nothing on this screen emails the customer. The staff panel says so, and
       it is true — the only thing a suspension changes is whether the sign-in
       check in src/lib/actions/account-auth.ts lets them through
   ========================================================================== */

export const dynamic = 'force-dynamic'

type PageProps = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params
  const label = await userLabel(id)
  return { title: label ?? 'Customer', robots: { index: false, follow: false } }
}

const STATUS_WORD: Record<AccountStatus, string> = {
  active: 'Active',
  suspended: 'Suspended',
  banned: 'Banned',
  deleted: 'Deleted',
}

const METHOD: Record<string, string> = {
  email: 'Email & password',
  google: 'Google',
}

const GENDER: Record<Gender, string> = {
  female: 'Female',
  male: 'Male',
  non_binary: 'Non-binary',
  prefer_not_to_say: 'Prefer not to say',
  self_described: 'Self-described',
}

/**
 * Every activity type gets a sentence.
 *
 * A full Record, so adding a value to the union in supabase/types.ts breaks the
 * build here rather than printing a raw `suspended_by_admin` on the screen.
 */
const SENTENCE: Record<ActivityType, string> = {
  signed_up: 'Created the account',
  signed_in: 'Signed in',
  signed_out: 'Signed out',
  password_changed: 'Changed their password',
  password_reset_requested: 'Asked for a password reset',
  profile_updated: 'Updated their profile',
  address_added: 'Added an address',
  address_updated: 'Updated an address',
  address_deleted: 'Deleted an address',
  avatar_updated: 'Changed their picture',
  email_verified: 'Confirmed their email address',
  order_placed: 'Placed an order',
  account_deleted: 'Deleted their own account',
  suspended_by_admin: 'Suspended by staff',
  banned_by_admin: 'Banned by staff',
  reinstated_by_admin: 'Reinstated by staff',
}

/**
 * A timestamptz as a date and a 24-hour time.
 *
 * Built from the ISO string by hand rather than through toLocaleString: the
 * server's locale and the browser's are not the same, and the difference is a
 * hydration mismatch. Postgres hands these back in UTC, so that is what is
 * shown — labelled, rather than quietly wrong by an hour.
 */
function stamp(iso: string | null): string {
  if (!iso) return ''
  const date = formatDateLong(iso.slice(0, 10))
  const time = iso.slice(11, 16)
  return time ? `${date} · ${time} UTC` : date
}

function ago(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '' : timeAgo(date)
}

/**
 * The browser and the machine, out of a user agent string.
 *
 * A full user agent is 140 characters of vendor noise. What is worth reading
 * next to a sign-in is "was that them, on their own laptop", and two words
 * answer that better than the whole string does.
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
  return words || `${ua.slice(0, 28)}${ua.length > 28 ? '…' : ''}`
}

/** How they answered the gender question, including when they wrote their own. */
function genderWord(profile: ProfileRow | null): string {
  if (!profile?.gender) return 'Not given'
  if (profile.gender === 'self_described') {
    return profile.gender_self_described.trim() || 'Self-described'
  }
  return GENDER[profile.gender] ?? profile.gender
}

/** An address as the postal service would want it, one line at a time. */
function addressLines(address: AddressRow): string {
  return [
    address.recipient,
    address.street_address,
    address.city,
    address.state,
    address.postal_code,
    address.country,
  ]
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
}

type Line = { label: string; value: ReactNode; mono?: boolean }

function Lines({ lines }: { lines: Line[] }) {
  return (
    <dl className="aor-lines">
      {lines.map((line) => (
        <div className="aor-line" key={line.label}>
          <dt className="label aor-line__label">{line.label}</dt>
          <dd className={`aor-line__value${line.mono ? ' aor-line__value--mono' : ''}`}>
            {line.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}

export default async function AdminUserPage({ params }: PageProps) {
  await requireAdmin()

  const { id } = await params
  const read = await getUserDetail(id)

  // Cannot read the database is not the same fact as no such customer, and it
  // must not be shown as a 404.
  if (!read.ok) {
    return (
      <>
        <header className="ad-head">
          <div className="ad-head__strip" aria-hidden="true">
            <span className="mono ad-head__chan">14</span>
            <span className="ad-head__rule" />
            <span className="label">Customer</span>
          </div>
          <div className="ad-head__title">
            <h1 className="ad-head__h">Customer</h1>
          </div>
        </header>

        <section className="ad-panel" aria-labelledby="au-offline">
          <div className="ad-panel__head">
            <span className="label" id="au-offline">
              Customer accounts are not switched on
            </span>
          </div>
          <div className="ad-panel__body">
            <p className="au-setup">{read.error}</p>
            <p className="au-setup__note">
              Nothing was lost and nothing else in the admin is affected. This screen
              cannot see the accounts database, so it is not going to guess at what is in
              it.
            </p>
          </div>
        </section>
      </>
    )
  }

  if (!read.value) notFound()

  const { user, profile, avatarUrl, addresses, orders, activity, spend } = read.value

  const name = profile?.full_name.trim() || user.username || user.email
  const blocked = user.status === 'suspended' || user.status === 'banned'

  const identity: Line[] = [
    { label: 'Name', value: profile?.full_name.trim() || 'No name given' },
    {
      label: 'Username',
      value: user.username ? `@${user.username}` : 'None',
      mono: true,
    },
    {
      label: 'Email',
      value: (
        <a className="link" href={`mailto:${user.email}`}>
          {user.email}
        </a>
      ),
    },
    {
      label: 'Email confirmed',
      value: user.email_verified
        ? 'Yes'
        : 'No — they have not used the confirmation link yet',
    },
    { label: 'Signs in with', value: METHOD[user.auth_method] ?? user.auth_method },
    {
      label: 'Customer id',
      // Selectable in one click: this is the string you quote in a Supabase
      // query or a support thread, and half of one is worse than none.
      value: <span className="au-id">{user.id}</span>,
      mono: true,
    },
    { label: 'Registered', value: stamp(user.created_at), mono: true },
    {
      label: 'Last signed in',
      value: user.last_login_at
        ? `${stamp(user.last_login_at)} · ${ago(user.last_login_at)}`
        : 'Never',
      mono: true,
    },
  ]

  const details: Line[] = [
    { label: 'Phone', value: profile?.phone_number.trim() || 'Not given', mono: true },
    {
      label: 'Date of birth',
      value: profile?.date_of_birth
        ? formatDateLong(profile.date_of_birth.slice(0, 10))
        : 'Not given',
      mono: true,
    },
    { label: 'Gender', value: genderWord(profile) },
    {
      label: 'About them',
      // Their words, as text, with the line breaks they typed and nothing else.
      value: profile?.bio.trim() ? (
        <span className="aor-address">{profile.bio}</span>
      ) : (
        'They have not written anything.'
      ),
    },
    {
      label: 'Marketing email',
      value: profile?.marketing_opt_in
        ? 'Opted in — they agreed to hear from the label'
        : 'Not opted in — do not add them to a mailing list',
    },
  ]

  return (
    <>
      <header className="ad-head">
        <div className="ad-head__strip" aria-hidden="true">
          <span className="mono ad-head__chan">14</span>
          <span className="ad-head__rule" />
          <span className="label">Customer</span>
        </div>

        <div className="ad-head__title">
          <div className="au-head__who">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className="au-face au-face--lg"
                src={avatarUrl}
                alt=""
                width={64}
                height={64}
              />
            ) : null}
            <h1 className="ad-head__h">{name}</h1>
          </div>

          <p className="mono au-head__meta">
            {user.username ? `@${user.username} · ` : ''}
            {user.email}
          </p>

          <p className="ad-head__intro">
            Registered {ago(user.created_at)}. Nothing on this screen is public, and
            nothing you change here emails them.
          </p>
        </div>

        <div className="ad-head__aside">
          <a className="btn ad-btn--primary" href={`mailto:${user.email}`}>
            Email them
          </a>
          <Link href="/admin/users" className="btn btn--sm btn--ghost">
            All customers
          </Link>
        </div>
      </header>

      {blocked ? (
        <div className="ad-banner" role="alert">
          <span className="label ad-banner__tag">
            {user.status === 'banned' ? 'Account banned' : 'Account suspended'}
          </span>
          <p className="ad-banner__text">
            This account cannot sign in. The person is told{' '}
            {user.status === 'banned'
              ? '“this account has been closed”'
              : '“this account is suspended”'}{' '}
            and nothing more. Their orders are untouched and still readable here.
          </p>
          <p className="mono au-banner__reason">
            {user.status_reason.trim() || 'No reason was recorded.'}
            {user.status_changed_at ? ` · ${stamp(user.status_changed_at)}` : ''}
          </p>
        </div>
      ) : null}

      <section className="ad-panel" aria-labelledby="au-identity">
        <div className="ad-panel__head">
          <span className="label" id="au-identity">
            Identity
          </span>
          <span className="ad-badge au-status" data-status={user.status}>
            {STATUS_WORD[user.status] ?? user.status}
          </span>
        </div>
        <div className="ad-panel__body">
          <Lines lines={identity} />
        </div>
      </section>

      <section className="ad-panel" aria-labelledby="au-profile">
        <div className="ad-panel__head">
          <span className="label" id="au-profile">
            Profile
          </span>
          <span className="mono aor-count">Theirs to edit, not yours</span>
        </div>
        <div className="ad-panel__body">
          {profile ? null : (
            <p className="aor-note">
              This account has no profile row. Every sign-up gets one from a database
              trigger, so this is a row that went missing rather than one that was never
              made.
            </p>
          )}
          <Lines lines={details} />
        </div>
      </section>

      <section className="ad-panel" aria-labelledby="au-addresses">
        <div className="ad-panel__head">
          <span className="label" id="au-addresses">
            Addresses
          </span>
          <span className="mono aor-count">
            {addresses.length} {pluralise(addresses.length, 'address', 'addresses')}
          </span>
        </div>
        <div className="ad-panel__body">
          {addresses.length === 0 ? (
            <p className="aor-note">
              No addresses saved. An order still carries the address it was posted to —
              that lives on the order, not here.
            </p>
          ) : (
            <ul className="au-cards">
              {addresses.map((address) => (
                <li className="au-card" key={address.id}>
                  <span className="au-card__top">
                    <span className="label au-card__label">
                      {address.label.trim() || 'Address'}
                    </span>
                    {address.is_default ? (
                      <span className="ad-badge au-chip" data-tone="lamp">
                        Default
                      </span>
                    ) : null}
                  </span>
                  <p className="aor-address au-card__body">{addressLines(address)}</p>
                  {address.phone_number.trim() ? (
                    <p className="mono au-card__meta">{address.phone_number}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="ad-panel" aria-labelledby="au-orders">
        <div className="ad-panel__head">
          <span className="label" id="au-orders">
            Orders
          </span>
          <span className="mono aor-count">
            {orders.length} {pluralise(orders.length, 'order')} ·{' '}
            {formatMoney(spend, currencySymbol(orders[0]?.currency ?? 'GBP'))} paid
          </span>
        </div>
        <div className="ad-panel__body">
          <p className="aor-note">
            Everything they have bought while signed in. An order they placed as a guest
            before registering is claimed the moment the addresses match — until then it
            is on Customer orders under their email rather than here.
          </p>

          {orders.length === 0 ? (
            <p className="aor-note">Nothing yet.</p>
          ) : (
            <ul className="ad-table">
              {orders.map((order) => {
                const symbol = currencySymbol(order.currency)
                return (
                  <li className="ad-row au-order" key={order.id}>
                    <div className="au-order__main">
                      <Link
                        href={`/admin/customer-orders/${order.id}`}
                        className="mono aor-row__ref"
                      >
                        {order.reference}
                      </Link>
                      <span className="mono au-order__when">
                        {formatDateLong(order.created_at.slice(0, 10))} ·{' '}
                        {order.itemCount} {pluralise(order.itemCount, 'item')}
                      </span>
                    </div>

                    <span className="mono au-order__total">
                      {formatMoney(order.total_amount, symbol)}
                    </span>

                    <span className="au-row__flags">
                      <span className="ad-badge au-chip">
                        {paymentStatusWord(order.payment_status)}
                      </span>
                      <span className="ad-badge au-chip">
                        {orderStatusWord(order.order_status)}
                      </span>
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </section>

      <section className="ad-panel" aria-labelledby="au-activity">
        <div className="ad-panel__head">
          <span className="label" id="au-activity">
            Activity
          </span>
          <span className="mono aor-count">Last {activity.length}, newest first</span>
        </div>
        <div className="ad-panel__body">
          <p className="aor-note">
            The account&rsquo;s own history. It cannot be edited — not by them, and not
            from here. Times are UTC.
          </p>

          {activity.length === 0 ? (
            <p className="aor-note">Nothing recorded yet.</p>
          ) : (
            <ol className="au-log">
              {activity.map((entry) => {
                const agent = shortAgent(entry.user_agent)
                return (
                  <li className="au-log__item" key={entry.id}>
                    <p className="mono au-log__when">{stamp(entry.created_at)}</p>
                    <div className="au-log__body">
                      <p className="au-log__what">
                        {SENTENCE[entry.activity_type] ?? entry.activity_type}
                      </p>
                      {entry.ip_address || agent ? (
                        <p className="mono au-log__meta">
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
        </div>
      </section>

      <UserNoteForm
        userId={user.id}
        status={user.status}
        reason={user.status_reason}
        name={name}
      />

      {/* Its own form, and it has to be: a submit button inside the staff form
          would post the staff form, and a nested <form> is invalid HTML that the
          browser silently drops. */}
      <form className="aor-danger" action={deleteUser.bind(null, user.id)}>
        <p className="aor-danger__text">
          Deleting removes the person: their sign-in, their profile, their addresses and
          their activity trail, permanently and with no archive. Their orders are kept —
          every reference, line and total stays on Customer orders — but the link to a
          named customer is removed first, so what is left is a sale to an email address.
          Suspend them instead if this is a dispute rather than a request to be forgotten.
        </p>
        <DangerButton confirmLabel="Delete for good">
          Delete customer
          <span className="vh"> {name}</span>
        </DangerButton>
      </form>
    </>
  )
}
