'use client'

import Link from 'next/link'
import {
  useActionState,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import { PasswordField } from '@/components/auth/PasswordField'
import {
  requestPasswordReset,
  resendVerification,
  resetPassword,
  signIn,
  signUp,
  type AuthState,
} from '@/lib/actions/account-auth'
import {
  forgotPasswordSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
} from '@/lib/validation'

/* ==========================================================================
   Every form on an auth page.

   VALIDATION IS WRITTEN ONCE AND RUNS TWICE
   The schema that checks a field on blur here is the same object the server
   action parses the FormData with. Not an equivalent one — the same import.
   That is why a sentence read in the browser is word-for-word the sentence
   the server would have produced, and why the two can never drift.

   Each form keeps `action={formAction}` on the <form> and only calls
   preventDefault when the client has already found a problem. So the forms
   still submit without JavaScript, and when the client-side check is skipped
   the server catches the same thing and returns the same words.

   FOCUS IS PART OF THE FORM, NOT A FINISHING TOUCH
   A message nobody is looking at has not been delivered. Submitting with a bad
   field moves focus to it; a server rejection moves focus to whichever field
   the server named; a whole-form failure moves focus to the alert.
   ========================================================================== */

const EMPTY: AuthState = {}

type Errors = Record<string, string>

/** Field-keyed messages, first issue per field — same shape the server uses. */
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

/* --------------------------------------------------------------------------
   The shared machinery. Values, inline errors, focus, and the action.
   -------------------------------------------------------------------------- */

function useAuthForm<V extends Record<string, unknown>>(config: {
  action: (previous: AuthState, data: FormData) => Promise<AuthState>
  initial: V
  /** Field names in the order they appear, which is the order focus follows. */
  order: readonly string[]
  validate: (values: V) => Errors
}) {
  const [state, formAction, pending] = useActionState(config.action, EMPTY)
  const [values, setValues] = useState<V>(config.initial)
  const [errors, setErrors] = useState<Errors>({})

  const controls = useRef(new Map<string, HTMLElement>())
  const alertRef = useRef<HTMLDivElement | null>(null)

  // What the server rejected replaces what the browser thought, and takes
  // focus: the person is looking at the button they just pressed, not at a
  // field further up the panel.
  useEffect(() => {
    const fromServer = state.fieldErrors
    if (fromServer && Object.keys(fromServer).length > 0) {
      setErrors(fromServer)
      const first = config.order.find((name) => fromServer[name])
      if (first) controls.current.get(first)?.focus()
      return
    }
    if (state.formError) alertRef.current?.focus()
  }, [state])

  function checkOne(name: string, next: V) {
    const found = config.validate(next)
    setErrors((previous) => {
      const out = { ...previous }
      const message = found[name]
      if (message) out[name] = message
      else delete out[name]
      return out
    })
  }

  function setValue<K extends keyof V & string>(name: K, value: V[K]) {
    const next = { ...values, [name]: value }
    setValues(next)
    // Re-check on change only once the field has already said something is
    // wrong. Checking as they first type would nag mid-word.
    if (errors[name]) checkOne(name, next)
  }

  function blur(name: string) {
    checkOne(name, values)
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    const found = config.validate(values)
    const firstBad = config.order.find((name) => found[name])

    setErrors(firstBad ? found : {})

    if (firstBad) {
      // The server would answer with these exact sentences; this only saves
      // the round trip.
      event.preventDefault()
      controls.current.get(firstBad)?.focus()
    }
  }

  /** Registers a control so submit and the server can move focus to it. */
  const hold = (name: string) => (element: HTMLElement | null) => {
    if (element) controls.current.set(name, element)
    else controls.current.delete(name)
  }

  return {
    state,
    formAction,
    pending,
    values,
    errors,
    setValue,
    blur,
    submit,
    hold,
    alertRef,
  }
}

/* --------------------------------------------------------------------------
   Primitives
   -------------------------------------------------------------------------- */

function TextField({
  id,
  name,
  label,
  type,
  autoComplete,
  value,
  error,
  hint,
  mono = false,
  inputMode,
  required = false,
  onValue,
  onBlur,
  onRef,
}: {
  id: string
  name: string
  label: string
  type: 'text' | 'email'
  autoComplete: string
  value: string
  error?: string
  hint?: string
  /** Data — an address, a username — is set in the mono. A name is prose. */
  mono?: boolean
  inputMode?: 'email' | 'text'
  required?: boolean
  onValue: (value: string) => void
  onBlur: () => void
  onRef: (element: HTMLElement | null) => void
}) {
  const describedBy =
    [hint ? `${id}-hint` : null, error ? `${id}-err` : null].filter(Boolean).join(' ') ||
    undefined

  return (
    <div className="au-field">
      <label className="label au-field__label" htmlFor={id}>
        {label}
      </label>

      <input
        id={id}
        name={name}
        type={type}
        className={mono ? 'au-box au-box--mono' : 'au-box'}
        autoComplete={autoComplete}
        autoCapitalize={mono ? 'off' : undefined}
        autoCorrect={mono ? 'off' : undefined}
        spellCheck={mono ? false : undefined}
        inputMode={inputMode}
        required={required}
        value={value}
        ref={onRef}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
        onChange={(event) => onValue(event.currentTarget.value)}
        onBlur={onBlur}
      />

      {hint ? (
        <p className="mono au-hint" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}

      {error ? (
        <p className="au-err" id={`${id}-err`}>
          {error}
        </p>
      ) : null}
    </div>
  )
}

function FormAlert({
  label,
  message,
  alertRef,
}: {
  label: string
  message?: string
  alertRef: RefObject<HTMLDivElement | null>
}) {
  if (!message) return null

  return (
    <div className="au-alert" role="alert" tabIndex={-1} ref={alertRef}>
      <p className="label au-alert__label">{label}</p>
      <p className="au-alert__text">{message}</p>
    </div>
  )
}

/**
 * The submit row. The button's own label never changes while it is working —
 * a word that changes width reflows the button out from under the cursor
 * mid-click — so the state is announced in the status line beside it instead.
 */
function Actions({
  label,
  busy,
  pending,
}: {
  label: string
  busy: string
  pending: boolean
}) {
  return (
    <div className="au-actions">
      <button type="submit" className="btn btn--solid" disabled={pending}>
        {label}
      </button>
      <p className="mono au-status" role="status">
        {pending ? busy : ''}
      </p>
    </div>
  )
}

/** What replaces a form once the next step is somewhere other than this page. */
function Notice({
  label,
  text,
  aside,
  children,
}: {
  label: string
  text: string
  aside?: string
  children?: ReactNode
}) {
  const ref = useRef<HTMLDivElement | null>(null)

  // The answer takes focus, so it is not something you have to go looking for
  // after the form it replaced disappears.
  useEffect(() => {
    ref.current?.focus()
  }, [])

  return (
    <div className="au-note" role="status" tabIndex={-1} ref={ref}>
      <p className="label au-note__label">{label}</p>
      <p className="au-note__text">{text}</p>
      {aside ? <p className="au-note__aside">{aside}</p> : null}
      {children}
    </div>
  )
}

/* --------------------------------------------------------------------------
   Sign in
   -------------------------------------------------------------------------- */

export function SignInForm({ next = '/account' }: { next?: string }) {
  const uid = useId()

  const form = useAuthForm({
    action: signIn,
    initial: { email: '', password: '', remember: false },
    order: ['email', 'password'],
    validate: (values) => {
      const result = signInSchema.safeParse(values)
      return result.success ? {} : messagesFrom(result.error.issues)
    },
  })

  return (
    <form className="au-form" action={form.formAction} onSubmit={form.submit} noValidate>
      {/* Where to land afterwards. Re-validated in the action, never trusted. */}
      <input type="hidden" name="next" value={next} />

      <FormAlert
        label="Not signed in"
        message={form.state.formError}
        alertRef={form.alertRef}
      />

      <TextField
        id={`${uid}-email`}
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
        inputMode="email"
        mono
        required
        value={form.values.email}
        error={form.errors.email}
        onValue={(value) => form.setValue('email', value)}
        onBlur={() => form.blur('email')}
        onRef={form.hold('email')}
      />

      <PasswordField
        id={`${uid}-password`}
        name="password"
        label="Password"
        autoComplete="current-password"
        required
        value={form.values.password}
        error={form.errors.password}
        onChange={(value) => form.setValue('password', value)}
        onBlur={() => form.blur('password')}
        onRef={form.hold('password')}
      />

      <label className="au-check" htmlFor={`${uid}-remember`}>
        <input
          id={`${uid}-remember`}
          className="au-check__box"
          type="checkbox"
          name="remember"
          checked={form.values.remember}
          onChange={(event) => form.setValue('remember', event.currentTarget.checked)}
        />
        <span className="au-check__text">Keep me signed in on this device</span>
      </label>

      <Actions label="Sign in" busy="Checking…" pending={form.pending} />
    </form>
  )
}

/* --------------------------------------------------------------------------
   Sign up
   -------------------------------------------------------------------------- */

export function SignUpForm() {
  const uid = useId()

  const form = useAuthForm({
    action: signUp,
    initial: {
      fullName: '',
      username: '',
      email: '',
      password: '',
      confirmPassword: '',
      acceptTerms: false,
    },
    order: [
      'fullName',
      'username',
      'email',
      'password',
      'confirmPassword',
      'acceptTerms',
    ],
    validate: (values) => {
      // `company` is the honeypot, and is empty for anybody typing this in.
      const result = signUpSchema.safeParse({ ...values, company: '' })
      return result.success ? {} : messagesFrom(result.error.issues)
    },
  })

  /* The account is made, but nobody is signed in until the link in the email
     is used — so this says exactly that, and nothing that implies otherwise. */
  if (form.state.ok) {
    return (
      <Notice
        label="Check your email"
        text={form.state.notice ?? 'Check your email for a confirmation link.'}
        aside="If it is not there in a few minutes, look in the spam folder — confirmation mail lands there more often than anything else."
      />
    )
  }

  return (
    <form className="au-form" action={form.formAction} onSubmit={form.submit} noValidate>
      <FormAlert
        label="Not created"
        message={form.state.formError}
        alertRef={form.alertRef}
      />

      <TextField
        id={`${uid}-fullName`}
        name="fullName"
        label="Full name"
        type="text"
        autoComplete="name"
        required
        value={form.values.fullName}
        error={form.errors.fullName}
        onValue={(value) => form.setValue('fullName', value)}
        onBlur={() => form.blur('fullName')}
        onRef={form.hold('fullName')}
      />

      <TextField
        id={`${uid}-username`}
        name="username"
        label="Username"
        type="text"
        autoComplete="username"
        mono
        required
        hint="3 to 20 characters. Letters, numbers and underscores."
        value={form.values.username}
        error={form.errors.username}
        onValue={(value) => form.setValue('username', value)}
        onBlur={() => form.blur('username')}
        onRef={form.hold('username')}
      />

      <TextField
        id={`${uid}-email`}
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
        inputMode="email"
        mono
        required
        hint="The confirmation link goes here."
        value={form.values.email}
        error={form.errors.email}
        onValue={(value) => form.setValue('email', value)}
        onBlur={() => form.blur('email')}
        onRef={form.hold('email')}
      />

      <PasswordField
        id={`${uid}-password`}
        name="password"
        label="Password"
        autoComplete="new-password"
        meter
        required
        value={form.values.password}
        error={form.errors.password}
        onChange={(value) => form.setValue('password', value)}
        onBlur={() => form.blur('password')}
        onRef={form.hold('password')}
      />

      <PasswordField
        id={`${uid}-confirmPassword`}
        name="confirmPassword"
        label="Password again"
        autoComplete="new-password"
        required
        value={form.values.confirmPassword}
        error={form.errors.confirmPassword}
        onChange={(value) => form.setValue('confirmPassword', value)}
        onBlur={() => form.blur('confirmPassword')}
        onRef={form.hold('confirmPassword')}
      />

      <div className="au-field">
        <label className="au-check" htmlFor={`${uid}-acceptTerms`}>
          <input
            id={`${uid}-acceptTerms`}
            className="au-check__box"
            type="checkbox"
            name="acceptTerms"
            checked={form.values.acceptTerms}
            ref={form.hold('acceptTerms')}
            aria-invalid={Boolean(form.errors.acceptTerms)}
            aria-describedby={
              form.errors.acceptTerms ? `${uid}-acceptTerms-err` : undefined
            }
            onChange={(event) =>
              form.setValue('acceptTerms', event.currentTarget.checked)
            }
          />
          <span className="au-check__text">
            I accept the terms of sale and the privacy notice.
          </span>
        </label>

        {form.errors.acceptTerms ? (
          <p className="au-err" id={`${uid}-acceptTerms-err`}>
            {form.errors.acceptTerms}
          </p>
        ) : null}
      </div>

      {/* Spam gate. Invisible to a person, irresistible to a form-filling bot,
          and rejected by signUpSchema if anything at all ends up in it. */}
      <div className="vh" aria-hidden="true">
        <label htmlFor={`${uid}-company`}>Company</label>
        <input
          id={`${uid}-company`}
          name="company"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          defaultValue=""
        />
      </div>

      <Actions label="Create account" busy="Creating…" pending={form.pending} />
    </form>
  )
}

/* --------------------------------------------------------------------------
   Forgot password
   -------------------------------------------------------------------------- */

export function ForgotPasswordForm() {
  const uid = useId()

  const form = useAuthForm({
    action: requestPasswordReset,
    initial: { email: '' },
    order: ['email'],
    validate: (values) => {
      const result = forgotPasswordSchema.safeParse(values)
      return result.success ? {} : messagesFrom(result.error.issues)
    },
  })

  /* One answer, whether or not that address has an account. Anything else
     turns this form into a way of asking who is a customer. */
  if (form.state.ok) {
    return (
      <Notice
        label="Sent"
        text={
          form.state.notice ??
          'If that address has an account, a reset link is on its way.'
        }
        aside="Nothing arriving? Check the spam folder, then try again — the link is only valid for an hour."
      />
    )
  }

  return (
    <form className="au-form" action={form.formAction} onSubmit={form.submit} noValidate>
      <FormAlert
        label="Not sent"
        message={form.state.formError}
        alertRef={form.alertRef}
      />

      <TextField
        id={`${uid}-email`}
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
        inputMode="email"
        mono
        required
        value={form.values.email}
        error={form.errors.email}
        onValue={(value) => form.setValue('email', value)}
        onBlur={() => form.blur('email')}
        onRef={form.hold('email')}
      />

      <Actions label="Send reset link" busy="Sending…" pending={form.pending} />
    </form>
  )
}

/* --------------------------------------------------------------------------
   Reset password

   The recovery link goes to /auth/callback first, which establishes the
   session and forwards here, so this form only has to collect the new one.
   -------------------------------------------------------------------------- */

export function ResetPasswordForm() {
  const uid = useId()

  const form = useAuthForm({
    action: resetPassword,
    initial: { password: '', confirmPassword: '' },
    order: ['password', 'confirmPassword'],
    validate: (values) => {
      const result = resetPasswordSchema.safeParse(values)
      return result.success ? {} : messagesFrom(result.error.issues)
    },
  })

  if (form.state.ok) {
    return (
      <Notice
        label="Done"
        text={form.state.notice ?? 'Password changed. You are signed in.'}
      >
        <p>
          <Link className="link" href="/account">
            Go to your account
          </Link>
        </p>
      </Notice>
    )
  }

  return (
    <form className="au-form" action={form.formAction} onSubmit={form.submit} noValidate>
      <FormAlert
        label="Not changed"
        message={form.state.formError}
        alertRef={form.alertRef}
      />

      <PasswordField
        id={`${uid}-password`}
        name="password"
        label="New password"
        autoComplete="new-password"
        meter
        required
        value={form.values.password}
        error={form.errors.password}
        onChange={(value) => form.setValue('password', value)}
        onBlur={() => form.blur('password')}
        onRef={form.hold('password')}
      />

      <PasswordField
        id={`${uid}-confirmPassword`}
        name="confirmPassword"
        label="New password again"
        autoComplete="new-password"
        required
        value={form.values.confirmPassword}
        error={form.errors.confirmPassword}
        onChange={(value) => form.setValue('confirmPassword', value)}
        onBlur={() => form.blur('confirmPassword')}
        onRef={form.hold('confirmPassword')}
      />

      <Actions label="Set new password" busy="Saving…" pending={form.pending} />
    </form>
  )
}

/* --------------------------------------------------------------------------
   Resend the confirmation email
   -------------------------------------------------------------------------- */

export function ResendVerificationForm() {
  const uid = useId()

  const form = useAuthForm({
    action: resendVerification,
    initial: { email: '' },
    order: ['email'],
    validate: (values) => {
      const result = forgotPasswordSchema.safeParse(values)
      return result.success ? {} : messagesFrom(result.error.issues)
    },
  })

  /* Same answer for an address that needs confirming, an address that is
     already confirmed, and an address nobody has ever used. */
  if (form.state.ok) {
    return (
      <Notice
        label="Sent"
        text={
          form.state.notice ??
          'If that address needs confirming, a new link is on its way.'
        }
        aside="Check the spam folder before asking for another one."
      />
    )
  }

  return (
    <form className="au-form" action={form.formAction} onSubmit={form.submit} noValidate>
      <FormAlert
        label="Not sent"
        message={form.state.formError}
        alertRef={form.alertRef}
      />

      <TextField
        id={`${uid}-email`}
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
        inputMode="email"
        mono
        required
        value={form.values.email}
        error={form.errors.email}
        onValue={(value) => form.setValue('email', value)}
        onBlur={() => form.blur('email')}
        onRef={form.hold('email')}
      />

      <Actions label="Send a new link" busy="Sending…" pending={form.pending} />
    </form>
  )
}
