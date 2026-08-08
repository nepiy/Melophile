import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import { logActivity, recordLogin } from '@/lib/account/queries'
import { SUPABASE_ANON_KEY, SUPABASE_URL, accountsEnabled } from '@/lib/supabase/config'
import type { Database } from '@/lib/supabase/types'

/* ==========================================================================
   The one address Supabase sends people back to.

   Three journeys land here and only one of them is a sign-in:

     · Google — the visitor came back from Google's consent screen
     · Email confirmation — they clicked the link in the sign-up email
     · Password recovery — they clicked the link in the reset email, and are
       forwarded on to /reset-password with a session already established

   All three arrive as `?code=…`, which is exchanged for a session here. This
   is a Route Handler, so unlike a Server Component it CAN write cookies — and
   it has to, because this is the moment the session is first put in the
   browser.

   THE BUG THIS FILE EXISTS TO NOT HAVE
   `next` is attacker-controllable: anybody can send a victim to
   /auth/callback?next=https://evil.example and, if it were echoed into a
   redirect, the site would be a laundering service for phishing links that
   start on a domain the victim trusts. Nothing is ever redirected to unless
   safeNext() has agreed it is a path on this site, and the resolved URL is
   checked against our own origin a second time before it is used.
   ========================================================================== */

export const dynamic = 'force-dynamic'

/** Where anything unrecognised, unsafe or absent goes. */
const FALLBACK = '/account'

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin

  // No Supabase project, no auth journey to complete. The rest of the site
  // works without accounts, so this is a redirect, not an error.
  if (!accountsEnabled()) return NextResponse.redirect(new URL('/', origin))

  const params = request.nextUrl.searchParams
  const next = safeNext(params.get('next'))

  /* Supabase forwards the provider's own failure as `error` and
     `error_description`. The commonest by far is somebody deciding, on
     Google's screen, that they would rather not — which is a choice, not a
     fault, and must not read as one. */
  const failure = params.get('error')
  if (failure) {
    const description = params.get('error_description') ?? ''
    const cancelled =
      failure === 'access_denied' || /denied|cancel|closed/i.test(description)
    return NextResponse.redirect(
      new URL(cancelled ? '/login?error=cancelled' : '/login?error=link', origin),
    )
  }

  const code = params.get('code')
  if (!code) return NextResponse.redirect(new URL('/login?error=link', origin))

  const jar = await cookies()

  // Built exactly as src/lib/supabase/server.ts builds it — anon key, so row
  // level security still applies — but without the swallowed write, because
  // here the write is the entire point and a failure must not pass silently.
  const supabase = createServerClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return jar.getAll()
      },
      setAll(items) {
        for (const { name, value, options } of items) jar.set(name, value, options)
      },
    },
  })

  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  /* An expired link, a link already spent, a code from another project, a
     replayed URL out of somebody's history: one answer for all of them. The
     reason is diagnostic detail about somebody else's account and is not ours
     to hand to whoever happens to be holding the link. */
  if (error || !data.session || !data.user) {
    return NextResponse.redirect(new URL('/login?error=link', origin))
  }

  const user = data.user

  /* Suspended and banned accounts authenticate perfectly well — the block is
     ours, not Supabase's — so it has to be enforced after the token exists,
     exactly as signIn() does. Without this, Google is a way around a ban. */
  const row = await recordLogin(user.id)
  if (!row || row.status !== 'active') {
    await supabase.auth.signOut()
    return NextResponse.redirect(new URL('/login?error=blocked', origin))
  }

  const context = {
    ip: clientIp(request),
    userAgent: request.headers.get('user-agent')?.slice(0, 300) ?? '',
  }

  if (user.app_metadata?.provider === 'google') {
    await logActivity(user.id, 'signed_in', { method: 'google' }, context)
  } else if (!next.startsWith('/reset-password')) {
    // A confirmation link. A recovery link is left alone: resetPassword()
    // writes the line that matters once the new password is actually set.
    await logActivity(user.id, 'email_verified', {}, context)
  }

  return NextResponse.redirect(destination(request, next))
}

/* --------------------------------------------------------------------------
   Open-redirect defence. Two independent checks, because this is the one
   place on the site where getting it wrong hands an attacker our domain.
   -------------------------------------------------------------------------- */

/**
 * A `next` value is only accepted if it is unambiguously a path on this site.
 *
 * The rules, and why each one is there:
 *   · must start with '/'          — anything else is an absolute URL
 *   · must not start with '//'     — "//evil.example" is protocol-relative and
 *                                    browsers resolve it to another ORIGIN
 *   · no whitespace                — leading tabs, newlines and encoded spaces
 *                                    are how "/\n//evil.example" gets past a
 *                                    naive prefix test
 *   · no backslash                 — browsers normalise '\' to '/', so
 *                                    "/\evil.example" is protocol-relative too
 *   · no control characters        — same trick, different bytes
 *   · never back into /auth/       — a callback that redirects to itself loops
 *
 * Everything else, including a URL that merely looks harmless, becomes
 * /account. There is no allow-listed host, because there is no host: this
 * function returns paths and nothing but paths.
 */
function safeNext(raw: string | null): string {
  if (!raw) return FALLBACK

  const path = raw.trim()
  if (!path.startsWith('/') || path.startsWith('//')) return FALLBACK
  if (/[\s\\]/.test(path)) return FALLBACK
  if (/[\u0000-\u001f\u007f]/.test(path)) return FALLBACK
  if (path === '/auth' || path.startsWith('/auth/')) return FALLBACK

  return path
}

/**
 * Resolves an already-validated path against our own origin, and refuses to
 * return anything that did not land there. safeNext() should make this
 * impossible; it runs anyway, because "should be impossible" is how the bug
 * this file is about gets written.
 */
function destination(request: NextRequest, path: string): URL {
  const origin = request.nextUrl.origin
  const url = new URL(path, origin)
  return url.origin === origin ? url : new URL(FALLBACK, origin)
}

/** The caller's address, for the audit line. Best effort; never throws. */
function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for')
  const first = forwarded?.split(',')[0]?.trim()
  if (first) return first
  return request.headers.get('x-real-ip') ?? '127.0.0.1'
}
