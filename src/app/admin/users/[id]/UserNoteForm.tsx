'use client'

import { useActionState } from 'react'
import { Field, FormError, TextArea } from '@/components/admin/fields'
import { staffAction, type StaffState } from '@/lib/actions/admin-users'
import type { AccountStatus } from '@/lib/supabase/types'

/* ==========================================================================
   Staff actions on one account.

   ONE FORM, FOUR BUTTONS, ONE REASON FIELD. A form posts the name and value of
   the button that submitted it, so suspend, ban, reinstate and "save the note"
   all share the same textarea rather than each carrying their own copy of it.
   Nothing here depends on JS having run: with scripting off it is an ordinary
   form post and the page comes back with the account changed.

   A client component for one reason: useActionState, so a refused action lands
   as a sentence next to the buttons rather than as a page the client has to
   read to work out whether anything happened.
   ========================================================================== */

const EMPTY: StaffState = {}

export function UserNoteForm({
  userId,
  status,
  reason,
  name,
}: {
  userId: string
  status: AccountStatus
  /** users.status_reason — the reason for the current state, and the staff note. */
  reason: string
  /** Who this is, for the accessible name on each button. */
  name: string
}) {
  const [state, action, pending] = useActionState(staffAction, EMPTY)

  return (
    <form className="ad-form au-form" action={action} noValidate>
      <input type="hidden" name="userId" value={userId} />

      <FormError message={state.error} />

      <section className="ad-panel" aria-labelledby="au-staff">
        <div className="ad-panel__head">
          <span className="label" id="au-staff">
            Staff actions
          </span>
          <span className="mono aor-count">Private</span>
        </div>

        <div className="ad-panel__body">
          <p className="aor-note">
            Suspending or banning stops this person signing in. They are told the account
            is suspended, or that it has been closed, and nothing else — the reason below
            is never shown to them and never emailed. Orders they have already placed are
            untouched either way.
          </p>

          <Field
            label="Reason"
            htmlFor="reason"
            required
            hint="Required for a change of state, and kept on the account as the record of why. It doubles as your note — save it on its own at any time."
          >
            <TextArea
              id="reason"
              name="reason"
              defaultValue={reason}
              rows={3}
              maxLength={2000}
            />
          </Field>

          <div className="au-acts" role="group" aria-label={`Staff actions for ${name}`}>
            {status !== 'suspended' ? (
              <button
                type="submit"
                name="intent"
                value="suspend"
                className="btn btn--sm ad-danger"
                disabled={pending}
              >
                Suspend account
                <span className="vh"> — {name}</span>
              </button>
            ) : null}

            {status !== 'banned' ? (
              <button
                type="submit"
                name="intent"
                value="ban"
                className="btn btn--sm ad-danger"
                disabled={pending}
              >
                Ban account
                <span className="vh"> — {name}</span>
              </button>
            ) : null}

            {status !== 'active' ? (
              <button
                type="submit"
                name="intent"
                value="reinstate"
                className="btn btn--sm"
                disabled={pending}
              >
                Reinstate account
                <span className="vh"> — {name}</span>
              </button>
            ) : null}

            <button
              type="submit"
              name="intent"
              value="note"
              className="btn btn--sm btn--ghost"
              disabled={pending}
            >
              Save note only
            </button>
          </div>

          <p className="ad-status mono au-acts__status" role="status">
            {pending ? 'Saving…' : state.saved ? (state.message ?? 'Changes saved.') : ''}
          </p>
        </div>
      </section>
    </form>
  )
}
