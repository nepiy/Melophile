import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { AvatarUpload } from '@/components/account/AvatarUpload'
import { getAccount, getAddresses } from '@/lib/account/queries'
import { formatDateLong } from '@/lib/format'
import { accountsEnabled } from '@/lib/supabase/config'
import type { AccountStatus, AddressRow, Gender, ProfileRow } from '@/lib/supabase/types'

/* ==========================================================================
   /account — everything on file, read only.

   Three groups, in the order somebody actually asks about them: who you are,
   where things go, and what the account itself is. Editing lives one tab over,
   because a page that both shows and edits ends up doing neither cleanly.

   A BLANK FIELD IS A STATE, NOT AN EMPTY ROW
   Every value that can be missing renders "Not set" with the link that fixes
   it. A row with nothing after the colon reads as a bug in the page.
   ========================================================================== */

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Your account',
  robots: { index: false, follow: false },
}

const GENDER_LABEL: Record<Gender, string> = {
  female: 'Female',
  male: 'Male',
  non_binary: 'Non-binary',
  prefer_not_to_say: 'Prefer not to say',
  self_described: 'Self-described',
}

const STATUS_TEXT: Record<AccountStatus, string> = {
  active: 'Active',
  suspended: 'Suspended',
  banned: 'Closed',
  deleted: 'Deleted',
}

export default async function AccountOverviewPage() {
  if (!accountsEnabled()) return null

  const account = await getAccount()
  if (!account) redirect('/login?next=/account')

  const { user, profile, avatarUrl } = account
  const addresses = await getAddresses(user.id)
  const preferred =
    addresses.find((address) => address.is_default) ?? addresses[0] ?? null

  const displayName = profile.full_name || (user.username ? `@${user.username}` : 'You')
  const blocked = user.status === 'suspended' || user.status === 'banned'

  return (
    <>
      {/* The picture is the one editable thing here: it is what the page is
          mostly made of, and sending somebody to another tab to change it
          would be silly. It goes when the account is suspended, like every
          other control that writes. */}
      {blocked ? null : (
        <Panel channel="01" strip="Picture" title="Your picture">
          <AvatarUpload currentUrl={avatarUrl} name={displayName} />
        </Panel>
      )}

      <Panel channel="02" strip="Personal" title="Personal">
        <dl className="ac-rows">
          <Row label="Full name">
            <Value value={profile.full_name} cta="Add your name" />
          </Row>

          <Row label="Username">
            {user.username ? (
              <span className="mono">@{user.username}</span>
            ) : (
              <NotSet cta="Choose a username" />
            )}
          </Row>

          <Row label="Email">
            <span className="mono">{user.email}</span>
          </Row>

          <Row label="Phone">
            <Value
              value={
                profile.phone_number
                  ? `${profile.phone_country_code} ${profile.phone_number}`
                  : ''
              }
              cta="Add a phone number"
              mono
            />
          </Row>

          <Row label="Date of birth">
            {profile.date_of_birth ? (
              formatDateLong(profile.date_of_birth.slice(0, 10))
            ) : (
              <NotSet cta="Add your date of birth" />
            )}
          </Row>

          <Row label="Gender">{genderText(profile) ?? <NotSet cta="Answer this" />}</Row>
        </dl>
      </Panel>

      <Panel
        channel="03"
        strip="Address"
        title="Default address"
        text={
          preferred
            ? 'Where an order goes unless you pick another one at checkout.'
            : undefined
        }
      >
        {preferred ? (
          <>
            <dl className="ac-rows">
              <Row label={preferred.label || 'Address'}>
                <AddressLines address={preferred} />
              </Row>
            </dl>
            <p className="ac-panel__foot">
              <Link className="link" href="/account/addresses">
                Manage your addresses
              </Link>
            </p>
          </>
        ) : (
          <div className="ac-empty">
            <p className="ac-empty__title">No addresses yet</p>
            <p className="ac-empty__text">Add one and checkout will fill itself in.</p>
            <div className="ac-empty__actions">
              <Link className="btn btn--sm" href="/account/addresses">
                Add an address
              </Link>
            </div>
          </div>
        )}
      </Panel>

      <Panel
        channel="04"
        strip="Account"
        title="Account"
        text="The account itself, rather than the person on it."
      >
        <dl className="ac-rows">
          <Row label="User ID">
            <span className="mono ac-row__val--ref">
              {user.public_id ?? 'Preparing…'}
            </span>
          </Row>

          <Row label="Registered">{stamp(user.created_at)}</Row>

          <Row label="Last login">
            {user.last_login_at ? stamp(user.last_login_at) : 'This is the first one.'}
          </Row>

          <Row label="Sign-in method">
            {user.auth_method === 'google' ? 'Google' : 'Email and password'}
          </Row>

          <Row label="Email verification">
            {user.email_verified ? (
              'Confirmed'
            ) : (
              <span className="ac-unset">
                <span className="ac-unset__word">Not confirmed</span>
                <Link className="link" href="/verify-email">
                  Send a new link
                </Link>
              </span>
            )}
          </Row>

          <Row label="Account status">{STATUS_TEXT[user.status]}</Row>
        </dl>

        {blocked ? null : (
          <p className="ac-panel__foot">
            <Link className="link" href="/account/settings">
              Edit your details
            </Link>
          </p>
        )}
      </Panel>
    </>
  )
}

/* --------------------------------------------------------------------------
   Furniture
   -------------------------------------------------------------------------- */

function Panel({
  channel,
  strip,
  title,
  text,
  children,
}: {
  channel: string
  strip: string
  title: string
  text?: string
  children: ReactNode
}) {
  return (
    <section className="ac-panel">
      <div className="ac-panel__strip" aria-hidden="true">
        <span className="mono ac-panel__chan">{channel}</span>
        <span className="ac-panel__rule" />
        <span className="label ac-panel__strip-label">{strip}</span>
      </div>

      <h2 className="ac-panel__title">{title}</h2>
      {text ? <p className="ac-panel__text">{text}</p> : null}

      {children}
    </section>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="ac-row">
      <dt className="label ac-row__key">{label}</dt>
      <dd className="ac-row__val">{children}</dd>
    </div>
  )
}

/** A value, or the invitation that stands in for it. */
function Value({
  value,
  cta,
  mono = false,
}: {
  value: string
  /** The words on the link that fills this in. A verb, not a noun. */
  cta: string
  mono?: boolean
}) {
  if (!value) return <NotSet cta={cta} />
  return mono ? <span className="mono">{value}</span> : <>{value}</>
}

function NotSet({ cta }: { cta: string }) {
  return (
    <span className="ac-unset">
      <span className="ac-unset__word">Not set</span>
      <Link className="link" href="/account/settings">
        {cta}
      </Link>
    </span>
  )
}

function AddressLines({ address }: { address: AddressRow }) {
  const region = [address.city, address.state].filter(Boolean).join(', ')

  return (
    <span className="ac-card__lines">
      {address.recipient ? <span>{address.recipient}</span> : null}
      <span>{address.street_address}</span>
      {region ? <span>{region}</span> : null}
      <span>{address.postal_code}</span>
      <span>{address.country}</span>
      {address.phone_number ? (
        <span className="mono ac-card__line--dim">{address.phone_number}</span>
      ) : null}
    </span>
  )
}

/* --------------------------------------------------------------------------
   Values
   -------------------------------------------------------------------------- */

/** Self-described means the words they wrote, not the word "self-described". */
function genderText(profile: ProfileRow): string | null {
  if (!profile.gender) return null
  if (profile.gender === 'self_described') {
    return profile.gender_self_described || GENDER_LABEL.self_described
  }
  return GENDER_LABEL[profile.gender]
}

/**
 * A Postgres timestamptz, as a date.
 *
 * Formatted from the ISO parts rather than through toLocaleDateString, because
 * the server's locale and the browser's differ and the mismatch shows up as a
 * hydration error. The time of day is dropped: on a "registered" line it is
 * noise, and it is the one part that would be wrong in another timezone.
 */
function stamp(iso: string): string {
  return formatDateLong(iso.slice(0, 10))
}
