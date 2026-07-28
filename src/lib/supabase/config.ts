/* ==========================================================================
   Whether customer accounts are switched on.

   The site has to keep working before a Supabase project exists. Every account
   feature checks this first and, when it is false, renders an honest "accounts
   are not set up yet" state instead of throwing. The shop, the catalogue and
   the admin are untouched either way — they do not use Supabase at all.

   Paste the three values into .env.local and everything below wakes up. No
   code change, no rebuild of anything else.
   ========================================================================== */

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? ''
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? ''

/** True when the browser has enough to talk to Supabase at all. */
export function accountsEnabled(): boolean {
  return SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0
}

/**
 * True when the SERVER can act as the service role — required by the admin
 * screens and by anything that writes an order.
 *
 * Deliberately not exported as a value: reading the key must only ever happen
 * inside a server module, and a function keeps it out of the client bundle.
 */
export function serviceRoleAvailable(): boolean {
  return accountsEnabled() && Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim())
}

/** One sentence explaining exactly what is missing, for an admin-facing notice. */
export function accountsSetupHint(): string {
  const missing: string[] = []
  if (!SUPABASE_URL) missing.push('NEXT_PUBLIC_SUPABASE_URL')
  if (!SUPABASE_ANON_KEY) missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY')
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim())
    missing.push('SUPABASE_SERVICE_ROLE_KEY')
  if (missing.length === 0) return ''
  return `Customer accounts are switched off because ${missing.join(', ')} ${
    missing.length === 1 ? 'is' : 'are'
  } not set in .env.local. Add ${missing.length === 1 ? 'it' : 'them'} and restart the server.`
}

/** Where Supabase sends people back to after a magic link or an OAuth round trip. */
export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'http://localhost:3000').replace(
    /\/$/,
    '',
  )
}
