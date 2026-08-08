import type { Metadata } from 'next'
import { MIN_PASSWORD_LENGTH } from '@/lib/auth'
import { formatDateLong, timeAgo } from '@/lib/format'
import { requireAdmin } from '@/lib/session'
import { PasswordForm } from './PasswordForm'

import '@/styles/admin-desk.css'

/* ==========================================================================
   The account. One thing to do on it: change the password.

   The action already exists — changePassword in src/lib/actions/auth.ts — and
   it does the part that matters: it signs every session for this user out and
   then issues this browser a fresh cookie. This page says so in words, because
   a client who is signed out of their phone by saving a form here should have
   been told that was going to happen.

   MIN_PASSWORD_LENGTH is read here and passed down. src/lib/auth.ts imports
   node:crypto, so the client component cannot import it.
   ========================================================================== */

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Account',
  robots: { index: false, follow: false },
}

/** A Date to this site's canonical ISO day, in local time. */
function isoDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`
}

export default async function AdminAccountPage() {
  const { user } = await requireAdmin()

  return (
    <>
      <header className="ad-head">
        <div className="ad-head__strip" aria-hidden="true">
          <span className="mono ad-head__chan">11</span>
          <span className="ad-head__rule" />
          <span className="label">Account</span>
        </div>
        <div className="ad-head__title">
          <h1 className="ad-head__h">Account</h1>
          <p className="ad-head__intro">
            One login runs the whole admin. Change its password here — there is nothing
            else on this screen, and nothing here touches the public site.
          </p>
        </div>
      </header>

      {user.mustChangePassword ? (
        <div className="ad-banner" role="alert">
          <span className="label ad-banner__tag">Do this first</span>
          <p className="ad-banner__text">
            Change this password before you do anything else. It is the one the site was
            set up with, which means it has been written down somewhere and anyone holding
            it can edit every page.
          </p>
        </div>
      ) : null}

      <section className="ad-panel" aria-labelledby="ac-who-heading">
        <div className="ad-panel__head">
          <span className="label" id="ac-who-heading">
            Signed in as
          </span>
        </div>
        <div className="ad-panel__body">
          <div className="ac-who">
            <span className="label ac-who__label">Email</span>
            <p className="mono ac-who__value">{user.email}</p>
            <p className="ac-note">
              The address is fixed. It is the one you log in with, not an address the site
              shows anyone — the public addresses live under Contact.
            </p>
            {user.lastLoginAt ? (
              <p className="mono ac-who__meta">
                Last signed in {timeAgo(user.lastLoginAt)} ·{' '}
                {formatDateLong(isoDay(user.lastLoginAt))}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <PasswordForm minLength={MIN_PASSWORD_LENGTH} />
    </>
  )
}
