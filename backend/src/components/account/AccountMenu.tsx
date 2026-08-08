'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Dialog, useDialogTitleId } from '@/components/site/Dialog'
import { AddressBook } from '@/components/account/AddressBook'
import { GoogleConnect } from '@/components/account/GoogleConnect'
import { ProfileForm, type ProfileFormValues } from '@/components/account/ProfileForm'
import { signOut } from '@/lib/actions/account-auth'
import { createClient } from '@/lib/supabase/client'
import { SUPABASE_URL, accountsEnabled } from '@/lib/supabase/config'
import type { AddressRow } from '@/lib/supabase/types'

/* ==========================================================================
   The account's own navigation. Two pieces, one client boundary:

     · AccountMenu — the avatar and dropdown in the site nav, on every page
     · AccountTabs — the tab strip inside the /account shell

   They live together because they are the same thing at two scales, and
   because a layout is a Server Component and cannot ask for the current path:
   the tabs need usePathname, so they need to be over here.

   WHY THIS READS THE SESSION ITSELF
   The nav is rendered by SiteChrome, which is shared by every page on the
   site, and threading an account through it would make every page — the
   catalogue, the store, a 404 — wait on a Supabase round trip it does not
   otherwise need. So the menu resolves its own session in the browser, and the
   nav's props do not change at all.

   WHY THAT CANNOT MISMATCH ON HYDRATION
   The server has no session to read from here, so it renders the signed-out
   state. The first client render must therefore render the same thing, and it
   does: `account` starts as `null` and nothing reads the browser until an
   effect runs, which is after hydration has finished. The signed-in menu is a
   second paint, never a contradiction of the first.
   ========================================================================== */

/** What the menu needs to draw itself. Resolved in the browser, or passed in. */
export type AccountMenuProps = {
  signedIn: boolean
  displayName: string
  username: string | null
  avatarUrl: string | null
  details?: AccountDetails | null
}

type Resolved = Omit<AccountMenuProps, 'signedIn'>

type AccountDetails = {
  email: string
  publicId: string | null
  authMethod: 'email' | 'google'
  profile: ProfileFormValues
  addresses: AddressRow[]
}

/**
 * Public URL for an avatar object path.
 *
 * Deliberately a copy of avatarUrl() in @/lib/account/queries — that module is
 * `server-only` and importing it here would break the client build. The bucket
 * is public, so the shape of the URL is not a secret; it is nine characters of
 * duplication against a module boundary that exists for a good reason.
 */
function publicAvatarUrl(path: string | null | undefined): string | null {
  if (!path) return null
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  if (!SUPABASE_URL) return null
  return `${SUPABASE_URL}/storage/v1/object/public/avatars/${path}`
}

/** Up to two letters. A name, then a handle, then the one thing we always have. */
export function initialsOf(name: string): string {
  const words = name
    .replace(/^@/, '')
    .split(/[\s._-]+/)
    .filter(Boolean)

  const first = words[0]
  if (!first) return '?'

  const second = words[1]
  const letters = second ? `${first[0] ?? ''}${second[0] ?? ''}` : first.slice(0, 2)
  return letters.toUpperCase()
}

/* --------------------------------------------------------------------------
   The square: a picture, or initials. Never a stock silhouette.
   -------------------------------------------------------------------------- */

export function Avatar({
  url,
  name,
  size = 'md',
  className,
}: {
  url: string | null
  name: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const classes = [
    'ac-avatar',
    size === 'sm' ? 'ac-avatar--sm' : null,
    size === 'lg' ? 'ac-avatar--lg' : null,
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <span className={classes} aria-hidden="true">
      {url ? (
        /* Not next/image: this URL comes from a Supabase project that is set in
           an env var, so it can never be in next.config's remotePatterns. The
           box is a fixed square, so there is no layout shift to protect
           against either. */
        // eslint-disable-next-line @next/next/no-img-element
        <img className="ac-avatar__img" src={url} alt="" width={96} height={96} />
      ) : (
        <span className="ac-avatar__initials">{initialsOf(name)}</span>
      )}
    </span>
  )
}

/* --------------------------------------------------------------------------
   The nav menu
   -------------------------------------------------------------------------- */

export function AccountMenu() {
  const [account, setAccount] = useState<Resolved | null>(null)
  const [details, setDetails] = useState<AccountDetails | null>(null)

  /* Supabase is not configured on a fresh checkout, and the whole site works
     without it. Nothing to sign in to means nothing to render. */
  const enabled = accountsEnabled()

  useEffect(() => {
    if (!enabled) return

    let live = true
    const supabase = createClient()

    async function load(userId: string | null, authEmail = '') {
      if (!userId) {
        if (live) {
          setAccount(null)
          setDetails(null)
        }
        return
      }

      // Keep the established fields separate from newer profile fields. An
      // unfinished migration must not blank a signed-in user's whole modal.
      const [basicUser, basicProfile, addressRows, idResult, countryResult] =
        await Promise.all([
          supabase
            .from('users')
            .select('username, email, auth_method')
            .eq('id', userId)
            .maybeSingle(),
          supabase
            .from('profiles')
            .select(
              'full_name, profile_picture, phone_number, date_of_birth, gender, gender_self_described, bio, marketing_opt_in',
            )
            .eq('user_id', userId)
            .maybeSingle(),
          supabase
            .from('addresses')
            .select('*')
            .eq('user_id', userId)
            .order('is_default', { ascending: false }),
          supabase.from('users').select('public_id').eq('id', userId).maybeSingle(),
          supabase
            .from('profiles')
            .select('phone_country_code')
            .eq('user_id', userId)
            .maybeSingle(),
        ])

      if (!live) return

      const user = basicUser.data
      const profile = basicProfile.data
      const username = user?.username ?? null
      const safeProfile = profile ?? {
        full_name: '',
        profile_picture: '',
        phone_number: '',
        date_of_birth: null,
        gender: null,
        gender_self_described: '',
        bio: '',
        marketing_opt_in: false,
      }
      const email = user?.email ?? authEmail
      setAccount({
        displayName:
          safeProfile.full_name || (username ? `@${username}` : email || 'Account'),
        username,
        avatarUrl: publicAvatarUrl(safeProfile.profile_picture),
      })
      setDetails({
        email,
        publicId: idResult.data?.public_id ?? null,
        authMethod: user?.auth_method === 'google' ? 'google' : 'email',
        profile: {
          fullName: safeProfile.full_name,
          username: username ?? '',
          phoneCountryCode: countryResult.data?.phone_country_code ?? '+1',
          phoneNumber: safeProfile.phone_number,
          dateOfBirth: safeProfile.date_of_birth?.slice(0, 10) ?? '',
          gender: safeProfile.gender ?? '',
          genderSelfDescribed: safeProfile.gender_self_described,
          bio: safeProfile.bio,
          marketingOptIn: safeProfile.marketing_opt_in,
        },
        addresses: (addressRows.data ?? []) as AddressRow[],
      })
    }

    supabase.auth.getSession().then(({ data }) => {
      void load(data.session?.user.id ?? null, data.session?.user.email ?? '')
    })

    // Signing out in another tab, or a token expiring, changes the bar here.
    const watch = supabase.auth.onAuthStateChange((_event, session) => {
      void load(session?.user.id ?? null, session?.user.email ?? '')
    })

    return () => {
      live = false
      watch.data.subscription.unsubscribe()
    }
  }, [enabled])

  if (!enabled) return null

  return (
    <AccountMenuView
      signedIn={account !== null}
      displayName={account?.displayName ?? ''}
      username={account?.username ?? null}
      avatarUrl={account?.avatarUrl ?? null}
      details={details}
    />
  )
}

/**
 * The menu itself, given everything it needs. Split out so the markup can be
 * reasoned about — and tested — without a Supabase session in the way.
 */
export function AccountMenuView({
  signedIn,
  displayName,
  username,
  avatarUrl,
  details,
}: AccountMenuProps) {
  const [open, setOpen] = useState(false)
  const titleId = useDialogTitleId('account-settings')

  /* Signed out, and the state the server renders. One link, no machinery. */
  if (!signedIn) {
    return (
      <div className="ac-menu">
        <Link className="label ac-menu__signin" href="/login">
          Sign in
        </Link>
      </div>
    )
  }

  const handle = username ? `@${username}` : null

  return (
    <div className="ac-menu">
      <button
        type="button"
        className="ac-menu__trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <Avatar url={avatarUrl} name={displayName} size="sm" />
        <span className="label ac-menu__name">{handle ?? displayName}</span>
        <span className="vh">— your account</span>
      </button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        titleId={titleId}
        closeLabel="Close settings"
      >
        <div className="ac-quick">
          <p className="label ac-quick__label">Account settings</p>
          <h2 className="ac-quick__title" id={titleId}>
            {displayName}
          </h2>
          <dl className="ac-rows">
            <div className="ac-row">
              <dt className="label ac-row__key">User ID</dt>
              <dd className="mono ac-row__val">
                {details ? (details.publicId ?? 'Not issued yet') : 'Loading…'}
              </dd>
            </div>
            <div className="ac-row">
              <dt className="label ac-row__key">Email</dt>
              <dd className="mono ac-row__val">{details?.email || 'Loading…'}</dd>
            </div>
          </dl>
          {details ? (
            <ProfileForm initial={details.profile} />
          ) : (
            <p className="ac-panel__text">Loading your profile…</p>
          )}
          <section className="ac-quick__section">
            <h3 className="label">Connected accounts</h3>
            <GoogleConnect connected={details?.authMethod === 'google'} />
          </section>
          <section className="ac-quick__section">
            <h3 className="label">Delivery address</h3>
            {details ? <AddressBook addresses={details.addresses} /> : null}
          </section>
          <nav className="ac-quick__links" aria-label="Account history">
            <Link
              className="btn btn--ghost btn--sm"
              href="/account/orders"
              onClick={() => setOpen(false)}
            >
              Detailed orders & bookings
            </Link>
            <Link
              className="btn btn--ghost btn--sm"
              href="/account/activity"
              onClick={() => setOpen(false)}
            >
              Account activity
            </Link>
            <Link
              className="btn btn--ghost btn--sm"
              href="/account/addresses"
              onClick={() => setOpen(false)}
            >
              Addresses
            </Link>
          </nav>
          <form className="ac-quick__signout" action={signOut}>
            <button type="submit" className="label ac-menu__item">
              Sign out
            </button>
          </form>
        </div>
      </Dialog>
    </div>
  )
}

/* --------------------------------------------------------------------------
   The tab strip inside the account shell
   -------------------------------------------------------------------------- */

const TABS = [
  { href: '/account', label: 'Profile' },
  /* Owned by another part of the site. Linked, not built, from here. */
  { href: '/account/orders', label: 'Orders' },
  { href: '/account/addresses', label: 'Addresses' },
  { href: '/account/activity', label: 'Activity' },
  { href: '/account/settings', label: 'Settings' },
] as const

export function AccountTabs() {
  const pathname = usePathname()

  return (
    <nav className="ac-tabs" aria-label="Account">
      <div className="ac-tabs__list">
        {TABS.map((tab) => {
          // /account matches only itself; every other tab owns its subtree.
          const active =
            tab.href === '/account'
              ? pathname === '/account'
              : pathname === tab.href || pathname.startsWith(`${tab.href}/`)

          return (
            <Link
              key={tab.href}
              className="label ac-tab"
              href={tab.href}
              aria-current={active ? 'page' : undefined}
            >
              {tab.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
