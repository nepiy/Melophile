'use client'

import { useActionState, useEffect, useId, useRef, useState } from 'react'
import { deleteAccount, type ProfileState } from '@/lib/actions/account-profile'
import { deleteAccountSchema } from '@/lib/validation'

/* ==========================================================================
   Close your account.

   TWO STEPS, AND THE SECOND ONE CANNOT BE DONE BY MUSCLE MEMORY
   Nothing is revealed until it is asked for, and then the confirmation is a
   sentence that has to be typed out. There is no modal with a red button in
   the corner where "OK" usually is, because that is exactly the shape a person
   dismisses without reading.

   The words are checked by deleteAccountSchema — the same object the server
   parses with — so a mistyped confirmation is refused in the same sentence at
   both ends.

   On success the action redirects, so there is no success state here to
   render. That is deliberate: an account page belonging to an account that no
   longer exists has nothing honest to show.
   ========================================================================== */

const EMPTY: ProfileState = {}

const PHRASE = 'delete my account'

export function DeleteAccountForm() {
  const uid = useId()
  const [state, formAction, pending] = useActionState(deleteAccount, EMPTY)

  const [revealed, setRevealed] = useState(false)
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)

  const inputRef = useRef<HTMLInputElement | null>(null)

  // Revealing the second step moves focus into it, so the keyboard is where
  // the eye is and nobody has to hunt for what just appeared.
  useEffect(() => {
    if (revealed) inputRef.current?.focus()
  }, [revealed])

  const serverError = state.fieldErrors?.confirm ?? state.formError
  const shown = error ?? serverError

  if (!revealed) {
    return (
      <div className="ac-actions">
        <button
          type="button"
          className="btn btn--sm ac-btn-danger"
          onClick={() => setRevealed(true)}
        >
          Delete my account
        </button>
      </div>
    )
  }

  return (
    <form
      className="ac-form"
      action={formAction}
      noValidate
      onSubmit={(event) => {
        const result = deleteAccountSchema.safeParse({ confirm })
        if (!result.success) {
          event.preventDefault()
          setError(result.error.issues[0]?.message ?? `Type "${PHRASE}" exactly.`)
          inputRef.current?.focus()
          return
        }
        setError(null)
      }}
    >
      <p className="ac-panel__text">What happens when you do this:</p>

      <ul className="ac-list">
        <li className="ac-list__item">
          Your account, your profile, your addresses and your history are removed.
        </li>
        <li className="ac-list__item">
          Your orders are kept, because they are a financial record we are required to
          keep — but the link between them and you is removed.
        </li>
        <li className="ac-list__item">
          It cannot be undone. There is no restore, by you or by us.
        </li>
      </ul>

      <div className="au-field">
        <label className="label au-field__label" htmlFor={`${uid}-confirm`}>
          Type {PHRASE} to confirm
        </label>
        <input
          id={`${uid}-confirm`}
          name="confirm"
          type="text"
          className="au-box au-box--mono"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          value={confirm}
          ref={inputRef}
          aria-invalid={Boolean(shown)}
          aria-describedby={shown ? `${uid}-err` : undefined}
          onChange={(event) => {
            setConfirm(event.currentTarget.value)
            if (error) setError(null)
          }}
        />
        {shown ? (
          <p className="au-err" id={`${uid}-err`}>
            {shown}
          </p>
        ) : null}
      </div>

      <div className="ac-actions">
        <button type="submit" className="btn btn--sm ac-btn-danger" disabled={pending}>
          Delete account permanently
        </button>

        <button
          type="button"
          className="btn btn--sm btn--ghost"
          disabled={pending}
          onClick={() => {
            setRevealed(false)
            setConfirm('')
            setError(null)
          }}
        >
          Keep my account
        </button>

        <p className="mono au-status" role="status">
          {pending ? 'Deleting…' : ''}
        </p>
      </div>
    </form>
  )
}
