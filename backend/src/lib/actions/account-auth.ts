'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { logActivity, recordLogin, usernameAvailable } from '@/lib/account/queries'
import { clientIp } from '@/lib/ratelimit'
import { createAdminClient } from '@/lib/supabase/admin'
import { accountsEnabled, siteUrl } from '@/lib/supabase/config'
import { createServerSupabase } from '@/lib/supabase/server'
import {
  changePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
  toFieldErrors,
  type FieldErrors,
} from '@/lib/validation'

/* ==========================================================================
   Sign up, sign in, sign out, password recovery.

   Supabase Auth owns the password hash, the tokens and the email delivery.
   This file owns the rules around them: unique usernames, blocked accounts,
   rate limits, and an audit line for everything that happens.

   TWO RULES THAT SHAPE ALL OF IT
   1. Never reveal whether an email exists. "Wrong password" and "no such
      account" get the same answer, and a password-reset request always reports
      success — otherwise the form is an account-existence oracle.
   2. Never trust the browser about who it is. Every check re-reads the session
      from Supabase with getUser(), which verifies the token server-side.
   ========================================================================== */

export type AuthState = {
  fieldErrors?: FieldErrors
  formError?: string
  /** Set when the next step is "go and read your email". */
  notice?: string
  ok?: boolean
}

const NOT_CONFIGURED =
  'Customer accounts are not switched on yet. Nothing was submitted — try again once the site owner has finished setting them up.'

const BLOCKED = 'This account is not active. Email us if you think that is wrong.'

async function accountIsActive(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  userId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('users')
    .select('status')
    .eq('id', userId)
    .maybeSingle()
  return !error && data?.status === 'active'
}

/* ---- attempt limiting, per IP and account, in memory --------------------
   Supabase applies its own limits server-side; this stops a script reaching
   them from this origin in the first place, and it is deliberately generous
   so a person mistyping a password three times is unaffected. */

const attempts = new Map<string, number[]>()

function recentAttempts(key: string, windowMs: number): number[] {
  const now = Date.now()
  const recent = (attempts.get(key) ?? []).filter((t) => now - t < windowMs)
  attempts.set(key, recent)
  return recent
}

function attemptLimitReached(key: string, max: number, windowMs: number): boolean {
  return recentAttempts(key, windowMs).length >= max
}

function recordAttempt(key: string, windowMs: number): void {
  const now = Date.now()
  attempts.set(key, [...recentAttempts(key, windowMs), now])
  if (attempts.size > 5000) {
    for (const [k, times] of attempts) {
      if (times.every((t) => now - t >= windowMs)) attempts.delete(k)
    }
  }
}

function takeAttempt(key: string, max: number, windowMs: number): boolean {
  if (attemptLimitReached(key, max, windowMs)) return false
  recordAttempt(key, windowMs)
  return true
}

async function requestContext() {
  const h = await headers()
  return { ip: await clientIp(), userAgent: h.get('user-agent')?.slice(0, 300) ?? '' }
}

/* ------------------------------- sign up -------------------------------- */

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  if (!accountsEnabled()) return { formError: NOT_CONFIGURED }

  const parsed = signUpSchema.safeParse({
    fullName: formData.get('fullName'),
    username: formData.get('username'),
    email: formData.get('email'),
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
    acceptTerms: formData.get('acceptTerms') === 'on',
    company: formData.get('company') ?? '',
  })
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

  const { fullName, username, email, password } = parsed.data
  const ctx = await requestContext()

  if (!takeAttempt(`signup:${ctx.ip}`, 5, 60 * 60 * 1000)) {
    return { formError: 'That is a lot of sign-ups from here. Try again in an hour.' }
  }

  if (!(await usernameAvailable(username))) {
    return { fieldErrors: { username: 'That username is taken. Try another.' } }
  }

  const supabase = await createServerSupabase()
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${siteUrl()}/auth/callback?next=/account`,
      data: { full_name: fullName, preferred_username: username },
    },
  })

  if (error) {
    // Supabase says "User already registered". Saying so back would confirm the
    // address exists, so the same neutral line covers both cases.
    if (/already registered|already exists/i.test(error.message)) {
      return {
        ok: true,
        notice:
          'Check your email — if that address can be used, a confirmation link is on its way. The link expires in an hour.',
      }
    }
    return { formError: error.message }
  }

  // The trigger picked a username from the email; honour the one they chose.
  if (data.user) {
    try {
      const admin = createAdminClient()
      await admin.from('users').update({ username }).eq('id', data.user.id)
      await admin
        .from('profiles')
        .update({ full_name: fullName })
        .eq('user_id', data.user.id)
    } catch {
      /* the account exists either way; the name can be fixed in settings */
    }
    await logActivity(data.user.id, 'signed_up', { method: 'email' }, ctx)
  }

  return {
    ok: true,
    notice:
      'Check your email — a confirmation link is on its way. You will not be able to sign in until you have used it. The link expires in an hour.',
  }
}

/* ------------------------------- sign in -------------------------------- */

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  if (!accountsEnabled()) return { formError: NOT_CONFIGURED }

  const parsed = signInSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    remember: formData.get('remember') === 'on',
  })
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

  const { email, password } = parsed.data
  const ctx = await requestContext()

  const windowMs = 15 * 60 * 1000
  const ipKey = `signin-ip:${ctx.ip}`
  const accountKey = `signin-account:${email}`
  const ipBlocked = attemptLimitReached(ipKey, 30, windowMs)
  const accountBlocked = attemptLimitReached(accountKey, 8, windowMs)
  if (ipBlocked || accountBlocked) {
    return {
      formError: 'Too many attempts. Wait fifteen minutes, or reset your password.',
    }
  }

  const supabase = await createServerSupabase()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error || !data.user) {
    recordAttempt(ipKey, windowMs)
    recordAttempt(accountKey, windowMs)
    if (/email not confirmed/i.test(error?.message ?? '')) {
      return {
        formError:
          'That account still needs confirming. Check your email for the link, or request a new one below.',
      }
    }
    // One message for a wrong password and for no such account.
    return {
      formError: 'That email and password do not match. Check both and try again.',
    }
  }

  attempts.delete(accountKey)

  // Suspended and banned accounts authenticate fine — the block is ours, not
  // Supabase's — so it has to be enforced here, after the token exists.
  const row = await recordLogin(data.user.id)
  if (!row || row.status !== 'active') {
    await supabase.auth.signOut()
    return {
      formError:
        row?.status === 'banned'
          ? 'This account has been closed. Email us if you think that is wrong.'
          : 'This account is suspended. Email us and we will look into it.',
    }
  }

  await logActivity(data.user.id, 'signed_in', { method: 'email' }, ctx)

  const next = String(formData.get('next') ?? '/account')
  redirect(safeNext(next))
}

/* ------------------------------- Google --------------------------------- */

export async function signInWithGoogle(formData: FormData): Promise<void> {
  if (!accountsEnabled()) redirect('/login?error=not-configured')

  const next = safeNext(String(formData.get('next') ?? '/account'))
  const supabase = await createServerSupabase()

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${siteUrl()}/auth/callback?next=${encodeURIComponent(next)}`,
      queryParams: { prompt: 'select_account' },
    },
  })

  if (error || !data.url) redirect('/login?error=google')
  redirect(data.url)
}

/* ------------------------------- sign out ------------------------------- */

export async function signOut(): Promise<void> {
  if (!accountsEnabled()) redirect('/')

  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) await logActivity(user.id, 'signed_out', {}, await requestContext())
  await supabase.auth.signOut()
  redirect('/')
}

/* --------------------------- password recovery -------------------------- */

export async function requestPasswordReset(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  if (!accountsEnabled()) return { formError: NOT_CONFIGURED }

  const parsed = forgotPasswordSchema.safeParse({ email: formData.get('email') })
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

  const ctx = await requestContext()
  if (!takeAttempt(`reset:${ctx.ip}`, 5, 60 * 60 * 1000)) {
    return { formError: 'That is a lot of reset requests. Try again in an hour.' }
  }

  const supabase = await createServerSupabase()
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${siteUrl()}/auth/callback?next=/reset-password`,
  })

  // Always the same answer, whether or not the address exists.
  return {
    ok: true,
    notice:
      'If that address has an account, a reset link is on its way. It expires in an hour.',
  }
}

export async function resetPassword(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  if (!accountsEnabled()) return { formError: NOT_CONFIGURED }

  const parsed = resetPasswordSchema.safeParse({
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
  })
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Reaching this page means the recovery link established a session. Without
  // one there is nothing to reset, and we must not say whose account it was.
  if (!user) {
    return {
      formError:
        'That reset link has expired or has already been used. Request a new one.',
    }
  }

  if (!(await accountIsActive(supabase, user.id))) {
    await supabase.auth.signOut()
    return { formError: BLOCKED }
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
  if (error) return { formError: error.message }

  await logActivity(user.id, 'password_changed', { via: 'reset' }, await requestContext())
  return { ok: true, notice: 'Password changed. You are signed in.' }
}

export async function changePassword(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  if (!accountsEnabled()) return { formError: NOT_CONFIGURED }

  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get('currentPassword'),
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
  })
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.email) return { formError: 'You are not signed in.' }
  if (!(await accountIsActive(supabase, user.id))) {
    await supabase.auth.signOut()
    return { formError: BLOCKED }
  }

  // Re-authenticate. Without this, anyone who sat down at an unlocked laptop
  // could change the password and take the account.
  const { error: checkError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: parsed.data.currentPassword,
  })
  if (checkError) {
    return { fieldErrors: { currentPassword: 'That is not your current password.' } }
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
  if (error) return { formError: error.message }

  await logActivity(
    user.id,
    'password_changed',
    { via: 'settings' },
    await requestContext(),
  )
  return { ok: true, notice: 'Changes saved.' }
}

/** Resends the confirmation email for an unverified address. */
export async function resendVerification(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  if (!accountsEnabled()) return { formError: NOT_CONFIGURED }

  const parsed = forgotPasswordSchema.safeParse({ email: formData.get('email') })
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

  const ctx = await requestContext()
  if (!takeAttempt(`verify:${ctx.ip}`, 5, 60 * 60 * 1000)) {
    return { formError: 'That is a lot of requests. Try again in an hour.' }
  }

  const supabase = await createServerSupabase()
  await supabase.auth.resend({
    type: 'signup',
    email: parsed.data.email,
    options: { emailRedirectTo: `${siteUrl()}/auth/callback?next=/account` },
  })

  return {
    ok: true,
    notice: 'If that address needs confirming, a new link is on its way.',
  }
}

/** Only ever return to a path on this site, and never back to an auth page. */
function safeNext(raw: string): string {
  const path = raw.trim()
  if (!path.startsWith('/') || path.startsWith('//')) return '/account'
  if (/[\s\\]/.test(path)) return '/account'
  if (/^\/(login|signup|reset-password|forgot-password|auth)\b/.test(path))
    return '/account'
  return path
}
