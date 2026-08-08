import type { Metadata } from 'next'
import Link from 'next/link'
import { SignInForm } from '@/components/auth/AuthForms'
import { GoogleButton } from '@/components/auth/GoogleButton'
import { accountsEnabled, accountsSetupHint } from '@/lib/supabase/config'

import '@/styles/auth.css'

/* ==========================================================================
   /login

   Two ways in, one panel: email and password, or Google. The middleware sends
   anybody already signed in to /account, so this page never has to consider
   that case.

   `?next=` carries the page somebody was trying to reach when the middleware
   turned them around. It is echoed into the form and into the Google button,
   and is checked again in the action and once more in /auth/callback — no
   layer trusts the one before it.

   `?error=` is set by /auth/callback and by signInWithGoogle. Each code gets
   one plain sentence. None of them says whether an account exists.
   ========================================================================== */

export const metadata: Metadata = {
  title: 'Sign in',
  // An auth page has nothing to offer a search engine, and a sign-in form in
  // an index is a phishing template waiting to be screenshotted.
  robots: { index: false, follow: false },
}

const ERRORS: Record<string, string> = {
  link: 'That link has expired or has already been used.',
  cancelled: 'Google sign-in was cancelled.',
  google:
    'Google sign-in could not be started. Use your email and password instead, or try again.',
  blocked: 'This account is suspended or closed. Email us and we will look into it.',
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams
  const next = onSitePath(first(params.next))
  const code = first(params.error)

  const enabled = accountsEnabled()
  const message = code === 'not-configured' ? accountsSetupHint() : ERRORS[code ?? '']

  return (
    <section className="sec au-sec" aria-labelledby="login-heading">
      <div className="shell">
        <div className="au__panel">
          <div className="au__strip" aria-hidden="true">
            <span className="mono au__chan">01</span>
            <span className="au__rule" />
            <span className="label au__strip-label">Account</span>
          </div>

          <h1 className="au__title" id="login-heading">
            Sign in
          </h1>
          <p className="au__text">
            Your orders, your downloads and your saved addresses, in one place.
          </p>

          {message ? <p className="au-line">{message}</p> : null}

          {enabled ? (
            <>
              <SignInForm next={next} />

              <p className="label au-or">or</p>
              <GoogleButton next={next} />
            </>
          ) : (
            <div className="au-off">
              <p className="label au-off__label">Not available</p>
              <p className="au-off__text">
                Customer accounts are not switched on yet. The catalogue, the store and
                the studio booking form all work as normal.
              </p>
              <p className="mono au-off__hint">{accountsSetupHint()}</p>
            </div>
          )}

          <div className="au__foot">
            <p className="au__foot-line">
              <Link className="link" href="/forgot-password">
                Forgotten your password?
              </Link>
            </p>
            <p className="au__foot-line">
              No account yet?{' '}
              <Link className="link" href="/signup">
                Create one
              </Link>
              .
            </p>
            <p className="au__foot-line">
              Never got the confirmation email?{' '}
              <Link className="link" href="/verify-email">
                Ask for a new link
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

/**
 * Only ever hand on a path on this site. The action and the OAuth callback
 * both check this again — this one exists so a crafted /login?next=… link
 * cannot even put a foreign URL into the page's markup.
 */
function onSitePath(raw: string | undefined): string {
  if (!raw) return '/account'
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/account'
  if (/[\s\\]/.test(raw)) return '/account'
  return raw
}
