import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { accountsSetupHint, serviceRoleAvailable } from '@/lib/supabase/config'
import type {
  AccountStatus,
  ActivityRow,
  AddressRow,
  OrderItemRow,
  OrderRow,
  OrderStatsRow,
  OrderStatus,
  PaymentRow,
  PaymentStatus,
  ProfileRow,
  UserRow,
  UserStatsRow,
} from '@/lib/supabase/types'

/* ==========================================================================
   Admin reads for customers and their Postgres orders.

   THE SERVICE ROLE, AND WHY IT HAS TO BE THE SERVICE ROLE
   Row level security on this schema is written around `auth.uid()` — a
   customer sees their own rows and nobody else's. The admin is not a Supabase
   user at all: it has its own scrypt login in SQLite and no Postgres identity
   whatsoever. Read these tables through the anon key and RLS would hide every
   customer on the database, which is indistinguishable on screen from having
   none. So every read here goes through createAdminClient(), which is
   server-only and bypasses RLS by design, and every page that calls it has
   already been through requireAdmin().

   NOTHING HERE THROWS.
   Supabase may not be configured — that is a supported state of this project,
   not a fault. Every function returns { ok: false, error } and the caller
   renders the setup notice instead of a table of zeros. A dashboard that
   reports "no customers" when it simply cannot see them is worse than one that
   says so.

   NO EMBEDDED SELECTS.
   The hand-written Database type declares `Relationships: []` on every table,
   so supabase-js cannot type `select('*, profile:profiles(*)')` and the result
   collapses to something that has to be cast away. Related rows are fetched by
   id and joined here with a Map instead: two round trips, no casts, and the
   list still costs a fixed number of queries rather than one per row.
   ========================================================================== */

/** Either the thing, or one sentence saying why not. Never an exception. */
export type Read<T> = { ok: true; value: T } | { ok: false; error: string }

/**
 * The most rows any of these screens will draw at once.
 *
 * A cap rather than paging: a label's customer list is hundreds, not millions,
 * and a list that silently stops at 500 while claiming to be everything is the
 * one thing worse than a list that says it stopped. `capped` below is what the
 * screen prints when it did.
 */
const LIST_LIMIT = 500

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Route params reach a query as text. Anything that is not an id is not one. */
export function isUuid(value: string): boolean {
  return UUID.test(value.trim())
}

/**
 * Every payment status, in the order money moves through them.
 *
 * Derived from a full Record so that adding a value to the PaymentStatus union
 * breaks the build here rather than leaving a control that cannot reach it.
 * The order statuses come from @/lib/orders/store, which already owns that
 * list — one list per union, or a filter tab and its validator eventually
 * disagree about which values exist.
 */
export const PAYMENT_STATUSES = Object.keys({
  unpaid: true,
  pending: true,
  paid: true,
  failed: true,
  refunded: true,
} satisfies Record<PaymentStatus, true>) as PaymentStatus[]

/** Narrows anything at all to a real payment status, or null. */
export function readPaymentStatus(
  raw: string | string[] | undefined,
): PaymentStatus | null {
  const value = Array.isArray(raw) ? raw[0] : raw
  if (!value) return null
  return PAYMENT_STATUSES.includes(value as PaymentStatus)
    ? (value as PaymentStatus)
    : null
}

/**
 * Escapes the wildcards in a LIKE pattern.
 *
 * Without this a search for "100%" is `%100%%`, which matches every customer on
 * the database, and a search for "a_b" quietly matches "axb". Postgres treats
 * backslash as the escape character by default, so escaping the backslash
 * itself has to come with them.
 */
export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (character) => `\\${character}`)
}

function offline<T>(): Read<T> {
  return {
    ok: false,
    error:
      accountsSetupHint() ||
      'Customer accounts are switched off because Supabase is not configured.',
  }
}

/** Whatever PostgREST said, as one sentence a person could be shown. */
function failure<T>(error: unknown, fallback: string): Read<T> {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = String((error as { message: unknown }).message).trim()
    if (message) return { ok: false, error: message }
  }
  return { ok: false, error: fallback }
}

/* ==========================================================================
   Customers
   ========================================================================== */

/** A customer as the list and the header draw them. */
export type AdminUser = UserRow & {
  /** From the profile row, which the admin never shows on its own. */
  fullName: string
  /** Short-lived signed URL for the private avatars bucket, or null. */
  avatarUrl: string | null
}

export type UserCounts = {
  all: number
  active: number
  suspended: number
  banned: number
}

export type UserList = {
  users: AdminUser[]
  /** Counts across the current SEARCH, so a tab reading 3 shows 3 when clicked. */
  counts: UserCounts
  /** Every customer on the database, ignoring the search entirely. */
  total: number
  capped: boolean
}

const NO_COUNTS: UserCounts = { all: 0, active: 0, suspended: 0, banned: 0 }

/** full_name and the avatar path for a set of users, as one query. */
async function profilesFor(
  admin: ReturnType<typeof createAdminClient>,
  ids: string[],
): Promise<Map<string, { full_name: string; profile_picture: string }>> {
  const found = new Map<string, { full_name: string; profile_picture: string }>()
  if (ids.length === 0) return found

  const { data } = await admin
    .from('profiles')
    .select('user_id, full_name, profile_picture')
    .in('user_id', ids)

  for (const row of data ?? []) {
    found.set(row.user_id, {
      full_name: row.full_name ?? '',
      profile_picture: row.profile_picture ?? '',
    })
  }
  return found
}

/** Resolve owner-scoped local object paths in one signed request. */
async function signedAvatarUrls(
  admin: ReturnType<typeof createAdminClient>,
  candidates: Array<{ ownerId: string; path: string | null | undefined }>,
): Promise<Map<string, string>> {
  const urls = new Map<string, string>()
  const local = [
    ...new Set(
      candidates.flatMap(({ ownerId, path }) =>
        path &&
        path.startsWith(`${ownerId}/`) &&
        /^[0-9a-f-]{36}\/[A-Za-z0-9._-]+$/.test(path)
          ? [path]
          : [],
      ),
    ),
  ]

  if (local.length === 0) return urls

  const { data } = await admin.storage.from('avatars').createSignedUrls(local, 60 * 60)
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) urls.set(item.path, item.signedUrl)
  }
  return urls
}

/**
 * Every customer, newest first, filtered by a search term and a status.
 *
 * The search runs as three separate ilike queries rather than one `.or()`
 * string: full_name lives on `profiles` and the other two on `users`, and the
 * `.or()` filter is a comma-and-parenthesis mini-language that a customer
 * searching for "smith, jane" would break. Three typed calls merged through a
 * Set cost one extra round trip and cannot be broken by anything anyone types.
 *
 * Soft-deleted rows are excluded, which is what admin_user_stats does too — the
 * dashboard and this list must not disagree about how many customers exist.
 */
export async function listUsers(options: {
  q?: string
  status?: AccountStatus | null
}): Promise<Read<UserList>> {
  if (!serviceRoleAvailable()) return offline()

  try {
    const admin = createAdminClient()
    const term = (options.q ?? '').trim()

    const { count, error: countError } = await admin
      .from('users')
      .select('id', { count: 'exact', head: true })
      .is('deleted_at', null)

    if (countError) return failure(countError, 'The customer list could not be read.')
    const total = count ?? 0

    let ids: string[] | null = null

    if (term) {
      const pattern = `%${escapeLike(term)}%`
      const [byEmail, byUsername, byName] = await Promise.all([
        admin.from('users').select('id').ilike('email', pattern).limit(LIST_LIMIT),
        admin.from('users').select('id').ilike('username', pattern).limit(LIST_LIMIT),
        admin
          .from('profiles')
          .select('user_id')
          .ilike('full_name', pattern)
          .limit(LIST_LIMIT),
      ])

      const error = byEmail.error ?? byUsername.error ?? byName.error
      if (error) return failure(error, 'That search could not be run.')

      const matched = new Set<string>()
      for (const row of byEmail.data ?? []) matched.add(row.id)
      for (const row of byUsername.data ?? []) matched.add(row.id)
      for (const row of byName.data ?? []) matched.add(row.user_id)
      ids = [...matched]

      // An empty `in` list is a query with a known answer. Asking anyway works,
      // but there is no reason to spend a round trip on it.
      if (ids.length === 0) {
        return {
          ok: true,
          value: { users: [], counts: { ...NO_COUNTS }, total, capped: false },
        }
      }
    }

    let query = admin
      .from('users')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(LIST_LIMIT)

    if (ids) query = query.in('id', ids)

    const { data, error } = await query
    if (error) return failure(error, 'The customer list could not be read.')

    const rows = data ?? []

    // Counted before the status filter, because the tabs are what the status
    // filter is chosen from — a tab that reported its own filtered total would
    // always read the same number as the list under it.
    const counts: UserCounts = { ...NO_COUNTS, all: rows.length }
    for (const row of rows) {
      if (row.status === 'active') counts.active += 1
      else if (row.status === 'suspended') counts.suspended += 1
      else if (row.status === 'banned') counts.banned += 1
    }

    const shown = options.status
      ? rows.filter((row) => row.status === options.status)
      : rows

    const profiles = await profilesFor(
      admin,
      shown.map((row) => row.id),
    )
    const avatars = await signedAvatarUrls(
      admin,
      shown.map((row) => ({
        ownerId: row.id,
        path: profiles.get(row.id)?.profile_picture,
      })),
    )

    const users: AdminUser[] = shown.map((row) => {
      const profile = profiles.get(row.id)
      return {
        ...row,
        fullName: profile?.full_name ?? '',
        avatarUrl: avatars.get(profile?.profile_picture ?? '') ?? null,
      }
    })

    return {
      ok: true,
      value: { users, counts, total, capped: rows.length >= LIST_LIMIT },
    }
  } catch (error) {
    return failure(error, 'The customer list could not be read.')
  }
}

/**
 * Just enough to title the page.
 *
 * generateMetadata runs alongside the page component, not instead of it, so
 * calling the full read twice would double every query on the screen to put
 * five words in the browser tab.
 */
export async function userLabel(id: string): Promise<string | null> {
  if (!serviceRoleAvailable() || !isUuid(id)) return null

  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('users')
      .select('email, username')
      .eq('id', id)
      .maybeSingle()

    if (!data) return null
    return data.username ? `@${data.username}` : data.email
  } catch {
    return null
  }
}

/** As above, for an order. The reference is what the tab should say. */
export async function orderLabel(id: string): Promise<string | null> {
  if (!serviceRoleAvailable() || !isUuid(id)) return null

  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('orders')
      .select('reference')
      .eq('id', id)
      .maybeSingle()

    return data?.reference ?? null
  } catch {
    return null
  }
}

/** One customer's order, as the customer screen lists it. */
export type UserOrder = OrderRow & { itemCount: number }

export type UserDetail = {
  user: UserRow
  /** The trigger creates one per user, but a partial restore might not have. */
  profile: ProfileRow | null
  avatarUrl: string | null
  addresses: AddressRow[]
  orders: UserOrder[]
  activity: ActivityRow[]
  /** What they have actually paid, in pence. Paid orders only. */
  spend: number
}

/** How many things are in an order, rather than how many lines it has. */
function countItems(rows: { order_id: string; quantity: number }[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const row of rows) {
    counts.set(row.order_id, (counts.get(row.order_id) ?? 0) + row.quantity)
  }
  return counts
}

/**
 * Everything about one customer.
 *
 * `{ ok: true, value: null }` means the id is not a customer — the page turns
 * that into notFound(). `{ ok: false }` means the database could not be read at
 * all, which is a different sentence and must not be shown as a 404.
 */
export async function getUserDetail(id: string): Promise<Read<UserDetail | null>> {
  if (!serviceRoleAvailable()) return offline()
  if (!isUuid(id)) return { ok: true, value: null }

  try {
    const admin = createAdminClient()

    const { data: user, error } = await admin
      .from('users')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (error) return failure(error, 'That customer could not be read.')
    if (!user) return { ok: true, value: null }

    const [profile, addresses, orders, activity] = await Promise.all([
      admin.from('profiles').select('*').eq('user_id', id).maybeSingle(),
      admin
        .from('addresses')
        .select('*')
        .eq('user_id', id)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: true }),
      admin
        .from('orders')
        .select('*')
        .eq('user_id', id)
        .order('created_at', { ascending: false })
        .limit(LIST_LIMIT),
      admin
        .from('account_activity')
        .select('*')
        .eq('user_id', id)
        .order('created_at', { ascending: false })
        .limit(50),
    ])

    const orderRows = orders.data ?? []

    const { data: itemRows } = orderRows.length
      ? await admin
          .from('order_items')
          .select('order_id, quantity')
          .in(
            'order_id',
            orderRows.map((row) => row.id),
          )
      : { data: [] }

    const items = countItems(itemRows ?? [])
    const avatars = await signedAvatarUrls(admin, [
      { ownerId: id, path: profile.data?.profile_picture },
    ])

    return {
      ok: true,
      value: {
        user,
        profile: profile.data ?? null,
        avatarUrl: avatars.get(profile.data?.profile_picture ?? '') ?? null,
        addresses: addresses.data ?? [],
        orders: orderRows.map((row) => ({
          ...row,
          itemCount: items.get(row.id) ?? 0,
        })),
        activity: activity.data ?? [],
        // Only what was actually taken. An order awaiting payment is not spend,
        // and a total that counts it would overstate every customer on the list.
        spend: orderRows
          .filter((row) => row.payment_status === 'paid')
          .reduce((sum, row) => sum + row.total_amount, 0),
      },
    }
  } catch (error) {
    return failure(error, 'That customer could not be read.')
  }
}

/* ==========================================================================
   Customer orders
   ========================================================================== */

export type AdminCustomerOrder = OrderRow & { itemCount: number }

export type CustomerOrderCounts = Record<OrderStatus | 'all', number>

export type CustomerOrderList = {
  orders: AdminCustomerOrder[]
  counts: CustomerOrderCounts
  total: number
  capped: boolean
  /** Orders whose confirmation email did not go out. Flagged on the row. */
  unsent: number
}

const NO_ORDER_COUNTS: CustomerOrderCounts = {
  all: 0,
  pending: 0,
  paid: 0,
  processing: 0,
  shipped: 0,
  delivered: 0,
  cancelled: 0,
  refunded: 0,
}

/**
 * Every Postgres order, newest first.
 *
 * Same shape as listUsers, for the same reasons: the search is two typed ilike
 * queries merged through a Set, the counts are taken before the status filter
 * so the tabs describe what a click will show, and the lines come back in one
 * extra query rather than one per row.
 */
export async function listCustomerOrders(options: {
  q?: string
  status?: OrderStatus | null
}): Promise<Read<CustomerOrderList>> {
  if (!serviceRoleAvailable()) return offline()

  try {
    const admin = createAdminClient()
    const term = (options.q ?? '').trim()

    const { count, error: countError } = await admin
      .from('orders')
      .select('id', { count: 'exact', head: true })

    if (countError) return failure(countError, 'The order list could not be read.')
    const total = count ?? 0

    let ids: string[] | null = null

    if (term) {
      const pattern = `%${escapeLike(term)}%`
      const [byReference, byEmail] = await Promise.all([
        admin.from('orders').select('id').ilike('reference', pattern).limit(LIST_LIMIT),
        admin.from('orders').select('id').ilike('email', pattern).limit(LIST_LIMIT),
      ])

      const error = byReference.error ?? byEmail.error
      if (error) return failure(error, 'That search could not be run.')

      const matched = new Set<string>()
      for (const row of byReference.data ?? []) matched.add(row.id)
      for (const row of byEmail.data ?? []) matched.add(row.id)
      ids = [...matched]

      if (ids.length === 0) {
        return {
          ok: true,
          value: {
            orders: [],
            counts: { ...NO_ORDER_COUNTS },
            total,
            capped: false,
            unsent: 0,
          },
        }
      }
    }

    let query = admin
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(LIST_LIMIT)

    if (ids) query = query.in('id', ids)

    const { data, error } = await query
    if (error) return failure(error, 'The order list could not be read.')

    const rows = data ?? []

    const counts: CustomerOrderCounts = { ...NO_ORDER_COUNTS, all: rows.length }
    for (const row of rows) {
      // A status the schema no longer names cannot be counted into a column
      // that does not exist. Skipping it beats throwing on a list page.
      if (row.order_status in counts) counts[row.order_status] += 1
    }

    const shown = options.status
      ? rows.filter((row) => row.order_status === options.status)
      : rows

    const { data: itemRows } = shown.length
      ? await admin
          .from('order_items')
          .select('order_id, quantity')
          .in(
            'order_id',
            shown.map((row) => row.id),
          )
      : { data: [] }

    const items = countItems(itemRows ?? [])

    return {
      ok: true,
      value: {
        orders: shown.map((row) => ({ ...row, itemCount: items.get(row.id) ?? 0 })),
        counts,
        total,
        capped: rows.length >= LIST_LIMIT,
        unsent: shown.filter((row) => !row.notified).length,
      },
    }
  } catch (error) {
    return failure(error, 'The order list could not be read.')
  }
}

export type CustomerOrderDetail = {
  order: OrderRow
  items: OrderItemRow[]
  payments: PaymentRow[]
  /** The account the order belongs to, or null for a guest checkout. */
  customer: (UserRow & { fullName: string }) | null
}

export async function getCustomerOrder(
  id: string,
): Promise<Read<CustomerOrderDetail | null>> {
  if (!serviceRoleAvailable()) return offline()
  if (!isUuid(id)) return { ok: true, value: null }

  try {
    const admin = createAdminClient()

    const { data: order, error } = await admin
      .from('orders')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (error) return failure(error, 'That order could not be read.')
    if (!order) return { ok: true, value: null }

    const [items, payments] = await Promise.all([
      // Lines oldest first, so a receipt reads in the order it was built.
      // Payments newest first, so the latest attempt is the one to hand.
      admin
        .from('order_items')
        .select('*')
        .eq('order_id', id)
        .order('created_at', { ascending: true }),
      admin
        .from('payments')
        .select('*')
        .eq('order_id', id)
        .order('created_at', { ascending: false }),
    ])

    let customer: (UserRow & { fullName: string }) | null = null

    if (order.user_id) {
      const { data: user } = await admin
        .from('users')
        .select('*')
        .eq('id', order.user_id)
        .maybeSingle()

      if (user) {
        const profiles = await profilesFor(admin, [user.id])
        customer = { ...user, fullName: profiles.get(user.id)?.full_name ?? '' }
      }
    }

    return {
      ok: true,
      value: {
        order,
        items: items.data ?? [],
        payments: payments.data ?? [],
        customer,
      },
    }
  } catch (error) {
    return failure(error, 'That order could not be read.')
  }
}

/* ==========================================================================
   Analytics

   Both views are computed in Postgres rather than by pulling every row into
   the application and counting there, and both are revoked from anon and
   authenticated — only the service role can select them at all.
   ========================================================================== */

export type AdminStats = { users: UserStatsRow; orders: OrderStatsRow }

export async function adminStats(): Promise<Read<AdminStats>> {
  if (!serviceRoleAvailable()) return offline()

  try {
    const admin = createAdminClient()

    const [users, orders] = await Promise.all([
      admin.from('admin_user_stats').select('*').maybeSingle(),
      admin.from('admin_order_stats').select('*').maybeSingle(),
    ])

    const error = users.error ?? orders.error
    if (error) return failure(error, 'The customer figures could not be read.')
    if (!users.data || !orders.data) {
      return {
        ok: false,
        error:
          'The admin_user_stats and admin_order_stats views are missing. Run supabase/migrations/0001_accounts_and_orders.sql against the project.',
      }
    }

    return { ok: true, value: { users: users.data, orders: orders.data } }
  } catch (error) {
    return failure(error, 'The customer figures could not be read.')
  }
}
