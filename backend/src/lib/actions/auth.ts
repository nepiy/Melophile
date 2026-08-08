'use server'

import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { adminUsers, db } from '@/db'
import { describePasswordProblem, hashPassword, verifyPassword } from '@/lib/auth'
import {
  checkLoginRate,
  clientIp,
  describeLockout,
  recordLoginAttempt,
} from '@/lib/ratelimit'
import {
  createSession,
  destroyAllSessionsFor,
  destroySession,
  requireAdmin,
  SessionConfigurationError,
} from '@/lib/session'
import { loginSchema, toFieldErrors, type FieldErrors } from '@/lib/validation'

/* ==========================================================================
   Sign in, sign out, change password. Three actions, no auth dependency.
   ========================================================================== */

export type LoginState = {
  error?: string
  fieldErrors?: FieldErrors
  /** Echoed back so a wrong password does not cost the email as well. */
  email?: string
}

export type PasswordState = {
  error?: string
  fieldErrors?: FieldErrors
  saved?: boolean
}

/**
 * One message for a wrong email and for a wrong password. Telling the two
 * apart turns the login form into an account-existence oracle.
 */
const MISMATCH = 'That email and password do not match. Check both and try again.'

/**
 * A hash that nothing can match, used when the email does not exist so the
 * response takes the same ~100ms of scrypt either way. Without it, "no such
 * user" returns fast enough to be measured.
 */
const DECOY_SALT = '6c696d69746c6573732d6465636f792d73616c74'
const DECOY_HASH = '0'.repeat(128)

/** Only ever return inside the admin, and never back to the login screen. */
function safeNext(raw: string): string {
  const path = raw.trim()
  if (!path.startsWith('/admin')) return '/admin'
  if (path !== '/admin' && !path.startsWith('/admin/')) return '/admin'
  if (path.startsWith('/admin/login')) return '/admin'
  if (/[\s\\]/.test(path)) return '/admin'
  return path
}

export async function signIn(
  _previous: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const typedEmail = String(formData.get('email') ?? '')
  const typedPassword = String(formData.get('password') ?? '')
  const next = safeNext(String(formData.get('next') ?? ''))

  const parsed = loginSchema.safeParse({ email: typedEmail, password: typedPassword })
  if (!parsed.success) {
    return { fieldErrors: toFieldErrors(parsed.error), email: typedEmail }
  }

  const email = parsed.data.email.toLowerCase()
  const ip = await clientIp()

  // Rate limit BEFORE verifying, so a locked-out attacker cannot keep paying
  // for scrypt runs, and cannot use their duration as a signal either.
  const gate = await checkLoginRate(ip, email)
  if (!gate.allowed) {
    return { error: describeLockout(gate.retryAfterSeconds), email: typedEmail }
  }

  const user = await db.select().from(adminUsers).where(eq(adminUsers.email, email)).get()

  let ok = false
  if (user) {
    ok = await verifyPassword(parsed.data.password, user.passwordHash, user.passwordSalt)
  } else {
    await verifyPassword(parsed.data.password, DECOY_HASH, DECOY_SALT)
  }

  await recordLoginAttempt(ip, email, ok)

  if (!user || !ok) return { error: MISMATCH, email: typedEmail }

  await db
    .update(adminUsers)
    .set({ lastLoginAt: new Date() })
    .where(eq(adminUsers.id, user.id))

  try {
    await createSession(user.id)
  } catch (error) {
    // A missing Railway variable must not turn a valid sign-in into Next's
    // opaque application-error screen. Do not create a partial session; give
    // the deployment owner the one setting that needs attention instead.
    if (error instanceof SessionConfigurationError) {
      return { error: error.message, email: typedEmail }
    }
    throw error
  }

  // Drops the client router cache for the admin subtree, so the shell that
  // renders next is the signed-in one and not a cached gate.
  revalidatePath('/admin', 'layout')

  redirect(user.mustChangePassword ? '/admin/account' : next)
}

export async function signOut(): Promise<void> {
  await destroySession()
  revalidatePath('/admin', 'layout')
  redirect('/admin/login')
}

export async function changePassword(
  _previous: PasswordState,
  formData: FormData,
): Promise<PasswordState> {
  const { user } = await requireAdmin()

  const current = String(formData.get('currentPassword') ?? '')
  const next = String(formData.get('newPassword') ?? '')
  const confirm = String(formData.get('confirmPassword') ?? '')

  const missing: FieldErrors = {}
  if (!current) missing.currentPassword = 'Enter the password you use now.'
  if (!next) missing.newPassword = 'Enter the new password.'
  if (Object.keys(missing).length > 0) return { fieldErrors: missing }

  const ok = await verifyPassword(current, user.passwordHash, user.passwordSalt)
  if (!ok) {
    return {
      fieldErrors: {
        currentPassword: 'That is not the password you use now. Check it and try again.',
      },
    }
  }

  const problem = describePasswordProblem(next)
  if (problem) return { fieldErrors: { newPassword: problem } }

  if (next === current) {
    return {
      fieldErrors: {
        newPassword: 'That is the password you already have. Pick a different one.',
      },
    }
  }

  if (next !== confirm) {
    return {
      fieldErrors: {
        confirmPassword: 'These two do not match. Type the new password again.',
      },
    }
  }

  const { hash, salt } = await hashPassword(next)

  await db
    .update(adminUsers)
    .set({ passwordHash: hash, passwordSalt: salt, mustChangePassword: false })
    .where(eq(adminUsers.id, user.id))

  // Every session for this user goes, including this one, and then this
  // browser gets a fresh cookie. A password change that leaves an old
  // session signed in somewhere else has not changed anything.
  await destroyAllSessionsFor(user.id)
  await createSession(user.id)

  revalidatePath('/admin', 'layout')

  return { saved: true }
}
