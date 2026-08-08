'use client'

import { useActionState } from 'react'
import { SaveBar } from '@/components/admin/SaveBar'
import { Field, FormError, TextInput } from '@/components/admin/fields'
import { changePassword, type PasswordState } from '@/lib/actions/auth'

/* ==========================================================================
   Change password.

   The three field names — currentPassword, newPassword, confirmPassword — are
   the ones changePassword() reads, and its PasswordState keys the errors by the
   same names, so each one lands under the box that caused it.

   A client component for one reason: useActionState. autoComplete is set on all
   three so a password manager offers to generate and then store the new one
   rather than fighting the form.
   ========================================================================== */

const EMPTY: PasswordState = {}

export function PasswordForm({ minLength }: { minLength: number }) {
  const [state, action, pending] = useActionState(changePassword, EMPTY)

  return (
    <form className="ad-form" action={action} noValidate>
      <FormError message={state.error} />

      <section className="ad-panel" aria-labelledby="ac-pw-heading">
        <div className="ad-panel__head">
          <span className="label" id="ac-pw-heading">
            Password
          </span>
        </div>

        <div className="ad-panel__body">
          <div className="ad-form">
            <p className="ac-note ac-note--loud">
              Saving signs every other session out — your phone, another laptop, a browser
              you left logged in at the studio. This browser stays signed in.
            </p>

            <Field
              label="Password you use now"
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

            <div className="ad-cols">
              <Field
                label="New password"
                htmlFor="newPassword"
                hint={`At least ${minLength} characters. Length beats symbols — three or four unrelated words are far harder to break than one short word with punctuation in it.`}
                error={state.fieldErrors?.newPassword}
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
                hint="Typed twice, because a password nobody can reproduce locks you out of your own site."
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
            </div>
          </div>
        </div>
      </section>

      <SaveBar
        saving={pending}
        saved={state.saved}
        label="Change password"
        savedLabel="Password changed. Other sessions are signed out."
      />
    </form>
  )
}
