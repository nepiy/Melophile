'use client'

import { useActionState } from 'react'
import { SaveBar } from '@/components/admin/SaveBar'
import {
  Field,
  FormError,
  RepeaterField,
  TextArea,
  TextInput,
} from '@/components/admin/fields'
import { saveContact, type PageState } from '@/lib/actions/pages'

/* ==========================================================================
   The Contact editor.

   Two panels, because the public page is two things: the details plate, which
   home section 4 also reads, and the booking copy that wraps the request form.

   Almost every field here is allowed to be blank, and blank is a designed
   state — ContactDetails renders no label with nothing under it. The one
   exception is the booking heading, which is a section title rather than a
   detail: there is nothing for the page to leave out.

   A client component for one reason: useActionState, so an error lands next to
   the field that caused it.
   ========================================================================== */

export type ContactFormValues = {
  addressLines: string
  emails: Record<string, string>[]
  phone: string
  hours: string
  socialLinks: Record<string, string>[]
  mapEmbed: string
  bookingHeading: string
  bookingIntro: string
  bookingSuccessMessage: string
  responseTime: string
}

const EMPTY: PageState = {}

const EMAIL_COLUMNS = [
  { key: 'label', label: 'What for', placeholder: 'General', width: '12rem' },
  { key: 'address', label: 'Address', placeholder: 'hello@melophile.example' },
]

const SOCIAL_COLUMNS = [
  { key: 'platform', label: 'Platform', placeholder: 'Instagram', width: '12rem' },
  { key: 'url', label: 'Link', placeholder: 'https://' },
]

export function ContactForm({ contact }: { contact: ContactFormValues }) {
  const [state, action, pending] = useActionState(saveContact, EMPTY)

  return (
    <form className="ad-form" action={action} noValidate>
      <FormError message={state.error} />

      <section className="ad-panel" aria-labelledby="ct-details">
        <div className="ad-panel__head">
          <span className="label" id="ct-details">
            Details
          </span>
        </div>
        <div className="ad-panel__body">
          <div className="ad-form">
            <Field
              label="Address"
              htmlFor="addressLines"
              hint="One line per line."
              error={state.fieldErrors?.addressLines}
            >
              <TextArea
                id="addressLines"
                name="addressLines"
                rows={4}
                defaultValue={contact.addressLines}
                maxLength={400}
              />
            </Field>

            <RepeaterField
              name="emails"
              label="Email addresses"
              hint="One row per address — General, Bookings, Press. The label is printed above it, and a row with no address is dropped when you save."
              columns={EMAIL_COLUMNS}
              rows={contact.emails}
              addLabel="Add an address"
            />

            <div className="ad-cols">
              <Field
                label="Phone"
                htmlFor="phone"
                hint="Printed as typed, and dialled with the spaces stripped out."
                error={state.fieldErrors?.phone}
              >
                <TextInput
                  id="phone"
                  name="phone"
                  type="tel"
                  defaultValue={contact.phone}
                  placeholder="+44 20 7000 0000"
                  maxLength={40}
                />
              </Field>

              <Field
                label="Hours"
                htmlFor="hours"
                hint="One line per line."
                error={state.fieldErrors?.hours}
              >
                <TextArea
                  id="hours"
                  name="hours"
                  rows={4}
                  defaultValue={contact.hours}
                  maxLength={300}
                />
              </Field>
            </div>

            <RepeaterField
              name="socialLinks"
              label="Elsewhere"
              hint="The platform is printed as the link text. An address the browser cannot open is dropped when you save, so the page never shows a link that goes nowhere."
              columns={SOCIAL_COLUMNS}
              rows={contact.socialLinks}
              addLabel="Add a link"
            />

            <Field
              label="Map"
              htmlFor="mapEmbed"
              hint='Paste the map URL only — the src="…" value from the embed code, not the whole iframe. Leave it blank and the page shows no map at all.'
              error={state.fieldErrors?.mapEmbed}
            >
              <TextInput
                id="mapEmbed"
                name="mapEmbed"
                type="url"
                defaultValue={contact.mapEmbed}
                placeholder="https://www.google.com/maps/embed?pb=…"
                maxLength={1000}
              />
            </Field>
          </div>
        </div>
      </section>

      <section className="ad-panel" aria-labelledby="ct-booking">
        <div className="ad-panel__head">
          <span className="label" id="ct-booking">
            Booking
          </span>
        </div>
        <div className="ad-panel__body">
          <div className="ad-form">
            <Field
              label="Heading"
              htmlFor="bookingHeading"
              hint="The title over the request form, on /contact and on the home page."
              error={state.fieldErrors?.bookingHeading}
              required
            >
              <TextInput
                id="bookingHeading"
                name="bookingHeading"
                defaultValue={contact.bookingHeading}
                placeholder="Book the studio"
                maxLength={120}
                required
              />
            </Field>

            <Field
              label="Intro"
              htmlFor="bookingIntro"
              hint="One or two lines under the heading, before the form."
              error={state.fieldErrors?.bookingIntro}
            >
              <TextArea
                id="bookingIntro"
                name="bookingIntro"
                rows={3}
                defaultValue={contact.bookingIntro}
                maxLength={1000}
              />
            </Field>

            <Field
              label="Success message"
              htmlFor="bookingSuccessMessage"
              hint="Shown after someone sends a request."
              error={state.fieldErrors?.bookingSuccessMessage}
            >
              <TextArea
                id="bookingSuccessMessage"
                name="bookingSuccessMessage"
                rows={3}
                defaultValue={contact.bookingSuccessMessage}
                maxLength={1000}
              />
            </Field>

            <Field
              label="Response time"
              htmlFor="responseTime"
              hint='Completes the sentence "We reply …", e.g. "within two working days".'
              error={state.fieldErrors?.responseTime}
            >
              <TextInput
                id="responseTime"
                name="responseTime"
                defaultValue={contact.responseTime}
                placeholder="within two working days"
                maxLength={120}
              />
            </Field>
          </div>
        </div>
      </section>

      <SaveBar saving={pending} saved={state.saved}>
        <a
          className="btn btn--sm btn--ghost"
          href="/contact"
          target="_blank"
          rel="noopener noreferrer"
        >
          View on the site
          <span className="vh"> (opens in a new tab)</span>
        </a>
      </SaveBar>
    </form>
  )
}
