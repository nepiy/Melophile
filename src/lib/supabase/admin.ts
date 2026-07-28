import 'server-only'

import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, serviceRoleAvailable } from './config'
import type { Database } from './types'

/* ==========================================================================
   The service-role client. BYPASSES ROW LEVEL SECURITY.

   Only ever import this from server code that has already established the
   caller is an administrator (requireAdmin()) or from a trusted server action
   such as recording an order. The `server-only` import above makes bundling it
   into a client component a build error rather than a data breach.

   The key is read at call time, never at module scope, so importing this file
   in an unconfigured project cannot throw at import.
   ========================================================================== */

let cached: ReturnType<typeof createClient<Database>> | null = null

export function createAdminClient() {
  if (!serviceRoleAvailable()) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not set. Admin and order writes need it; it must never be exposed to the browser.',
    )
  }
  cached ??= createClient<Database>(
    SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY!.trim(),
    {
      auth: { autoRefreshToken: false, persistSession: false },
    },
  )
  return cached
}
