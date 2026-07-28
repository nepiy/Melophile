import { and, eq, gte } from 'drizzle-orm'
import { headers } from 'next/headers'
import { db, loginAttempts } from '@/db'

/* ==========================================================================
   Two limiters, because the two jobs are different.

   Login: durable, per ip+email, backed by the login_attempts table so a
   restart does not clear a lockout in progress.

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

export type LoginGate =
  { allowed: true; remaining: number } | { allowed: false; retryAfterSeconds: number }

function loginKey(ip: string, email: string): string {
  return `${ip}:${email.trim().toLowerCase()}`
}

export async function checkLoginRate(ip: string, email: string): Promise<LoginGate> {
  const key = loginKey(ip, email)
  const since = new Date(Date.now() - LOGIN_WINDOW_MS)

  const recent = await db
    .select({ at: loginAttempts.at, ok: loginAttempts.ok })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.key, key), gte(loginAttempts.at, since)))
    .all()

  const failures = recent.filter((r) => !r.ok)
  if (failures.length < LOGIN_MAX_FAILURES) {
    return { allowed: true, remaining: LOGIN_MAX_FAILURES - failures.length }
  }

  const oldest = failures.reduce(
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
  await db.insert(loginAttempts).values({ key: loginKey(ip, email), at: new Date(), ok })

  // On success, clear the slate so a legitimate typo streak does not linger.
  if (ok) {
    await db.delete(loginAttempts).where(eq(loginAttempts.key, loginKey(ip, email)))
  }
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
