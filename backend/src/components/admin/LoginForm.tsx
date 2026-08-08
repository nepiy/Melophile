'use client'

import { usePathname } from 'next/navigation'
import { useActionState } from 'react'
import { SaveBar } from '@/components/admin/SaveBar'
import { Field, FormError, TextInput } from '@/components/admin/fields'
import {
  changePassword,
  signIn,
  type LoginState,
  type PasswordState,
} from '@/lib/actions/auth'

/* ==========================================================================
   The two auth forms. Both live here because they are the only client forms
   the admin core owns, and they share every primitive.
   ========================================================================== */

const EMPTY_LOGIN: LoginState = {}
const EMPTY_PASSWORD: PasswordState = {}

/**
 * The sign-in screen. Rendered by src/app/admin/layout.tsx whenever there is
 * no session — at whichever admin URL was asked for — so the deep link
 * survives. The path travels with the form and the action returns to it.
 */
export function LoginForm() {
  const [state, action, pending] = useActionState(signIn, EMPTY_LOGIN)
  const pathname = usePathname()

  const next =
    pathname && pathname.startsWith('/admin') && !pathname.startsWith('/admin/login')
      ? pathname
      : '/admin'

  return (
    <div className="ad-gate">
      <div className="ad-gate__panel">
        <div className="ad-gate__strip" aria-hidden="true">
          <span className="mono ad-gate__chan">00</span>
          <span className="ad-gate__rule" />
          <span className="label">Sign in</span>
        </div>

        <h1 className="ad-gate__title">Melophile admin</h1>
        <p className="ad-gate__text">
          Everything the public site shows is edited in here. Sign in to continue.
        </p>

        <form className="ad-gate__form" action={action} noValidate>
          <input type="hidden" name="next" value={next} />

          <FormError message={state.error} />

          <Field
            label="Email"
            htmlFor="login-email"
            error={state.fieldErrors?.email}
            required
          >
            <TextInput
              id="login-email"
              name="email"
              type="email"
              defaultValue={state.email}
              autoComplete="username"
              maxLength={160}
              required
            />
          </Field>

          <Field
            label="Password"
            htmlFor="login-password"
            error={state.fieldErrors?.password}
            required
          >
            <TextInput
              id="login-password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </Field>

          <div className="ad-gate__actions">
            <button type="submit" className="btn ad-btn--primary" disabled={pending}>
              Sign in
            </button>
            <p className="ad-status mono" role="status">
              {pending ? 'Checking…' : ''}
            </p>
          </div>
        </form>

        <p className="ad-gate__foot">
          Five wrong tries locks this email out for fifteen minutes. If you have lost the
          password, reset it from the server with the seed script.
        </p>
      </div>
    </div>
  )
}

/**
 * Change password, on /admin/account. Requires the current password, and on
 * success every other session for this user is signed out.
 *
 * `minLength` is passed in rather than imported: src/lib/auth.ts pulls in
 * node:crypto and must never reach the browser bundle.
 */
export function ChangePasswordForm({ minLength }: { minLength: number }) {
  const [state, action, pending] = useActionState(changePassword, EMPTY_PASSWORD)

  return (
    <form className="ad-form" action={action} noValidate>
      <FormError message={state.error} />

      <Field
        label="Current password"
        htmlFor="currentPassword"
        error={state.fieldErrors?.currentPassword}
        required
      >
        <TextInput
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
        />
      </Field>

      <Field
        label="New password"
        htmlFor="newPassword"
        error={state.fieldErrors?.newPassword}
        hint={`At least ${minLength} characters. A short phrase you can remember beats a clever one you cannot.`}
        required
      >
        <TextInput
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
        />
      </Field>

      <Field
        label="New password again"
        htmlFor="confirmPassword"
        error={state.fieldErrors?.confirmPassword}
        required
      >
        <TextInput
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
        />
      </Field>

      <SaveBar
        saving={pending}
        saved={state.saved}
        label="Change password"
        savedLabel="Password changed. Other sessions are signed out."
      />
    </form>
  )
}
