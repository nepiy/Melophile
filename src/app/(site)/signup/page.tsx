import type { Metadata } from 'next'
import Link from 'next/link'
import { SignUpForm } from '@/components/auth/AuthForms'
import { GoogleButton } from '@/components/auth/GoogleButton'
import { accountsEnabled, accountsSetupHint } from '@/lib/supabase/config'

import '@/styles/auth.css'

/* ==========================================================================
   /signup

   Creating an account does not sign anybody in — Supabase sends a
   confirmation link first, and until it is used there is no session. The form
   replaces itself with that instruction, and says nothing that implies
   otherwise.

   Google is the other door, and it needs no confirmation step because Google
   has already done it.
   ========================================================================== */

export const metadata: Metadata = {
  title: 'Create an account',
  robots: { index: false, follow: false },
}

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams
  const next = onSitePath(first(params.next))

  return (
    <section className="sec au-sec" aria-labelledby="signup-heading">
      <div className="shell">
        <div className="au__panel">
          <div className="au__strip" aria-hidden="true">
            <span className="mono au__chan">01</span>
            <span className="au__rule" />
            <span className="label au__strip-label">Account</span>
          </div>

          <h1 className="au__title" id="signup-heading">
            Create an account
          </h1>
          <p className="au__text">
            Keep your orders, downloads and addresses together. It takes a minute, and you
            can order without one.
          </p>

          {accountsEnabled() ? (
            <>
              <SignUpForm />

              <p className="label au-or">or</p>
              <GoogleButton next={next} />
            </>
          ) : (
            <div className="au-off">
              <p className="label au-off__label">Not available</p>
              <p className="au-off__text">
                Customer accounts are not switched on yet, so there is nothing to sign up
                for. The store still takes orders without one.
              </p>
              <p className="mono au-off__hint">{accountsSetupHint()}</p>
            </div>
          )}

          <div className="au__foot">
            <p className="au__foot-line">
              Already have an account?{' '}
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

/** A repeated query parameter is a mistake, not a list. Take the first. */
function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

/** Only ever hand on a path on this site. Checked again in the action and in
 *  /auth/callback — no layer trusts the one before it. */
function onSitePath(raw: string | undefined): string {
  if (!raw) return '/account'
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/account'
  if (/[\s\\]/.test(raw)) return '/account'
  return raw
}
