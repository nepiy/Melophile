import type { Metadata } from 'next'
import Link from 'next/link'
import { ResendVerificationForm } from '@/components/auth/AuthForms'
import { accountsEnabled, accountsSetupHint } from '@/lib/supabase/config'

import '@/styles/auth.css'

/* ==========================================================================
   /verify-email

   Where somebody lands when the confirmation email never turned up, or turned
   up an hour too late. The form asks for the address and sends a fresh link.

   Same rule as the reset form: one answer for every address. "That address is
   already confirmed" and "we have never heard of that address" would both
   tell a stranger something about somebody else's account, so neither is said.
   ========================================================================== */

export const metadata: Metadata = {
  title: 'Confirm your email',
  robots: { index: false, follow: false },
}

export default function VerifyEmailPage() {
  return (
    <section className="sec au-sec" aria-labelledby="verify-heading">
      <div className="shell">
        <div className="au__panel">
          <div className="au__strip" aria-hidden="true">
            <span className="mono au__chan">01</span>
            <span className="au__rule" />
            <span className="label au__strip-label">Account</span>
          </div>

          <h1 className="au__title" id="verify-heading">
            Confirm your email
          </h1>
          <p className="au__text">
            New accounts get a link by email, and signing in only works once it has been
            used. Links last an hour. If yours has gone, ask for another below.
          </p>

          {accountsEnabled() ? (
            <ResendVerificationForm />
          ) : (
            <div className="au-off">
              <p className="label au-off__label">Not available</p>
              <p className="au-off__text">
                Customer accounts are not switched on yet, so there is nothing to confirm.
              </p>
              <p className="mono au-off__hint">{accountsSetupHint()}</p>
            </div>
          )}

          <div className="au__foot">
            <p className="au__foot-line">
              Already confirmed?{' '}
              <Link className="link" href="/login">
                Sign in
              </Link>
              .
            </p>
            <p className="au__foot-line">
              Wrong address, or nothing arriving at all?{' '}
              <Link className="link" href="/contact">
                Write to us
              </Link>{' '}
              and we will sort it out by hand.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
