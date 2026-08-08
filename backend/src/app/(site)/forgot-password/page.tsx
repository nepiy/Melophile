import type { Metadata } from 'next'
import Link from 'next/link'
import { ForgotPasswordForm } from '@/components/auth/AuthForms'
import { accountsEnabled, accountsSetupHint } from '@/lib/supabase/config'

import '@/styles/auth.css'

/* ==========================================================================
   /forgot-password

   One field, and one answer.

   The answer is the same whether or not that address has an account. There is
   deliberately no "no such account" state: a form that tells you which
   addresses are registered is an account-existence oracle, and somebody will
   point a script at it. That is a security rule, not a matter of taste.
   ========================================================================== */

export const metadata: Metadata = {
  title: 'Reset your password',
  robots: { index: false, follow: false },
}

export default function ForgotPasswordPage() {
  return (
    <section className="sec au-sec" aria-labelledby="forgot-heading">
      <div className="shell">
        <div className="au__panel">
          <div className="au__strip" aria-hidden="true">
            <span className="mono au__chan">01</span>
            <span className="au__rule" />
            <span className="label au__strip-label">Account</span>
          </div>

          <h1 className="au__title" id="forgot-heading">
            Reset your password
          </h1>
          <p className="au__text">
            Give us the address you signed up with and we will send a link to set a new
            password. It is valid for an hour.
          </p>

          {accountsEnabled() ? (
            <ForgotPasswordForm />
          ) : (
            <div className="au-off">
              <p className="label au-off__label">Not available</p>
              <p className="au-off__text">
                Customer accounts are not switched on yet, so there is no password to
                reset.
              </p>
              <p className="mono au-off__hint">{accountsSetupHint()}</p>
            </div>
          )}

          <div className="au__foot">
            <p className="au__foot-line">
              Remembered it?{' '}
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
