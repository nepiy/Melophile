import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { SUPABASE_ANON_KEY, SUPABASE_URL, accountsEnabled } from './config'
import type { Database } from './types'

/* ==========================================================================
   The server client, acting AS THE SIGNED-IN USER.

   Still the anon key, so row level security still applies — this is not a
   back door. It exists so a server component can render a customer's own data
   without a round trip to the browser.
   ========================================================================== */

export async function createServerSupabase() {
  const jar = await cookies()

  return createServerClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return jar.getAll()
      },
      setAll(items) {
        try {
          for (const { name, value, options } of items) jar.set(name, value, options)
        } catch {
          // Called from a Server Component, where cookies are read-only. The
          // middleware refreshes the session instead, so this is safe to ignore.
        }
      },
    },
  })
}

/**
 * The signed-in user, or null. Verified against Supabase rather than decoded
 * from the cookie: getSession() trusts whatever the browser sent, getUser()
 * asks the auth server whether the token is real.
 */
export async function getCurrentUser() {
  if (!accountsEnabled()) return null
  const supabase = await createServerSupabase()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) return null
  return data.user
}
