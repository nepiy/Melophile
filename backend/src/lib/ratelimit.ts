import { and, eq, gte, lt } from 'drizzle-orm'
import { headers } from 'next/headers'
import { db, loginAttempts } from '@/db'

/* ==========================================================================
   Two limiters, because the two jobs are different.

   Login: durable, per account AND per IP, backed by the login_attempts table
   so a restart does not clear a lockout in progress. The IP-wide ceiling stops
   account spraying from buying unlimited scrypt work with fresh email values.

   Booking: in-memory per IP. Losing this on restart is fine — it exists to
   stop a script hammering the form, not to enforce a quota.
   ========================================================================== */

export async function clientIp(): Promise<string> {
  const h = await headers()
  const forwarded = h.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first
  }
  return h.get('x-real-ip') ?? '127.0.0.1'
}

/* ----------------------------- login ----------------------------- */

const LOGIN_WINDOW_MS = 15 * 60 * 1000
const LOGIN_MAX_FAILURES = 5
const LOGIN_MAX_IP_FAILURES = 25

export type LoginGate =
  { allowed: true; remaining: number } | { allowed: false; retryAfterSeconds: number }

function loginKey(email: string): string {
  return `account:${email.trim().toLowerCase()}`
}

function loginIpKey(ip: string): string {
  return `ip:${ip}`
}

async function recentFailures(key: string, since: Date) {
  const recent = await db
    .select({ at: loginAttempts.at, ok: loginAttempts.ok })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.key, key), gte(loginAttempts.at, since)))
    .all()
  return recent.filter((row) => !row.ok)
}

export async function checkLoginRate(ip: string, email: string): Promise<LoginGate> {
  const since = new Date(Date.now() - LOGIN_WINDOW_MS)
  const [accountFailures, ipFailures] = await Promise.all([
    recentFailures(loginKey(email), since),
    recentFailures(loginIpKey(ip), since),
  ])

  const accountBlocked = accountFailures.length >= LOGIN_MAX_FAILURES
  const ipBlocked = ipFailures.length >= LOGIN_MAX_IP_FAILURES
  if (!accountBlocked && !ipBlocked) {
    return {
      allowed: true,
      remaining: Math.min(
        LOGIN_MAX_FAILURES - accountFailures.length,
        LOGIN_MAX_IP_FAILURES - ipFailures.length,
      ),
    }
  }

  const blockingFailures = accountBlocked ? accountFailures : ipFailures
  const oldest = blockingFailures.reduce(
    (min, r) => (r.at.getTime() < min ? r.at.getTime() : min),
    Number.POSITIVE_INFINITY,
  )
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((oldest + LOGIN_WINDOW_MS - Date.now()) / 1000),
  )
  return { allowed: false, retryAfterSeconds }
}

export async function recordLoginAttempt(
  ip: string,
  email: string,
  ok: boolean,
): Promise<void> {
  const now = new Date()

  // On success, clear the slate so a legitimate typo streak does not linger.
  if (ok) {
    await db.delete(loginAttempts).where(eq(loginAttempts.key, loginKey(email)))
  } else {
    await db.insert(loginAttempts).values([
      { key: loginKey(email), at: now, ok: false },
      { key: loginIpKey(ip), at: now, ok: false },
    ])
  }

  // A rotating list of guessed emails must not grow this table forever.
  await db
    .delete(loginAttempts)
    .where(lt(loginAttempts.at, new Date(now.getTime() - LOGIN_WINDOW_MS)))
}

export function describeLockout(seconds: number): string {
  const mins = Math.ceil(seconds / 60)
  return `Too many attempts. Try again in ${mins} ${mins === 1 ? 'minute' : 'minutes'}.`
}

/* ---------------------------- bookings ---------------------------- */

const BOOKING_WINDOW_MS = 60 * 60 * 1000
const BOOKING_MAX = 5

const bookingHits = new Map<string, number[]>()

export function checkBookingRate(ip: string): { allowed: boolean } {
  const now = Date.now()
  const hits = (bookingHits.get(ip) ?? []).filter((t) => now - t < BOOKING_WINDOW_MS)

  if (hits.length >= BOOKING_MAX) {
    bookingHits.set(ip, hits)
    return { allowed: false }
  }

  hits.push(now)
  bookingHits.set(ip, hits)

  // Keep the map from growing without bound on a long-lived server.
  if (bookingHits.size > 5000) {
    for (const [key, times] of bookingHits) {
      if (times.every((t) => now - t >= BOOKING_WINDOW_MS)) bookingHits.delete(key)
    }
  }

  return { allowed: true }
}
