import type { Metadata } from 'next'
import Link from 'next/link'
import { ResetPasswordForm } from '@/components/auth/AuthForms'
import { accountsEnabled, accountsSetupHint } from '@/lib/supabase/config'
import { getCurrentUser } from '@/lib/supabase/server'

import '@/styles/auth.css'

/* ==========================================================================
   /reset-password

   The link in the recovery email does not point here. It points at
   /auth/callback, which exchanges the code for a session and forwards here —
   so by the time this page renders, the visitor is already authenticated and
   all that is left to collect is the new password.

   Which means the absence of a session is itself the answer: the link has
   expired, or has already been spent. Saying so here beats letting somebody
   type a password twice and then discovering it. What is never said is whose
   account the link belonged to.
   ========================================================================== */

export const metadata: Metadata = {
  title: 'Set a new password',
  robots: { index: false, follow: false },
}

export default async function ResetPasswordPage() {
  const enabled = accountsEnabled()
  // Verified against Supabase, not decoded from the cookie.
  const user = enabled ? await getCurrentUser() : null

  return (
    <section className="sec au-sec" aria-labelledby="reset-heading">
      <div className="shell">
        <div className="au__panel">
          <div className="au__strip" aria-hidden="true">
            <span className="mono au__chan">01</span>
            <span className="au__rule" />
            <span className="label au__strip-label">Account</span>
          </div>

          <h1 className="au__title" id="reset-heading">
            Set a new password
          </h1>
          <p className="au__text">
            Choose something long. A short phrase you can remember beats a clever one you
            cannot.
          </p>

          {!enabled ? (
            <div className="au-off">
              <p className="label au-off__label">Not available</p>
              <p className="au-off__text">
                Customer accounts are not switched on yet, so there is no password to set.
              </p>
              <p className="mono au-off__hint">{accountsSetupHint()}</p>
            </div>
          ) : user ? (
            <ResetPasswordForm />
          ) : (
            <div className="au-off">
              <p className="label au-off__label">Link spent</p>
              <p className="au-off__text">
                That reset link has expired or has already been used. Ask for a new one
                and it will arrive in a minute.
              </p>
              <p className="au-off__text">
                <Link className="link" href="/forgot-password">
                  Send another reset link
                </Link>
              </p>
            </div>
          )}

          <div className="au__foot">
            <p className="au__foot-line">
              Nothing to reset after all?{' '}
              <Link className="link" href="/login">
                Sign in
              </Link>
              .
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
