'use client'

import { useActionState } from 'react'
import { SaveBar } from '@/components/admin/SaveBar'
import { Field, FormError, TextArea, TextInput } from '@/components/admin/fields'
import { saveStoreSettings, type StoreSettingsState } from '@/lib/actions/store'

/* ==========================================================================
   The store page editor.

   Three panels, because the public store is three things: the page itself,
   the three sections it is divided into, and the money and the notes that
   wrap a checkout.

   Almost every field here is allowed to be blank, and blank is a designed
   state — the store renders no paragraph rather than an empty one. The
   exceptions are the four headings, which are section titles: there is
   nothing for the page to leave out.

   A client component for one reason: useActionState, so an error lands next
   to the field that caused it.
   ========================================================================== */

export type StoreSettingsValues = {
  heading: string
  intro: string
  merchHeading: string
  merchIntro: string
  musicHeading: string
  musicIntro: string
  beatsHeading: string
  beatsIntro: string
  emptyMessage: string
  currency: string
  currencySymbol: string
  /** Pounds, as typed. Stored as pence. */
  shipping: string
  shippingNote: string
  checkoutNote: string
  successMessage: string
}

const EMPTY: StoreSettingsState = {}

/** The three sections, so the panel is one loop rather than three copies. */
const SECTIONS = [
  {
    key: 'merch',
    label: 'Merch',
    heading: 'merchHeading',
    intro: 'merchIntro',
  },
  {
    key: 'music',
    label: 'Music',
    heading: 'musicHeading',
    intro: 'musicIntro',
  },
  {
    key: 'beats',
    label: 'Beats',
    heading: 'beatsHeading',
    intro: 'beatsIntro',
  },
] as const

export function StoreSettingsForm({ page }: { page: StoreSettingsValues }) {
  const [state, action, pending] = useActionState(saveStoreSettings, EMPTY)

  return (
    <form className="ad-form" action={action} noValidate>
      <FormError message={state.error} />

      <section className="ad-panel" aria-labelledby="sp-page">
        <div className="ad-panel__head">
          <span className="label" id="sp-page">
            The page
          </span>
        </div>
        <div className="ad-panel__body">
          <div className="ad-form">
            <Field
              label="Heading"
              htmlFor="heading"
              hint="The title at the top of /store, and the title search results show."
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
              label="When a section is empty"
              htmlFor="emptyMessage"
              hint="Shown in place of the grid when there is nothing published to put in it."
              error={state.fieldErrors?.emptyMessage}
            >
              <TextArea
                id="emptyMessage"
                name="emptyMessage"
                rows={2}
                defaultValue={page.emptyMessage}
                maxLength={600}
              />
            </Field>
          </div>
        </div>
      </section>

      <section className="ad-panel" aria-labelledby="sp-sections">
        <div className="ad-panel__head">
          <span className="label" id="sp-sections">
            Sections
          </span>
        </div>
        <div className="ad-panel__body">
          <div className="ad-form">
            {SECTIONS.map((section) => (
              <div className="ad-cols" key={section.key}>
                <Field
                  label={`${section.label} heading`}
                  htmlFor={section.heading}
                  error={state.fieldErrors?.[section.heading]}
                  required
                >
                  <TextInput
                    id={section.heading}
                    name={section.heading}
                    defaultValue={page[section.heading]}
                    maxLength={80}
                    required
                  />
                </Field>

                <Field
                  label={`${section.label} intro`}
                  htmlFor={section.intro}
                  error={state.fieldErrors?.[section.intro]}
                >
                  <TextInput
                    id={section.intro}
                    name={section.intro}
                    defaultValue={page[section.intro]}
                    maxLength={1000}
                  />
                </Field>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="ad-panel" aria-labelledby="sp-money">
        <div className="ad-panel__head">
          <span className="label" id="sp-money">
            Money and checkout
          </span>
        </div>
        <div className="ad-panel__body">
          <div className="ad-form">
            <div className="ad-cols">
              <Field
                label="Currency"
                htmlFor="currency"
                hint="The three-letter code the payment goes through in — GBP, USD, EUR."
                error={state.fieldErrors?.currency}
                required
              >
                <TextInput
                  id="currency"
                  name="currency"
                  defaultValue={page.currency}
                  placeholder="GBP"
                  maxLength={3}
                  required
                />
              </Field>

              <Field
                label="Symbol"
                htmlFor="currencySymbol"
                hint="What every price is printed with."
                error={state.fieldErrors?.currencySymbol}
                required
              >
                <TextInput
                  id="currencySymbol"
                  name="currencySymbol"
                  defaultValue={page.currencySymbol}
                  placeholder="£"
                  maxLength={4}
                  required
                />
              </Field>

              <Field
                label="Shipping"
                htmlFor="shippingCents"
                hint="Flat rate added when an order contains anything that has to be posted. In pounds and pence — type 4.50, not 450. Blank or 0 is free."
                error={state.fieldErrors?.shippingCents}
              >
                <TextInput
                  id="shippingCents"
                  name="shippingCents"
                  defaultValue={page.shipping}
                  placeholder="4.50"
                  maxLength={12}
                />
              </Field>
            </div>

            <Field
              label="Shipping note"
              htmlFor="shippingNote"
              hint="Printed next to the shipping line at checkout — how long posting takes, where you post to."
              error={state.fieldErrors?.shippingNote}
            >
              <TextArea
                id="shippingNote"
                name="shippingNote"
                rows={2}
                defaultValue={page.shippingNote}
                maxLength={600}
              />
            </Field>

            <Field
              label="Checkout note"
              htmlFor="checkoutNote"
              hint="Shown above the pay button. Anything someone should read before they pay."
              error={state.fieldErrors?.checkoutNote}
            >
              <TextArea
                id="checkoutNote"
                name="checkoutNote"
                rows={2}
                defaultValue={page.checkoutNote}
                maxLength={600}
              />
            </Field>

            <Field
              label="After they pay"
              htmlFor="successMessage"
              hint="The message on the order page once the payment goes through. Downloads appear under it."
              error={state.fieldErrors?.successMessage}
            >
              <TextArea
                id="successMessage"
                name="successMessage"
                rows={3}
                defaultValue={page.successMessage}
                maxLength={1000}
              />
            </Field>
          </div>
        </div>
      </section>

      <SaveBar saving={pending} saved={state.saved}>
        <a
          className="btn btn--sm btn--ghost"
          href="/store"
          target="_blank"
          rel="noopener noreferrer"
        >
          View the store
          <span className="vh"> (opens in a new tab)</span>
        </a>
      </SaveBar>
    </form>
  )
}
