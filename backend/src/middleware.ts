import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/* ==========================================================================
   Session refresh.

   Supabase access tokens are short-lived. Without this, a signed-in customer
   is quietly logged out the first time their token expires mid-visit. The
   middleware refreshes the token on every request and writes the new cookies
   onto the response, which is the only place in Next where that can happen for
   both Server Components and route handlers.

   It also guards /account: a signed-out visitor is sent to the login page with
   a `next` parameter so they land where they were going.

   THREE THINGS IT DELIBERATELY DOES NOT DO
   1. Touch /admin. That has its own scrypt session and is not Supabase's
      business — the two auth systems stay separate on purpose.
   2. Run at all when Supabase is unconfigured. The site works without accounts.
   3. Make an authorisation decision from the cookie alone. It calls getUser(),
      which verifies the token with the auth server rather than trusting
      whatever the browser presented.
   ========================================================================== */

const PROTECTED = ['/account']

export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()

  // No project configured: behave exactly as the site did before accounts existed.
  if (!url || !key) return NextResponse.next()

  let response = NextResponse.next({ request })

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(items) {
        for (const { name, value } of items) request.cookies.set(name, value)
        response = NextResponse.next({ request })
        for (const { name, value, options } of items) {
          response.cookies.set(name, value, options)
        }
      },
    },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    const { data: account, error } = await supabase
      .from('users')
      .select('status')
      .eq('id', user.id)
      .maybeSingle()

    // A valid Supabase token is not enough: suspended, banned, deleted, and
    // incomplete account rows must not retain access through an old session.
    if (error || account?.status !== 'active') {
      await supabase.auth.signOut()
      const login = request.nextUrl.clone()
      login.pathname = '/login'
      login.search = ''
      login.searchParams.set('error', 'blocked')
      const denied = NextResponse.redirect(login)
      for (const cookie of response.cookies.getAll()) denied.cookies.set(cookie)
      return denied
    }
  }

  const path = request.nextUrl.pathname

  if (!user && PROTECTED.some((p) => path === p || path.startsWith(`${p}/`))) {
    const login = request.nextUrl.clone()
    login.pathname = '/login'
    login.search = ''
    login.searchParams.set('next', path)
    return NextResponse.redirect(login)
  }

  // Already signed in? The login and sign-up pages have nothing to offer.
  if (user && (path === '/login' || path === '/signup')) {
    const account = request.nextUrl.clone()
    account.pathname = '/account'
    account.search = ''
    return NextResponse.redirect(account)
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Everything except static assets, images and the admin — matching those
     * would spend a network round trip per file for no reason, and /admin is
     * governed by its own session entirely.
     */
    '/((?!_next/static|_next/image|favicon.ico|uploads|admin|api/upload|.*\\.(?:svg|png|jpg|jpeg|webp|avif|gif|ico|txt|xml)$).*)',
  ],
}
