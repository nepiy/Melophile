import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { AccountTabs, Avatar } from '@/components/account/AccountMenu'
import { getAccount } from '@/lib/account/queries'
import { accountsEnabled, accountsSetupHint } from '@/lib/supabase/config'
import type { AccountStatus } from '@/lib/supabase/types'

/* auth.css carries the form controls — .au-field, .au-box, .au-err and the
   password meter — because the account forms ARE the auth forms. account.css
   carries everything that is only true under /account. */
import '@/styles/auth.css'
import '@/styles/account.css'

/* ==========================================================================
   The account shell.

   Identity at the top, tabs under it, the page below that, and the two
   conditions that outrank whatever the page wanted to say:

     · SUSPENDED OR BANNED. The account authenticates fine — the block is
       ours, not Supabase's — so it is enforced in the pages that render a
       form, and explained here. A suspended customer keeps their history and
       their orders; what they lose is the ability to change anything.
     · UNVERIFIED EMAIL. Not an edge case. It is a real state an account can
       sit in for weeks, so it gets a persistent line rather than a toast.

   The signed-out redirect below is a backstop, not the guard. middleware.ts
   turns signed-out visitors around before any of this runs; this catches the
   narrow case of a session whose user was deleted underneath it, where the
   cookie is still valid and the row is gone.
   ========================================================================== */

/* An account page is one person's, and it must never be cached or indexed. */
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Your account',
  robots: { index: false, follow: false },
}

const STATUS_LABEL: Record<AccountStatus, string> = {
  active: 'Active',
  suspended: 'Suspended',
  banned: 'Closed',
  deleted: 'Deleted',
}

export default async function AccountLayout({ children }: { children: ReactNode }) {
  /* The site works without Supabase, and says so rather than throwing. */
  if (!accountsEnabled()) {
    return (
      <section className="sec ac-sec" aria-labelledby="account-off">
        <div className="shell">
          <div className="au__panel">
            <div className="au__strip" aria-hidden="true">
              <span className="mono au__chan">01</span>
              <span className="au__rule" />
              <span className="label au__strip-label">Account</span>
            </div>

            <h1 className="au__title" id="account-off">
              Accounts are not switched on
            </h1>

            <div className="au-off">
              <p className="label au-off__label">Not available</p>
              <p className="au-off__text">
                There is nothing to sign in to yet. The catalogue, the store and the
                studio booking form all work as normal.
              </p>
              <p className="mono au-off__hint">{accountsSetupHint()}</p>
            </div>

            <div className="au__foot">
              <p className="au__foot-line">
                <Link className="link" href="/">
                  Back to the site
                </Link>
              </p>
            </div>
          </div>
        </div>
      </section>
    )
  }

  const account = await getAccount()
  if (!account) redirect('/login?next=/account')

  const { user, profile, avatarUrl } = account
  const displayName = profile.full_name || (user.username ? `@${user.username}` : 'You')
  const blocked = user.status === 'suspended' || user.status === 'banned'

  return (
    <section className="sec ac-sec" aria-labelledby="account-name">
      <div className="shell">
        <div className="ac-id">
          <Avatar url={avatarUrl} name={displayName} size="lg" />

          <div className="ac-id__text">
            <h1 className="ac-id__name" id="account-name">
              {displayName}
            </h1>

            {user.username ? (
              <p className="mono ac-id__handle">@{user.username}</p>
            ) : null}

            <p className="ac-id__chips">
              <span
                className="label ac-chip"
                data-tone={
                  blocked ? 'peak' : user.status === 'active' ? 'lamp' : undefined
                }
              >
                {STATUS_LABEL[user.status]}
              </span>
              {user.email_verified ? null : (
                <span className="label ac-chip">Email not confirmed</span>
              )}
            </p>
          </div>
        </div>

        <AccountTabs />

        {blocked ? (
          <div className="ac-banner" role="status">
            <p className="label ac-banner__label">
              {user.status === 'banned' ? 'Account closed' : 'Account suspended'}
            </p>
            <p className="ac-banner__text">
              {user.status === 'banned'
                ? 'This account has been closed, so nothing on it can be changed. Your orders are still ours to honour — write to us and we will pick it up by hand.'
                : 'This account is suspended, so nothing on it can be changed for now. Your orders and your history are untouched. Write to us and we will look into it.'}
            </p>
            {user.status_reason ? (
              <p className="mono ac-banner__reason">Reason: {user.status_reason}</p>
            ) : null}
            <p className="ac-banner__text">
              <Link className="link" href="/contact">
                Write to us
              </Link>
            </p>
          </div>
        ) : null}

        {user.email_verified ? null : (
          <div className="ac-note">
            <p className="label ac-note__label">Confirm your email</p>
            <p className="ac-note__text">
              {user.email} has not been confirmed yet. Until it is, we cannot send you a
              password reset, and receipts may not reach you.
            </p>
            <p className="ac-note__text">
              <Link className="link" href="/verify-email">
                Send a new confirmation link
              </Link>
            </p>
          </div>
        )}

        <div className="ac-body">{children}</div>
      </div>
    </section>
  )
}
