'use client'

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type FormEvent,
  type ReactNode,
} from 'react'
import { SESSION_TYPES } from '@/db/schema'
import { submitBooking } from '@/lib/actions/booking'
import { formatDateLong, formatTime, pluralise, sessionTypeLabel } from '@/lib/format'
import { validateBookingField } from '@/lib/validation'

/* ==========================================================================
   The studio request form.

   Validation runs three times and the rules are written once. bookingSchema
   drives the inline checks here (on blur, and on change once a field has
   errored), the same schema gates the submit, and the server re-runs it before
   anything is written. A message the person reads in the browser is the same
   sentence the server would have produced.

   Field names match bookingSchema exactly, because the FormData this builds is
   parsed by that schema on the other side.
   ========================================================================== */

const FIELDS = [
  'name',
  'email',
  'phone',
  'date',
  'time',
  'sessionType',
  'durationHours',
  'people',
  'notes',
  'referenceUrl',
] as const

type Field = (typeof FIELDS)[number]
type Values = Record<Field, string>
type Errors = Partial<Record<Field, string>>

const BLANK: Values = {
  name: '',
  email: '',
  phone: '',
  date: '',
  time: '',
  sessionType: '',
  durationHours: '',
  people: '',
  notes: '',
  referenceUrl: '',
}

/**
 * Must stay word-for-word identical to BLOCKED_DATE in
 * src/lib/actions/booking.ts. The server rejects the same days; it has to give
 * the same reason.
 */
const BLOCKED_DATE =
  "That date is blocked out. Pick another day, or send a note and we'll find a slot."

/** The bookable window. bookingSchema enforces the same hours. */
const TIME_MIN = '08:00'
const TIME_MAX = '22:00'

/* The numeric bounds, written once so the picker, the hint and the message a
   person reads cannot drift apart. bookingSchema enforces the same numbers. */
const HOURS_MIN = 1
const HOURS_MAX = 12
const PEOPLE_MIN = 1
const PEOPLE_MAX = 30

export type BookingFormProps = {
  /** Today in ISO form, from the server, so the date floor cannot hydrate wrong. */
  today: string
  /** Dates the client has marked unavailable. Re-checked on the server. */
  blackoutDates: string[]
  /** contact.bookingSuccessMessage — the client's words, not ours. */
  successMessage: string
  /** contact.responseTime — how long a reply takes. */
  responseTime: string
}

export function BookingForm({
  today,
  blackoutDates,
  successMessage,
  responseTime,
}: BookingFormProps) {
  const [values, setValues] = useState<Values>(BLANK)
  const [errors, setErrors] = useState<Errors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [sent, setSent] = useState<{ message: string; values: Values } | null>(null)
  const [pending, startTransition] = useTransition()

  const formRef = useRef<HTMLFormElement | null>(null)
  const elapsedRef = useRef<HTMLInputElement | null>(null)
  const alertRef = useRef<HTMLDivElement | null>(null)
  const sentRef = useRef<HTMLDivElement | null>(null)
  const mountedAt = useRef(0)
  const controls = useRef(new Map<Field, HTMLElement>())

  const blocked = useMemo(() => new Set(blackoutDates), [blackoutDates])

  // Time to first submit, in ms. The schema rejects anything under 1.2s, which
  // is a bot, not a typist. Set in an effect so it measures the browser's mount
  // rather than the server's render.
  useEffect(() => {
    mountedAt.current = Date.now()
  }, [])

  // The confirmation takes focus, so the reply is not something you have to go
  // looking for after the form disappears.
  useEffect(() => {
    if (sent) sentRef.current?.focus()
  }, [sent])

  /** One field, checked in isolation, plus the blackout rule for the date. */
  function problem(field: Field, next: Values): string | null {
    const message = validateBookingField(field, next[field], {
      ...next,
      company: '',
      elapsedMs: 99_999,
    })
    if (message) return message
    if (field === 'date' && next.date && blocked.has(next.date)) return BLOCKED_DATE
    return null
  }

  function apply(field: Field, message: string | null) {
    setErrors((prev) => {
      const out = { ...prev }
      if (message) out[field] = message
      else delete out[field]
      return out
    })
  }

  function change(field: Field, value: string) {
    const next = { ...values, [field]: value }
    setValues(next)
    setFormError(null)
    // Only re-check on change once the field has already told them something is
    // wrong. Validating as they first type would nag mid-word.
    if (errors[field]) apply(field, problem(field, next))
  }

  function blur(field: Field) {
    apply(field, problem(field, values))
  }

  function focusField(field: Field) {
    controls.current.get(field)?.focus()
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return

    const found: Errors = {}
    for (const field of FIELDS) {
      const message = problem(field, values)
      if (message) found[field] = message
    }

    setErrors(found)

    const firstBad = FIELDS.find((field) => found[field])
    if (firstBad) {
      setFormError(null)
      focusField(firstBad)
      return
    }

    const form = formRef.current
    if (!form) return

    if (elapsedRef.current) {
      elapsedRef.current.value = String(
        mountedAt.current ? Date.now() - mountedAt.current : 0,
      )
    }

    const payload = new FormData(form)
    const snapshot = values

    startTransition(async () => {
      const result = await submitBooking(payload)

      if (result.ok) {
        setErrors({})
        setFormError(null)
        setSent({ message: result.message, values: snapshot })
        return
      }

      const next: Errors = {}
      let notice = result.formError ?? null
      for (const [key, message] of Object.entries(result.fieldErrors ?? {})) {
        if ((FIELDS as readonly string[]).includes(key)) next[key as Field] = message
        else if (!notice) notice = message
      }

      setErrors(next)
      setFormError(notice)

      const bad = FIELDS.find((field) => next[field])
      if (bad) focusField(bad)
      else alertRef.current?.focus()
    })
  }

  const hold = (field: Field) => (el: HTMLElement | null) => {
    if (el) controls.current.set(field, el)
    else controls.current.delete(field)
  }

  const boundTo = (field: Field, hasHint = false) =>
    [hasHint ? `bk-${field}-hint` : null, errors[field] ? `bk-${field}-err` : null]
      .filter(Boolean)
      .join(' ') || undefined

  /* ------------------------------ confirmation ------------------------------ */

  if (sent) {
    const given = sent.values
    const type = SESSION_TYPES.find((option) => option === given.sessionType)
    const hours = Number(given.durationHours)

    const recap: { key: string; label: string; value: string }[] = [
      { key: 'session', label: 'Session', value: type ? sessionTypeLabel(type) : '' },
      { key: 'date', label: 'Date', value: formatDateLong(given.date) },
      { key: 'time', label: 'Time', value: formatTime(given.time) },
      {
        key: 'length',
        label: 'Length',
        value: `${given.durationHours} ${pluralise(hours, 'hour')}`,
      },
      { key: 'people', label: 'People', value: given.people },
      { key: 'reply', label: 'Reply to', value: given.email },
    ]

    return (
      <div className="bk-done" role="status" tabIndex={-1} ref={sentRef}>
        <div className="bk-done__lead">
          <p className="label bk-done__mark">Confirmation</p>
          <h3 className="bk-done__title">{sent.message}</h3>

          {successMessage.trim() ? (
            <p className="bk-done__text">{successMessage}</p>
          ) : null}

          <p className="bk-done__reply">
            {responseTime.trim() ? `We reply ${responseTime}. ` : ''}Nothing is booked
            until we write back, and there is nothing to pay.
          </p>
        </div>

        <dl className="bk-done__recap">
          {recap
            .filter((line) => line.value.trim())
            .map((line) => (
              <div key={line.key} className="bk-done__row">
                <dt className="label">{line.label}</dt>
                <dd className="mono bk-done__val">{line.value}</dd>
              </div>
            ))}
        </dl>
      </div>
    )
  }

  /* --------------------------------- form --------------------------------- */

  return (
    <form className="bk" ref={formRef} onSubmit={submit} noValidate>
      {formError ? (
        <div className="bk__alert" role="alert" tabIndex={-1} ref={alertRef}>
          <p className="label bk__alert-label">Not sent</p>
          <p className="bk__alert-text">{formError}</p>
        </div>
      ) : null}

      <div className="bk__grid">
        <Cell field="name" label="Name" error={errors.name} className="bk__field--half">
          <input
            id="bk-name"
            name="name"
            type="text"
            className="bk__box"
            autoComplete="name"
            required
            value={values.name}
            ref={hold('name')}
            aria-invalid={Boolean(errors.name)}
            aria-describedby={boundTo('name')}
            onChange={(e) => change('name', e.currentTarget.value)}
            onBlur={() => blur('name')}
          />
        </Cell>

        <Cell
          field="email"
          label="Email"
          error={errors.email}
          className="bk__field--half"
        >
          <input
            id="bk-email"
            name="email"
            type="email"
            className="bk__box bk__box--mono"
            autoComplete="email"
            inputMode="email"
            required
            value={values.email}
            ref={hold('email')}
            aria-invalid={Boolean(errors.email)}
            aria-describedby={boundTo('email')}
            onChange={(e) => change('email', e.currentTarget.value)}
            onBlur={() => blur('email')}
          />
        </Cell>

        <Cell field="phone" label="Phone (optional)" error={errors.phone}>
          <input
            id="bk-phone"
            name="phone"
            type="tel"
            className="bk__box bk__box--mono"
            autoComplete="tel"
            value={values.phone}
            ref={hold('phone')}
            aria-invalid={Boolean(errors.phone)}
            aria-describedby={boundTo('phone')}
            onChange={(e) => change('phone', e.currentTarget.value)}
            onBlur={() => blur('phone')}
          />
        </Cell>

        <Cell
          field="date"
          label="Preferred date"
          hint={blackoutDates.length > 0 ? 'Some days are blocked out.' : undefined}
          error={errors.date}
        >
          <input
            id="bk-date"
            name="date"
            type="date"
            className="bk__box bk__box--mono"
            min={today}
            required
            value={values.date}
            ref={hold('date')}
            aria-invalid={Boolean(errors.date)}
            aria-describedby={boundTo('date', blackoutDates.length > 0)}
            onChange={(e) => change('date', e.currentTarget.value)}
            onBlur={() => blur('date')}
          />
        </Cell>

        <Cell
          field="time"
          label="Start time"
          hint={`${TIME_MIN} to ${TIME_MAX}`}
          error={errors.time}
        >
          <input
            id="bk-time"
            name="time"
            type="time"
            className="bk__box bk__box--mono"
            min={TIME_MIN}
            max={TIME_MAX}
            required
            value={values.time}
            ref={hold('time')}
            aria-invalid={Boolean(errors.time)}
            aria-describedby={boundTo('time', true)}
            onChange={(e) => change('time', e.currentTarget.value)}
            onBlur={() => blur('time')}
          />
        </Cell>

        <Cell field="sessionType" label="Session type" error={errors.sessionType}>
          <span className="bk__sel">
            <select
              id="bk-sessionType"
              name="sessionType"
              className="bk__box bk__box--mono"
              required
              value={values.sessionType}
              ref={hold('sessionType')}
              aria-invalid={Boolean(errors.sessionType)}
              aria-describedby={boundTo('sessionType')}
              onChange={(e) => change('sessionType', e.currentTarget.value)}
              onBlur={() => blur('sessionType')}
            >
              <option value="">Choose one</option>
              {SESSION_TYPES.map((option) => (
                <option key={option} value={option}>
                  {sessionTypeLabel(option)}
                </option>
              ))}
            </select>
          </span>
        </Cell>

        <Cell
          field="durationHours"
          label="Session length"
          hint={`Hours, ${HOURS_MIN} to ${HOURS_MAX}`}
          error={errors.durationHours}
        >
          <input
            id="bk-durationHours"
            name="durationHours"
            type="number"
            className="bk__box bk__box--mono"
            min={HOURS_MIN}
            max={HOURS_MAX}
            step={1}
            inputMode="numeric"
            required
            value={values.durationHours}
            ref={hold('durationHours')}
            aria-invalid={Boolean(errors.durationHours)}
            aria-describedby={boundTo('durationHours', true)}
            onChange={(e) => change('durationHours', e.currentTarget.value)}
            onBlur={() => blur('durationHours')}
          />
        </Cell>

        <Cell
          field="people"
          label="People"
          hint={`In the room, ${PEOPLE_MIN} to ${PEOPLE_MAX}`}
          error={errors.people}
        >
          <input
            id="bk-people"
            name="people"
            type="number"
            className="bk__box bk__box--mono"
            min={PEOPLE_MIN}
            max={PEOPLE_MAX}
            step={1}
            inputMode="numeric"
            required
            value={values.people}
            ref={hold('people')}
            aria-invalid={Boolean(errors.people)}
            aria-describedby={boundTo('people', true)}
            onChange={(e) => change('people', e.currentTarget.value)}
            onBlur={() => blur('people')}
          />
        </Cell>

        <Cell
          field="notes"
          label="Notes (optional)"
          hint="What you are working on, who is playing, what you need set up."
          error={errors.notes}
          className="bk__field--wide"
        >
          <textarea
            id="bk-notes"
            name="notes"
            rows={5}
            className="bk__box bk__box--area"
            value={values.notes}
            ref={hold('notes')}
            aria-invalid={Boolean(errors.notes)}
            aria-describedby={boundTo('notes', true)}
            onChange={(e) => change('notes', e.currentTarget.value)}
            onBlur={() => blur('notes')}
          />
        </Cell>

        <Cell
          field="referenceUrl"
          label="Reference link (optional)"
          hint="A track that sounds like where you want to land."
          error={errors.referenceUrl}
          className="bk__field--half"
        >
          <input
            id="bk-referenceUrl"
            name="referenceUrl"
            type="url"
            className="bk__box bk__box--mono"
            inputMode="url"
            placeholder="https://"
            value={values.referenceUrl}
            ref={hold('referenceUrl')}
            aria-invalid={Boolean(errors.referenceUrl)}
            aria-describedby={boundTo('referenceUrl', true)}
            onChange={(e) => change('referenceUrl', e.currentTarget.value)}
            onBlur={() => blur('referenceUrl')}
          />
        </Cell>
      </div>

      {/* Spam gates. Neither is filled in by a person, and neither is a CAPTCHA. */}
      <div className="vh" aria-hidden="true">
        <label htmlFor="bk-company">Company</label>
        <input
          id="bk-company"
          name="company"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          defaultValue=""
        />
      </div>
      <input ref={elapsedRef} type="hidden" name="elapsedMs" defaultValue="0" />

      <div className="bk__foot">
        <button type="submit" className="btn btn--solid" disabled={pending}>
          {pending ? 'Sending…' : 'Send request'}
        </button>
        <p className="bk__note">
          This is a request, not a booking. There is nothing to pay here.
        </p>
      </div>
    </form>
  )
}

/* --------------------------------------------------------------------------
   One labelled slot in the panel: mono label, hairline box, message beneath.
   -------------------------------------------------------------------------- */

function Cell({
  field,
  label,
  hint,
  error,
  className,
  children,
}: {
  field: Field
  label: string
  hint?: string
  error?: string
  className?: string
  children: ReactNode
}) {
  return (
    <div className={['bk__field', className].filter(Boolean).join(' ')}>
      <label className="label bk__label" htmlFor={`bk-${field}`}>
        {label}
      </label>

      {children}

      {hint ? (
        <p className="mono bk__hint" id={`bk-${field}-hint`}>
          {hint}
        </p>
      ) : null}

      {error ? (
        <p className="bk__err" id={`bk-${field}-err`}>
          {error}
        </p>
      ) : null}
    </div>
  )
}
