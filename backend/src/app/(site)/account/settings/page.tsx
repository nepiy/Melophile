import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { AvatarUpload } from '@/components/account/AvatarUpload'
import { DeleteAccountForm } from '@/components/account/DeleteAccountForm'
import { PasswordChangeForm } from '@/components/account/PasswordChangeForm'
import { ProfileForm } from '@/components/account/ProfileForm'
import { GoogleConnect } from '@/components/account/GoogleConnect'
import { getAccount } from '@/lib/account/queries'
import { accountsEnabled } from '@/lib/supabase/config'

/* ==========================================================================
   /account/settings — three panels, three separate forms.

   They are separate on purpose. One big form with three submit buttons means a
   password change that fails takes a saved profile down with it, and a person
   who only wanted to fix a typo in their name has to look at a delete-account
   button while they do it.

   A SUSPENDED ACCOUNT SEES NONE OF THEM
   The block is enforced here rather than only in the banner upstairs: a form
   that renders is a form somebody will fill in, and a save that gets refused
   at the end is worse than one that was never offered. Row level security and
   the actions are the real guard; this is the honest version of it.
   ========================================================================== */

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Settings',
  robots: { index: false, follow: false },
}

export default async function AccountSettingsPage() {
  if (!accountsEnabled()) return null

  const account = await getAccount()
  if (!account) redirect('/login?next=/account/settings')

  const { user, profile, avatarUrl } = account
  const displayName = profile.full_name || (user.username ? `@${user.username}` : 'You')

  if (user.status === 'suspended' || user.status === 'banned') {
    return (
      <Panel channel="01" strip="Settings" title="Editing is off">
        <p className="ac-panel__text">
          Nothing on a {user.status === 'banned' ? 'closed' : 'suspended'} account can be
          changed. Your details, your addresses and your history are all still there, and
          none of it has been touched.
        </p>
        <p className="ac-panel__foot">
          <Link className="link" href="/contact">
            Write to us
          </Link>{' '}
          and we will look at it.
        </p>
      </Panel>
    )
  }

  return (
    <>
      <Panel
        channel="01"
        strip="Profile"
        title="Your details"
        text="What we call you, how to reach you, and what other people see."
      >
        <AvatarUpload currentUrl={avatarUrl} name={displayName} />

        <ProfileForm
          initial={{
            fullName: profile.full_name,
            username: user.username ?? '',
            phoneCountryCode: profile.phone_country_code,
            phoneNumber: profile.phone_number,
            // A date input wants YYYY-MM-DD and nothing else.
            dateOfBirth: profile.date_of_birth ? profile.date_of_birth.slice(0, 10) : '',
            gender: profile.gender ?? '',
            genderSelfDescribed: profile.gender_self_described,
            bio: profile.bio,
            marketingOptIn: profile.marketing_opt_in,
          }}
        />
      </Panel>

      <Panel channel="02" strip="Password" title="Password">
        {user.auth_method === 'google' ? (
          <>
            <p className="ac-panel__text">
              You sign in with Google, so this account has no password for us to change.
              Your password is Google&rsquo;s, and it is changed there.
            </p>
            <p className="ac-panel__foot">
              Signing in a different way, or worried about the account?{' '}
              <Link className="link" href="/contact">
                Write to us
              </Link>
              .
            </p>
          </>
        ) : (
          <>
            <p className="ac-panel__text">
              Changing it asks for the current one first. That is what stops somebody who
              found an unlocked laptop from taking the account.
            </p>
            <PasswordChangeForm />
          </>
        )}
      </Panel>

      <Panel channel="03" strip="Sign-in" title="Connected accounts">
        <p className="ac-panel__text">
          Connect Google to sign in with either Google or your existing email account.
        </p>
        <GoogleConnect connected={user.auth_method === 'google'} />
      </Panel>

      <Panel
        channel="04"
        strip="Delete"
        title="Delete your account"
        text="Closing the account for good. Read what goes and what stays before you start."
        danger
      >
        <DeleteAccountForm />
      </Panel>
    </>
  )
}

function Panel({
  channel,
  strip,
  title,
  text,
  danger = false,
  children,
}: {
  channel: string
  strip: string
  title: string
  text?: string
  danger?: boolean
  children: ReactNode
}) {
  return (
    <section className={danger ? 'ac-panel ac-panel--danger' : 'ac-panel'}>
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
