'use client'

import { useActionState, useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { saveProfile, type ProfileState } from '@/lib/actions/account-profile'
import { profileSchema } from '@/lib/validation'

/* ==========================================================================
   Edit your details.

   The schema that checks a field on blur here is the same object saveProfile
   parses the FormData with — not an equivalent one, the same import. A
   sentence read in the browser is therefore word for word the sentence the
   server would have produced, and the two cannot drift apart.

   The form keeps `action={formAction}` and only calls preventDefault when the
   browser has already found a problem, so it still submits without JavaScript
   and the server catches exactly what the browser would have.
   ========================================================================== */

const EMPTY: ProfileState = {}

const BIO_MAX = 500

/** Every value the union in ProfileRow allows, plus "not answered". */
const GENDERS = [
  { value: '', label: 'Not set' },
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'non_binary', label: 'Non-binary' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
  { value: 'self_described', label: 'Self-described' },
] as const

// The field stays editable, rather than limiting customers to a short list:
// any valid E.164 country calling code can be entered. These are useful
// search suggestions, not a restriction on which country can be used.
const CALLING_CODE_SUGGESTIONS = [
  ['+1', 'United States / Canada'],
  ['+7', 'Russia / Kazakhstan'],
  ['+20', 'Egypt'],
  ['+27', 'South Africa'],
  ['+30', 'Greece'],
  ['+31', 'Netherlands'],
  ['+32', 'Belgium'],
  ['+33', 'France'],
  ['+34', 'Spain'],
  ['+36', 'Hungary'],
  ['+39', 'Italy'],
  ['+40', 'Romania'],
  ['+41', 'Switzerland'],
  ['+43', 'Austria'],
  ['+44', 'United Kingdom'],
  ['+45', 'Denmark'],
  ['+46', 'Sweden'],
  ['+47', 'Norway'],
  ['+48', 'Poland'],
  ['+49', 'Germany'],
  ['+51', 'Peru'],
  ['+52', 'Mexico'],
  ['+54', 'Argentina'],
  ['+55', 'Brazil'],
  ['+56', 'Chile'],
  ['+57', 'Colombia'],
  ['+60', 'Malaysia'],
  ['+61', 'Australia'],
  ['+62', 'Indonesia'],
  ['+63', 'Philippines'],
  ['+64', 'New Zealand'],
  ['+65', 'Singapore'],
  ['+66', 'Thailand'],
  ['+81', 'Japan'],
  ['+82', 'South Korea'],
  ['+84', 'Vietnam'],
  ['+86', 'China'],
  ['+90', 'Türkiye'],
  ['+91', 'India'],
  ['+92', 'Pakistan'],
  ['+93', 'Afghanistan'],
  ['+94', 'Sri Lanka'],
  ['+95', 'Myanmar'],
  ['+98', 'Iran'],
  ['+211', 'South Sudan'],
  ['+212', 'Morocco'],
  ['+234', 'Nigeria'],
  ['+254', 'Kenya'],
  ['+255', 'Tanzania'],
  ['+256', 'Uganda'],
  ['+971', 'United Arab Emirates'],
  ['+972', 'Israel'],
  ['+974', 'Qatar'],
  ['+975', 'Bhutan'],
  ['+976', 'Mongolia'],
  ['+977', 'Nepal'],
] as const

export type ProfileFormValues = {
  fullName: string
  username: string
  phoneCountryCode: string
  phoneNumber: string
  dateOfBirth: string
  gender: string
  genderSelfDescribed: string
  bio: string
  marketingOptIn: boolean
}

type Errors = Record<string, string>

/** Field-keyed messages, first issue per field — the shape the server uses. */
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

const ORDER = [
  'fullName',
  'username',
  'phoneCountryCode',
  'phoneNumber',
  'dateOfBirth',
  'gender',
  'genderSelfDescribed',
  'bio',
] as const

export function ProfileForm({ initial }: { initial: ProfileFormValues }) {
  const uid = useId()
  const [state, formAction, pending] = useActionState(saveProfile, EMPTY)

  const [values, setValues] = useState<ProfileFormValues>(initial)
  const [errors, setErrors] = useState<Errors>({})

  const controls = useRef(new Map<string, HTMLElement>())
  const alertRef = useRef<HTMLDivElement | null>(null)

  // What the server rejected replaces what the browser thought, and takes
  // focus — the person is looking at the button they just pressed, not at a
  // field halfway up the panel.
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

  function check(values: ProfileFormValues): Errors {
    const result = profileSchema.safeParse(values)
    return result.success ? {} : messagesFrom(result.error.issues)
  }

  function checkOne(name: string, next: ProfileFormValues) {
    const found = check(next)
    setErrors((previous) => {
      const out = { ...previous }
      const message = found[name]
      if (message) out[name] = message
      else delete out[name]
      return out
    })
  }

  function setValue<K extends keyof ProfileFormValues>(
    name: K,
    value: ProfileFormValues[K],
  ) {
    const next = { ...values, [name]: value }
    setValues(next)
    // Only re-check a field that has already complained. Checking as somebody
    // first types would nag mid-word.
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

  const describe = (name: string, hasHint: boolean) =>
    [hasHint ? `${uid}-${name}-hint` : null, errors[name] ? `${uid}-${name}-err` : null]
      .filter(Boolean)
      .join(' ') || undefined

  const err = (name: string) =>
    errors[name] ? (
      <p className="au-err" id={`${uid}-${name}-err`}>
        {errors[name]}
      </p>
    ) : null

  return (
    <form className="ac-form" action={formAction} onSubmit={submit} noValidate>
      {state.formError ? (
        <div className="au-alert" role="alert" tabIndex={-1} ref={alertRef}>
          <p className="label au-alert__label">Not saved</p>
          <p className="au-alert__text">{state.formError}</p>
        </div>
      ) : null}

      <div className="au-field">
        <label className="label au-field__label" htmlFor={`${uid}-fullName`}>
          Full name
        </label>
        <input
          id={`${uid}-fullName`}
          name="fullName"
          type="text"
          className="au-box"
          autoComplete="name"
          value={values.fullName}
          ref={hold('fullName')}
          aria-invalid={Boolean(errors.fullName)}
          aria-describedby={describe('fullName', false)}
          onChange={(event) => setValue('fullName', event.currentTarget.value)}
          onBlur={() => checkOne('fullName', values)}
        />
        {err('fullName')}
      </div>

      <div className="au-field">
        <label className="label au-field__label" htmlFor={`${uid}-username`}>
          Username
        </label>
        <input
          id={`${uid}-username`}
          name="username"
          type="text"
          className="au-box au-box--mono"
          autoComplete="username"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          value={values.username}
          ref={hold('username')}
          aria-invalid={Boolean(errors.username)}
          aria-describedby={describe('username', true)}
          onChange={(event) => setValue('username', event.currentTarget.value)}
          onBlur={() => checkOne('username', values)}
        />
        <p className="mono au-hint" id={`${uid}-username-hint`}>
          Letters, numbers and underscores. This is how other people see you.
        </p>
        {err('username')}
      </div>

      <div className="ac-pair">
        <div className="au-field">
          <label className="label au-field__label" htmlFor={`${uid}-phoneCountryCode`}>
            Country code
          </label>
          <input
            id={`${uid}-phoneCountryCode`}
            name="phoneCountryCode"
            type="tel"
            list={`${uid}-phone-country-codes`}
            className="au-box au-box--mono"
            inputMode="tel"
            placeholder="+977"
            value={values.phoneCountryCode}
            ref={hold('phoneCountryCode')}
            aria-invalid={Boolean(errors.phoneCountryCode)}
            aria-describedby={describe('phoneCountryCode', false)}
            onChange={(event) => setValue('phoneCountryCode', event.currentTarget.value)}
            onBlur={() => checkOne('phoneCountryCode', values)}
          />
          <datalist id={`${uid}-phone-country-codes`}>
            {CALLING_CODE_SUGGESTIONS.map(([code, country]) => (
              <option key={code} value={code} label={country} />
            ))}
          </datalist>
          <p className="mono au-hint">
            Choose a suggestion or type the calling code for any country.
          </p>
          {err('phoneCountryCode')}
        </div>
        <div className="au-field">
          <label className="label au-field__label" htmlFor={`${uid}-phoneNumber`}>
            Phone
          </label>
          <input
            id={`${uid}-phoneNumber`}
            name="phoneNumber"
            type="tel"
            className="au-box au-box--mono"
            autoComplete="tel"
            inputMode="tel"
            value={values.phoneNumber}
            ref={hold('phoneNumber')}
            aria-invalid={Boolean(errors.phoneNumber)}
            aria-describedby={describe('phoneNumber', true)}
            onChange={(event) => setValue('phoneNumber', event.currentTarget.value)}
            onBlur={() => checkOne('phoneNumber', values)}
          />
          <p className="mono au-hint" id={`${uid}-phoneNumber-hint`}>
            For delivery questions only. Leave it blank if you would rather not.
          </p>
          {err('phoneNumber')}
        </div>

        <div className="au-field">
          <label className="label au-field__label" htmlFor={`${uid}-dateOfBirth`}>
            Date of birth
          </label>
          <input
            id={`${uid}-dateOfBirth`}
            name="dateOfBirth"
            type="date"
            className="au-box au-box--mono"
            autoComplete="bday"
            value={values.dateOfBirth}
            ref={hold('dateOfBirth')}
            aria-invalid={Boolean(errors.dateOfBirth)}
            aria-describedby={describe('dateOfBirth', false)}
            onChange={(event) => setValue('dateOfBirth', event.currentTarget.value)}
            onBlur={() => checkOne('dateOfBirth', values)}
          />
          {err('dateOfBirth')}
        </div>
      </div>

      <div className="au-field">
        <label className="label au-field__label" htmlFor={`${uid}-gender`}>
          Gender
        </label>
        <span className="ac-select-wrap">
          <select
            id={`${uid}-gender`}
            name="gender"
            className="au-box ac-select"
            value={values.gender}
            ref={hold('gender')}
            aria-invalid={Boolean(errors.gender)}
            aria-describedby={describe('gender', false)}
            onChange={(event) => setValue('gender', event.currentTarget.value)}
          >
            {GENDERS.map((option) => (
              <option key={option.value || 'none'} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </span>
        {err('gender')}
      </div>

      {/* Only ever on screen when it means something. A permanently visible
          "describe yourself" box beside a Gender select asks the question
          twice. */}
      {values.gender === 'self_described' ? (
        <div className="au-field">
          <label className="label au-field__label" htmlFor={`${uid}-genderSelfDescribed`}>
            In your own words
          </label>
          <input
            id={`${uid}-genderSelfDescribed`}
            name="genderSelfDescribed"
            type="text"
            className="au-box"
            value={values.genderSelfDescribed}
            ref={hold('genderSelfDescribed')}
            aria-invalid={Boolean(errors.genderSelfDescribed)}
            aria-describedby={describe('genderSelfDescribed', false)}
            onChange={(event) =>
              setValue('genderSelfDescribed', event.currentTarget.value)
            }
            onBlur={() => checkOne('genderSelfDescribed', values)}
          />
          {err('genderSelfDescribed')}
        </div>
      ) : (
        /* The field is not rendered, so the server would see nothing for it.
           Sending the empty string keeps the parse identical either way. */
        <input type="hidden" name="genderSelfDescribed" value="" />
      )}

      <div className="au-field">
        <label className="label au-field__label" htmlFor={`${uid}-bio`}>
          About you
        </label>
        <textarea
          id={`${uid}-bio`}
          name="bio"
          className="au-box ac-area"
          rows={4}
          value={values.bio}
          ref={hold('bio')}
          aria-invalid={Boolean(errors.bio)}
          aria-describedby={describe('bio', true)}
          onChange={(event) => setValue('bio', event.currentTarget.value)}
          onBlur={() => checkOne('bio', values)}
        />
        <p className="mono ac-count" id={`${uid}-bio-hint`}>
          {values.bio.length} of {BIO_MAX}
        </p>
        {err('bio')}
      </div>

      <label className="au-check" htmlFor={`${uid}-marketingOptIn`}>
        <input
          id={`${uid}-marketingOptIn`}
          className="au-check__box"
          type="checkbox"
          name="marketingOptIn"
          checked={values.marketingOptIn}
          onChange={(event) => setValue('marketingOptIn', event.currentTarget.checked)}
        />
        <span className="au-check__text">
          Email me about new releases, shows and studio news. Never more than once a
          month, and never your address to anybody else.
        </span>
      </label>

      <div className="ac-actions">
        <button type="submit" className="btn btn--solid btn--sm" disabled={pending}>
          Save changes
        </button>
        <p className="mono ac-saved" role="status">
          {pending ? 'Saving…' : state.ok ? (state.notice ?? 'Changes saved.') : ''}
        </p>
      </div>
    </form>
  )
}
