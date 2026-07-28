'use client'

import { createBrowserClient } from '@supabase/ssr'
import { SUPABASE_ANON_KEY, SUPABASE_URL, accountsEnabled } from './config'
import type { Database } from './types'

/* ==========================================================================
   The browser client.

   Uses the ANON key, so every query it makes is subject to row level security.
   A customer's browser can read their own rows and nothing else, enforced by
   Postgres rather than by our code being careful.
   ========================================================================== */

let cached: ReturnType<typeof createBrowserClient<Database>> | null = null

export function createClient() {
  if (!accountsEnabled()) {
    throw new Error(
      'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.',
    )
  }
  // One instance per tab: a second client would keep its own copy of the
  // session and the two would drift after a token refresh.
  cached ??= createBrowserClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY)
  return cached
}
