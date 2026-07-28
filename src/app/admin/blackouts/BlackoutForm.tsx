'use client'

import { useActionState } from 'react'
import { Field, FormError, TextInput } from '@/components/admin/fields'
import { addBlackout, type BlackoutState } from '@/lib/actions/bookings'

/* ==========================================================================
   Add one blocked day.

   A client component for one reason: useActionState, so "That date is already
   blocked out." lands under the date field instead of arriving as a 500 from the
   UNIQUE constraint. `today` comes from the server so the min on the picker
   agrees with the check the action makes.
   ========================================================================== */

const EMPTY: BlackoutState = {}

export function BlackoutForm({ today }: { today: string }) {
  const [state, action, pending] = useActionState(addBlackout, EMPTY)

  return (
    <form className="ad-form" action={action} noValidate>
      <FormError message={state.error} />

      <div className="ad-cols">
        <Field
          label="Date"
          htmlFor="blackout-date"
          hint="Today or any day after it. One day per row."
          error={state.fieldErrors?.date}
          required
        >
          <TextInput id="blackout-date" name="date" type="date" min={today} required />
        </Field>

        <Field
          label="Reason"
          htmlFor="blackout-reason"
          hint="Optional, and only ever seen in here. Up to 120 characters."
          error={state.fieldErrors?.reason}
        >
          <TextInput
            id="blackout-reason"
            name="reason"
            placeholder="Studio closed"
            maxLength={120}
          />
        </Field>
      </div>

      <div className="bo-add">
        <button type="submit" className="btn ad-btn--primary" disabled={pending}>
          Block this date
        </button>
        <p className="ad-status mono" role="status">
          {pending ? 'Saving…' : state.saved ? 'Date blocked.' : ''}
        </p>
      </div>
    </form>
  )
}
