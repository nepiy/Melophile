'use client'

import {
  useActionState,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from 'react'
import {
  deleteAddress,
  saveAddress,
  type ProfileState,
} from '@/lib/actions/account-profile'
import type { AddressRow } from '@/lib/supabase/types'
import { addressSchema } from '@/lib/validation'

/* ==========================================================================
   The address book.

   One form is open at a time — either a blank one, or the one belonging to the
   address being edited — and it is keyed by that address's id, so switching
   from editing one to editing another remounts it and cannot leave the first
   one's server errors sitting under the second one's fields.

   DELETE TAKES TWO CLICKS AND NEITHER OF THEM IS confirm()
   The first click swaps the button for a question and an answer; the second
   answers it. A native confirm() blocks the whole tab, cannot be styled, and
   is the one dialog every person on the internet has been trained to dismiss
   without reading.
   ========================================================================== */

const EMPTY: ProfileState = {}

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

type Values = {
  label: string
  recipient: string
  country: string
  state: string
  city: string
  postalCode: string
  streetAddress: string
  phoneNumber: string
  isDefault: boolean
}

const ORDER = [
  'label',
  'recipient',
  'streetAddress',
  'city',
  'state',
  'postalCode',
  'country',
  'phoneNumber',
] as const

const BLANK: Values = {
  label: '',
  recipient: '',
  country: '',
  state: '',
  city: '',
  postalCode: '',
  streetAddress: '',
  phoneNumber: '',
  isDefault: false,
}

function valuesOf(address: AddressRow): Values {
  return {
    label: address.label,
    recipient: address.recipient,
    country: address.country,
    state: address.state,
    city: address.city,
    postalCode: address.postal_code,
    streetAddress: address.street_address,
    phoneNumber: address.phone_number,
    isDefault: address.is_default,
  }
}

/* --------------------------------------------------------------------------
   The book
   -------------------------------------------------------------------------- */

export function AddressBook({ addresses }: { addresses: AddressRow[] }) {
  const [editing, setEditing] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const empty = addresses.length === 0

  return (
    <div>
      {empty && !adding ? (
        <div className="ac-empty">
          <p className="ac-empty__title">No addresses yet</p>
          <p className="ac-empty__text">Add one and checkout will fill itself in.</p>
          <div className="ac-empty__actions">
            <button type="button" className="btn btn--sm" onClick={() => setAdding(true)}>
              Add an address
            </button>
          </div>
        </div>
      ) : null}

      {addresses.length > 0 ? (
        <ul className="ac-cards">
          {addresses.map((address) => (
            <li key={address.id} className="ac-card">
              {editing === address.id ? (
                <AddressForm
                  key={address.id}
                  id={address.id}
                  initial={valuesOf(address)}
                  heading="Edit this address"
                  onClose={() => setEditing(null)}
                />
              ) : (
                <AddressCard
                  address={address}
                  onEdit={() => {
                    setAdding(false)
                    setEditing(address.id)
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      ) : null}

      {adding ? (
        <div className="ac-card ac-card--new">
          <AddressForm
            key="new"
            id={null}
            initial={{ ...BLANK, isDefault: empty }}
            heading="New address"
            onClose={() => setAdding(false)}
          />
        </div>
      ) : empty ? null : (
        <div className="ac-actions">
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => {
              setEditing(null)
              setAdding(true)
            }}
          >
            Add another address
          </button>
        </div>
      )}
    </div>
  )
}

/* --------------------------------------------------------------------------
   One address, at rest
   -------------------------------------------------------------------------- */

function AddressCard({ address, onEdit }: { address: AddressRow; onEdit: () => void }) {
  const [confirming, setConfirming] = useState(false)
  const [pending, startTransition] = useTransition()

  const region = [address.city, address.state].filter(Boolean).join(', ')

  return (
    <>
      <div className="ac-card__top">
        <p className="label ac-card__label">{address.label || 'Address'}</p>
        {address.is_default ? (
          <span className="label ac-chip" data-tone="lamp">
            Default
          </span>
        ) : null}
      </div>

      {/* One line per line of the address, as it would be written on a parcel. */}
      <div className="ac-card__lines">
        {address.recipient ? <p>{address.recipient}</p> : null}
        <p>{address.street_address}</p>
        {region ? <p>{region}</p> : null}
        <p>{address.postal_code}</p>
        <p>{address.country}</p>
        {address.phone_number ? (
          <p className="mono ac-card__line--dim">{address.phone_number}</p>
        ) : null}
      </div>

      <div className="ac-card__actions">
        {confirming ? (
          <div className="ac-confirm">
            <p className="ac-confirm__text">Delete this address?</p>
            <button
              type="button"
              className="btn btn--sm ac-btn-danger"
              disabled={pending}
              onClick={() => {
                startTransition(async () => {
                  await deleteAddress(address.id)
                })
              }}
            >
              {pending ? 'Deleting…' : 'Yes, delete it'}
            </button>
            <button
              type="button"
              className="btn btn--sm btn--ghost"
              disabled={pending}
              onClick={() => setConfirming(false)}
            >
              Keep it
            </button>
          </div>
        ) : (
          <>
            <button type="button" className="btn btn--sm" onClick={onEdit}>
              Edit
            </button>
            <button
              type="button"
              className="btn btn--sm btn--ghost"
              onClick={() => setConfirming(true)}
            >
              Delete
            </button>
          </>
        )}
      </div>
    </>
  )
}

/* --------------------------------------------------------------------------
   One address, being written
   -------------------------------------------------------------------------- */

function AddressForm({
  id,
  initial,
  heading,
  onClose,
}: {
  /** null for a new address; the row id when editing one. */
  id: string | null
  initial: Values
  heading: string
  onClose: () => void
}) {
  const uid = useId()
  const [state, formAction, pending] = useActionState(saveAddress, EMPTY)

  const [values, setValues] = useState<Values>(initial)
  const [errors, setErrors] = useState<Errors>({})

  const controls = useRef(new Map<string, HTMLElement>())
  const alertRef = useRef<HTMLDivElement | null>(null)

  // Saved means the list below is already being re-rendered from the database
  // by revalidatePath, so the form has nothing left to say.
  useEffect(() => {
    if (state.ok) onClose()
  }, [state.ok, onClose])

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

  function check(next: Values): Errors {
    const result = addressSchema.safeParse(next)
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

  function setValue<K extends keyof Values>(name: K, value: Values[K]) {
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

  /*
   * A function that returns markup, NOT a component declared in here. A
   * component defined during render is a new type on every render, so React
   * would unmount and remount every input on each keystroke — and typing into
   * a field that is being replaced under you loses focus after one character.
   */
  function text({
    name,
    label,
    autoComplete,
    mono = false,
    hint,
    inputMode,
  }: {
    name: (typeof ORDER)[number]
    label: string
    autoComplete: string
    mono?: boolean
    hint?: string
    inputMode?: 'tel' | 'text'
  }) {
    const describedBy =
      [hint ? `${uid}-${name}-hint` : null, errors[name] ? `${uid}-${name}-err` : null]
        .filter(Boolean)
        .join(' ') || undefined

    return (
      <div className="au-field">
        <label className="label au-field__label" htmlFor={`${uid}-${name}`}>
          {label}
        </label>
        <input
          id={`${uid}-${name}`}
          name={name}
          type="text"
          className={mono ? 'au-box au-box--mono' : 'au-box'}
          autoComplete={autoComplete}
          inputMode={inputMode}
          value={values[name]}
          ref={hold(name)}
          aria-invalid={Boolean(errors[name])}
          aria-describedby={describedBy}
          onChange={(event) => setValue(name, event.currentTarget.value)}
          onBlur={() => checkOne(name, values)}
        />
        {hint ? (
          <p className="mono au-hint" id={`${uid}-${name}-hint`}>
            {hint}
          </p>
        ) : null}
        {errors[name] ? (
          <p className="au-err" id={`${uid}-${name}-err`}>
            {errors[name]}
          </p>
        ) : null}
      </div>
    )
  }

  return (
    <form className="ac-form" action={formAction} onSubmit={submit} noValidate>
      {id ? <input type="hidden" name="id" value={id} /> : null}

      <p className="label ac-card__label">{heading}</p>

      {state.formError ? (
        <div className="au-alert" role="alert" tabIndex={-1} ref={alertRef}>
          <p className="label au-alert__label">Not saved</p>
          <p className="au-alert__text">{state.formError}</p>
        </div>
      ) : null}

      <div className="ac-pair">
        {text({
          name: 'label',
          label: 'Label',
          autoComplete: 'off',
          hint: 'Home, Studio, anything you will recognise.',
        })}
        {text({ name: 'recipient', label: 'Who it goes to', autoComplete: 'name' })}
      </div>

      {text({
        name: 'streetAddress',
        label: 'Street address',
        autoComplete: 'street-address',
      })}

      <div className="ac-pair">
        {text({ name: 'city', label: 'Town or city', autoComplete: 'address-level2' })}
        {text({
          name: 'state',
          label: 'County or state',
          autoComplete: 'address-level1',
        })}
      </div>

      <div className="ac-pair">
        {text({
          name: 'postalCode',
          label: 'Postcode',
          autoComplete: 'postal-code',
          mono: true,
        })}
        {text({ name: 'country', label: 'Country', autoComplete: 'country-name' })}
      </div>

      {text({
        name: 'phoneNumber',
        label: 'Phone',
        autoComplete: 'tel',
        inputMode: 'tel',
        mono: true,
        hint: 'Couriers ask for one. Leave it blank if you would rather not.',
      })}

      <label className="au-check" htmlFor={`${uid}-isDefault`}>
        <input
          id={`${uid}-isDefault`}
          className="au-check__box"
          type="checkbox"
          name="isDefault"
          checked={values.isDefault}
          onChange={(event) => setValue('isDefault', event.currentTarget.checked)}
        />
        <span className="au-check__text">
          Use this one at checkout unless I say otherwise
        </span>
      </label>

      <div className="ac-actions">
        <button type="submit" className="btn btn--solid btn--sm" disabled={pending}>
          Save address
        </button>
        <button
          type="button"
          className="btn btn--sm btn--ghost"
          disabled={pending}
          onClick={onClose}
        >
          Cancel
        </button>
        <p className="mono au-status" role="status">
          {pending ? 'Saving…' : ''}
        </p>
      </div>
    </form>
  )
}
