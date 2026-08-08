'use client'

import { useActionState, useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { PasswordField } from '@/components/auth/PasswordField'
import { changePassword, type AuthState } from '@/lib/actions/account-auth'
import { changePasswordSchema } from '@/lib/validation'

/* ==========================================================================
   Change your password.

   The server re-authenticates before it changes anything: the current password
   has to be right, because otherwise anybody who sat down at an unlocked
   laptop could take the account. That check cannot happen here, so the current
   password field is only ever validated for being non-empty in the browser —
   "that is not your current password" is a sentence only the server can say.
   ========================================================================== */

const EMPTY: AuthState = {}

const ORDER = ['currentPassword', 'password', 'confirmPassword'] as const

type Values = {
  currentPassword: string
  password: string
  confirmPassword: string
}

type Errors = Record<string, string>

function messagesFrom(
  issues: readonly { path: readonly PropertyKey[]; message: string }[],
): Errors {
  const out: Errors = {}
  for (const issue of issues) {
    const key = issue.path.length > 0 ? String(issue.path[0]) : '_form'
    if (!(key in out)) out[key] = issue.message
  }
  return out
}

const BLANK: Values = { currentPassword: '', password: '', confirmPassword: '' }

export function PasswordChangeForm() {
  const uid = useId()
  const [state, formAction, pending] = useActionState(changePassword, EMPTY)

  const [values, setValues] = useState<Values>(BLANK)
  const [errors, setErrors] = useState<Errors>({})

  const controls = useRef(new Map<string, HTMLElement>())
  const alertRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const fromServer = state.fieldErrors
    if (fromServer && Object.keys(fromServer).length > 0) {
      setErrors(fromServer)
      const first = ORDER.find((name) => fromServer[name])
      if (first) controls.current.get(first)?.focus()
      return
    }
    if (state.formError) alertRef.current?.focus()
  }, [state])

  /* Three password boxes left full of the old and the new password after a
     successful change is a browser tab holding both of them. Empty them. */
  useEffect(() => {
    if (state.ok) {
      setValues(BLANK)
      setErrors({})
    }
  }, [state.ok])

  function check(next: Values): Errors {
    const result = changePasswordSchema.safeParse(next)
    return result.success ? {} : messagesFrom(result.error.issues)
  }

  function checkOne(name: string, next: Values) {
    const found = check(next)
    setErrors((previous) => {
      const out = { ...previous }
      const message = found[name]
      if (message) out[name] = message
      else delete out[name]
      return out
    })
  }

  function setValue<K extends keyof Values>(name: K, value: string) {
    const next = { ...values, [name]: value }
    setValues(next)
    if (errors[name]) checkOne(name, next)
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    const found = check(values)
    const firstBad = ORDER.find((name) => found[name])
    setErrors(firstBad ? found : {})

    if (firstBad) {
      event.preventDefault()
      controls.current.get(firstBad)?.focus()
    }
  }

  const hold = (name: string) => (element: HTMLElement | null) => {
    if (element) controls.current.set(name, element)
    else controls.current.delete(name)
  }

  return (
    <form className="ac-form" action={formAction} onSubmit={submit} noValidate>
      {state.formError ? (
        <div className="au-alert" role="alert" tabIndex={-1} ref={alertRef}>
          <p className="label au-alert__label">Not changed</p>
          <p className="au-alert__text">{state.formError}</p>
        </div>
      ) : null}

      <PasswordField
        id={`${uid}-currentPassword`}
        name="currentPassword"
        label="Current password"
        autoComplete="current-password"
        required
        value={values.currentPassword}
        error={errors.currentPassword}
        onChange={(value) => setValue('currentPassword', value)}
        onBlur={() => checkOne('currentPassword', values)}
        onRef={hold('currentPassword')}
      />

      <PasswordField
        id={`${uid}-password`}
        name="password"
        label="New password"
        autoComplete="new-password"
        meter
        required
        value={values.password}
        error={errors.password}
        onChange={(value) => setValue('password', value)}
        onBlur={() => checkOne('password', values)}
        onRef={hold('password')}
      />

      <PasswordField
        id={`${uid}-confirmPassword`}
        name="confirmPassword"
        label="New password again"
        autoComplete="new-password"
        required
        value={values.confirmPassword}
        error={errors.confirmPassword}
        onChange={(value) => setValue('confirmPassword', value)}
        onBlur={() => checkOne('confirmPassword', values)}
        onRef={hold('confirmPassword')}
      />

      <div className="ac-actions">
        <button type="submit" className="btn btn--solid btn--sm" disabled={pending}>
          Change password
        </button>
        <p className="mono ac-saved" role="status">
          {pending ? 'Checking…' : state.ok ? (state.notice ?? 'Changes saved.') : ''}
        </p>
      </div>
    </form>
  )
}
