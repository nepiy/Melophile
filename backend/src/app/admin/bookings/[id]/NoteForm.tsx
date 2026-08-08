'use client'

import { useActionState } from 'react'
import { SaveBar } from '@/components/admin/SaveBar'
import { Field, FormError, TextArea } from '@/components/admin/fields'
import { saveAdminNote, type NoteState } from '@/lib/actions/bookings'

/* ==========================================================================
   The private note on one request.

   A client component for one reason: useActionState, so "Note saved." lands in
   the save bar rather than the client wondering whether it took. The note is
   ordinary form data and the id travels in a hidden field, so nothing here
   depends on JS having run.
   ========================================================================== */

const EMPTY: NoteState = {}

export function NoteForm({ id, note }: { id: number; note: string }) {
  const [state, action, pending] = useActionState(saveAdminNote, EMPTY)

  return (
    <form className="ad-form" action={action} noValidate>
      <input type="hidden" name="id" value={id} />

      <FormError message={state.error} />

      <section className="ad-panel" aria-labelledby="bk-yournote">
        <div className="ad-panel__head">
          <span className="label" id="bk-yournote">
            Your note
          </span>
          <span className="mono desk-count">Private</span>
        </div>
        <div className="ad-panel__body">
          <Field
            label="Note to yourself"
            htmlFor="adminNote"
            hint="Only you see this. It is never emailed, never shown to the person who sent the request, and never on the site."
          >
            <TextArea
              id="adminNote"
              name="adminNote"
              defaultValue={note}
              rows={5}
              maxLength={4000}
            />
          </Field>
        </div>
      </section>

      <SaveBar
        saving={pending}
        saved={state.saved}
        label="Save note"
        savedLabel="Note saved."
      />
    </form>
  )
}
