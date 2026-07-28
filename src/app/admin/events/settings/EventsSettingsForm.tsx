'use client'

import { useActionState } from 'react'
import { SaveBar } from '@/components/admin/SaveBar'
import { Field, FormError, TextArea, TextInput } from '@/components/admin/fields'
import { saveEventsSettings, type EventsSettingsState } from '@/lib/actions/events'

/* ==========================================================================
   The events page editor.

   Four fields, because the public page is four decisions: what it is called,
   what it says under that, what the past section is called, and what stands in
   for the list when there is nothing published to put in it.

   The two headings refuse blank — they are section titles, and there is
   nothing for the page to leave out. The other two are allowed to be empty and
   empty is a designed state.

   A client component for one reason: useActionState, so an error lands next to
   the field that caused it.
   ========================================================================== */

export type EventsSettingsValues = {
  heading: string
  intro: string
  emptyMessage: string
  pastHeading: string
}

const EMPTY: EventsSettingsState = {}

export function EventsSettingsForm({ page }: { page: EventsSettingsValues }) {
  const [state, action, pending] = useActionState(saveEventsSettings, EMPTY)

  return (
    <form className="ad-form" action={action} noValidate>
      <FormError message={state.error} />

      <section className="ad-panel" aria-labelledby="aep-page">
        <div className="ad-panel__head">
          <span className="label" id="aep-page">
            The page
          </span>
        </div>
        <div className="ad-panel__body">
          <div className="ad-form">
            <Field
              label="Heading"
              htmlFor="heading"
              hint="The title at the top of /events, and the title search results show."
              error={state.fieldErrors?.heading}
              required
            >
              <TextInput
                id="heading"
                name="heading"
                defaultValue={page.heading}
                maxLength={120}
                required
              />
            </Field>

            <Field
              label="Intro"
              htmlFor="intro"
              hint="One paragraph under the heading. Leave it blank and nothing is rendered."
              error={state.fieldErrors?.intro}
            >
              <TextArea
                id="intro"
                name="intro"
                rows={4}
                defaultValue={page.intro}
                maxLength={2000}
              />
            </Field>

            <Field
              label="Past events heading"
              htmlFor="pastHeading"
              hint="The heading over dates that have already happened."
              error={state.fieldErrors?.pastHeading}
              required
            >
              <TextInput
                id="pastHeading"
                name="pastHeading"
                defaultValue={page.pastHeading}
                placeholder="Previously"
                maxLength={80}
                required
              />
            </Field>

            <Field
              label="When there is nothing on"
              htmlFor="emptyMessage"
              hint="Shown in place of the list when no upcoming date is published. A good place to say when the next run is announced."
              error={state.fieldErrors?.emptyMessage}
            >
              <TextArea
                id="emptyMessage"
                name="emptyMessage"
                rows={3}
                defaultValue={page.emptyMessage}
                maxLength={600}
              />
            </Field>
          </div>
        </div>
      </section>

      <SaveBar saving={pending} saved={state.saved}>
        <a
          className="btn btn--sm btn--ghost"
          href="/events"
          target="_blank"
          rel="noopener noreferrer"
        >
          View the events page
          <span className="vh"> (opens in a new tab)</span>
        </a>
      </SaveBar>
    </form>
  )
}
