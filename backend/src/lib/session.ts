import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { eq, lt } from 'drizzle-orm'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { adminUsers, db, sessions, type AdminUserRow } from '@/db'

export const SESSION_COOKIE = 'lr_session'
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14 // 14 days

export class SessionConfigurationError extends Error {
  constructor() {
    super(
      'The admin cannot sign in until SESSION_SECRET is set to a value of at least 32 characters.',
    )
    this.name = 'SessionConfigurationError'
  }
}

function secret(): string {
  const value = process.env.SESSION_SECRET
  if (!value || value.length < 32) {
    throw new SessionConfigurationError()
  }
  return value
}

/**
 * The cookie holds a random token; the database holds an HMAC of it.
 * Two consequences: a stolen database cannot be used to forge a cookie, and a
 * malformed cookie is rejected by arithmetic before it ever costs a query.
 */
function tokenId(token: string): string {
  return createHmac('sha256', secret()).update(token).digest('hex')
}

export async function createSession(userId: number): Promise<void> {
  const token = randomBytes(32).toString('base64url')
  const now = new Date()
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS)

  await db.insert(sessions).values({
    id: tokenId(token),
    userId,
    createdAt: now,
    expiresAt,
  })

  const jar = await cookies()
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  })

  // Opportunistic sweep. No cron needed for a single-editor admin.
  await db.delete(sessions).where(lt(sessions.expiresAt, now))
}

export type AdminSession = { user: AdminUserRow }

export async function getSession(): Promise<AdminSession | null> {
  const jar = await cookies()
  const token = jar.get(SESSION_COOKIE)?.value
  if (!token) return null

  const id = tokenId(token)
  const row = await db.select().from(sessions).where(eq(sessions.id, id)).get()
  if (!row) return null

  if (row.expiresAt.getTime() < Date.now()) {
    await db.delete(sessions).where(eq(sessions.id, id))
    return null
  }

  // Constant-time compare on the looked-up id, so a partial match in an index
  // cannot be distinguished by timing.
  const a = Buffer.from(row.id, 'hex')
  const b = Buffer.from(id, 'hex')
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  const user = await db
    .select()
    .from(adminUsers)
    .where(eq(adminUsers.id, row.userId))
    .get()
  return user ? { user } : null
}

export async function destroySession(): Promise<void> {
  const jar = await cookies()
  const token = jar.get(SESSION_COOKIE)?.value
  if (token) await db.delete(sessions).where(eq(sessions.id, tokenId(token)))
  jar.delete(SESSION_COOKIE)
}

/** Signs every session for this user out — used after a password change. */
export async function destroyAllSessionsFor(userId: number): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId))
}

/** Guard for every admin page and action. Redirects rather than throwing. */
export async function requireAdmin(options?: {
  allowPasswordChange?: boolean
}): Promise<AdminSession> {
  const session = await getSession()
  if (!session) redirect('/admin/login')
  if (session.user.mustChangePassword && !options?.allowPasswordChange) {
    redirect('/admin/account')
  }
  return session
}
