import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { bookings, db } from '@/db'
import { eq } from 'drizzle-orm'
import { createServerSupabase, getCurrentUser } from '@/lib/supabase/server'
import { accountsEnabled, SUPABASE_URL } from '@/lib/supabase/config'
import type {
  ActivityRow,
  ActivityType,
  AddressRow,
  OrderItemRow,
  OrderRow,
  PaymentRow,
  ProfileRow,
  UserRow,
} from '@/lib/supabase/types'

/* ==========================================================================
   Reads for the signed-in customer.

   These go through the USER's own client, so row level security applies: even
   if one of these functions had a bug in its `eq('user_id', …)`, Postgres would
   still refuse to return somebody else's row. The service-role client is only
   used where a customer legitimately cannot see the data themselves.
   ========================================================================== */

export type Account = {
  user: UserRow
  profile: ProfileRow
  /** A ready-to-render avatar URL, or null. */
  avatarUrl: string | null
}

/** Public URL for an avatar object path. The bucket is public; writes are not. */
export function avatarUrl(path: string | null | undefined): string | null {
  if (!path) return null
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  if (!SUPABASE_URL) return null
  return `${SUPABASE_URL}/storage/v1/object/public/avatars/${path}`
}

/** The signed-in customer's account, or null. Never throws. */
export async function getAccount(): Promise<Account | null> {
  if (!accountsEnabled()) return null

  const authUser = await getCurrentUser()
  if (!authUser) return null

  const supabase = await createServerSupabase()

  const [{ data: user }, { data: profile }] = await Promise.all([
    supabase.from('users').select('*').eq('id', authUser.id).maybeSingle(),
    supabase.from('profiles').select('*').eq('user_id', authUser.id).maybeSingle(),
  ])

  if (!user) return null

  // The trigger creates both rows, but a project restored from a partial backup
  // might not have one. Render something sane rather than a 500.
  const safeProfile: ProfileRow = profile ?? {
    user_id: authUser.id,
    full_name: '',
    phone_number: '',
    phone_country_code: '+1',
    profile_picture: '',
    date_of_birth: null,
    gender: null,
    gender_self_described: '',
    bio: '',
    marketing_opt_in: false,
    created_at: user.created_at,
    updated_at: user.updated_at,
  }

  return {
    user,
    profile: safeProfile,
    avatarUrl: avatarUrl(safeProfile.profile_picture),
  }
}

export async function getAddresses(userId: string): Promise<AddressRow[]> {
  const supabase = await createServerSupabase()
  const { data } = await supabase
    .from('addresses')
    .select('*')
    .eq('user_id', userId)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true })
  return data ?? []
}

export type OrderWithItems = OrderRow & {
  items: OrderItemRow[]
  payments: PaymentRow[]
}

export async function getMyOrders(userId: string): Promise<OrderWithItems[]> {
  const supabase = await createServerSupabase()
  const { data } = await supabase
    .from('orders')
    .select('*, items:order_items(*), payments:payments(*)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  return (data ?? []) as OrderWithItems[]
}

export async function getMyOrder(
  userId: string,
  reference: string,
): Promise<OrderWithItems | null> {
  const supabase = await createServerSupabase()
  const { data } = await supabase
    .from('orders')
    .select('*, items:order_items(*), payments:payments(*)')
    .eq('user_id', userId)
    .eq('reference', reference)
    .maybeSingle()
  return (data as OrderWithItems | null) ?? null
}

export async function getMyActivity(userId: string, limit = 30): Promise<ActivityRow[]> {
  const supabase = await createServerSupabase()
  const { data } = await supabase
    .from('account_activity')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)
  return data ?? []
}

/** Studio requests live in the operational database but carry the auth UUID,
 * so they remain part of the customer's durable account history. */
export async function getMyStudioBookings(userId: string) {
  return db
    .select()
    .from(bookings)
    .where(eq(bookings.userId, userId))
    .orderBy(bookings.createdAt)
}

/* ------------------------------------------------------------------ *
 * Writes that must not be forgeable by the browser
 * ------------------------------------------------------------------ */

/**
 * Appends to the audit trail using the service role, because there is
 * deliberately no INSERT policy on account_activity — a customer must not be
 * able to write their own history.
 *
 * Never throws: losing a log line must not fail the action it was describing.
 */
export async function logActivity(
  userId: string | null,
  type: ActivityType,
  metadata: Record<string, unknown> = {},
  request?: { ip?: string; userAgent?: string },
): Promise<void> {
  try {
    const admin = createAdminClient()
    await admin.from('account_activity').insert({
      user_id: userId,
      activity_type: type,
      metadata,
      ip_address: request?.ip ?? null,
      user_agent: request?.userAgent ?? '',
    })
  } catch {
    /* the trail is best-effort; the action it accompanies is not */
  }
}

/** True if the username is free. Uses the service role: a signed-out visitor
 *  checking availability at sign-up cannot read the users table under RLS. */
export async function usernameAvailable(
  username: string,
  exceptUserId?: string,
): Promise<boolean> {
  try {
    const admin = createAdminClient()
    let query = admin.from('users').select('id').eq('username', username.toLowerCase())
    if (exceptUserId) query = query.neq('id', exceptUserId)
    const { data } = await query.limit(1)
    return (data?.length ?? 0) === 0
  } catch {
    // If we cannot check, do not claim it is free — the database's unique index
    // is the real guard and will reject a duplicate anyway.
    return false
  }
}

/** Marks the login time and returns the account status, for a sign-in guard. */
export async function recordLogin(userId: string): Promise<UserRow | null> {
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('users')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', userId)
      .select('*')
      .maybeSingle()
    return data ?? null
  } catch {
    return null
  }
}
