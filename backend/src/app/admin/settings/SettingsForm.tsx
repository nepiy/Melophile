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
import { saveSettings, type PageState } from '@/lib/actions/pages'

/* ==========================================================================
   The Settings editor — the words that appear on every page.

   Three panels: the wordmark and the nav, the footer, and what search engines
   are told. Nothing here is decoration; each field is read by the chrome on
   every route, which is why the nav labels are the one set that refuses blank —
   an empty label is a menu item nobody can see or click.

   A client component for one reason: useActionState, so an error lands next to
   the field that caused it.
   ========================================================================== */

export type SettingsFormValues = {
  logoText: string
  navMusic: string
  navArtists: string
  navAbout: string
  navContact: string
  footerText: string
  socialLinks: Record<string, string>[]
  metaTitle: string
  metaDescription: string
}

const EMPTY: PageState = {}

const SOCIAL_COLUMNS = [
  { key: 'platform', label: 'Platform', placeholder: 'Instagram', width: '12rem' },
  { key: 'url', label: 'Link', placeholder: 'https://' },
]

export function SettingsForm({ settings }: { settings: SettingsFormValues }) {
  const [state, action, pending] = useActionState(saveSettings, EMPTY)

  return (
    <form className="ad-form" action={action} noValidate>
      <FormError message={state.error} />

      <section className="ad-panel" aria-labelledby="st-brand">
        <div className="ad-panel__head">
          <span className="label" id="st-brand">
            Wordmark and nav
          </span>
        </div>
        <div className="ad-panel__body">
          <div className="ad-form">
            <Field
              label="Wordmark"
              htmlFor="logoText"
              hint="Top left on every page, and in the footer. It also drives the code in the hero readout — MELOPHILE becomes LMTLS."
              error={state.fieldErrors?.logoText}
              required
            >
              <TextInput
                id="logoText"
                name="logoText"
                defaultValue={settings.logoText}
                placeholder="MELOPHILE"
                maxLength={40}
                required
              />
            </Field>

            <div className="ad-field">
              <span className="label ad-field__label">Nav labels</span>
              <p className="ad-field__hint">
                The four links in the top bar, in the order they appear. Each one needs a
                word.
              </p>
            </div>

            <div className="ad-cols">
              <Field
                label="Music"
                htmlFor="navMusic"
                error={state.fieldErrors?.navMusic}
                required
              >
                <TextInput
                  id="navMusic"
                  name="navMusic"
                  defaultValue={settings.navMusic}
                  placeholder="Music"
                  maxLength={40}
                  required
                />
              </Field>

              <Field
                label="Artists"
                htmlFor="navArtists"
                error={state.fieldErrors?.navArtists}
                required
              >
                <TextInput
                  id="navArtists"
                  name="navArtists"
                  defaultValue={settings.navArtists}
                  placeholder="Artists"
                  maxLength={40}
                  required
                />
              </Field>

              <Field
                label="About"
                htmlFor="navAbout"
                error={state.fieldErrors?.navAbout}
                required
              >
                <TextInput
                  id="navAbout"
                  name="navAbout"
                  defaultValue={settings.navAbout}
                  placeholder="About us"
                  maxLength={40}
                  required
                />
              </Field>

              <Field
                label="Contact"
                htmlFor="navContact"
                error={state.fieldErrors?.navContact}
                required
              >
                <TextInput
                  id="navContact"
                  name="navContact"
                  defaultValue={settings.navContact}
                  placeholder="Contact"
                  maxLength={40}
                  required
                />
              </Field>
            </div>
          </div>
        </div>
      </section>

      <section className="ad-panel" aria-labelledby="st-footer">
        <div className="ad-panel__head">
          <span className="label" id="st-footer">
            Footer
          </span>
        </div>
        <div className="ad-panel__body">
          <div className="ad-form">
            <Field
              label="Footer line"
              htmlFor="footerText"
              hint="Under the wordmark at the foot of every page. Blank leaves the wordmark on its own."
              error={state.fieldErrors?.footerText}
            >
              <TextArea
                id="footerText"
                name="footerText"
                rows={3}
                defaultValue={settings.footerText}
                maxLength={600}
              />
            </Field>

            <RepeaterField
              name="socialLinks"
              label="Elsewhere"
              hint="Shown in the footer. The platform is the link text, and an address the browser cannot open is dropped when you save."
              columns={SOCIAL_COLUMNS}
              rows={settings.socialLinks}
              addLabel="Add a link"
            />
          </div>
        </div>
      </section>

      <section className="ad-panel" aria-labelledby="st-meta">
        <div className="ad-panel__head">
          <span className="label" id="st-meta">
            Search
          </span>
        </div>
        <div className="ad-panel__body">
          <div className="ad-form">
            <Field
              label="Site title"
              htmlFor="metaTitle"
              hint="The name of the site itself. Each page adds its own title in front of it."
              error={state.fieldErrors?.metaTitle}
              required
            >
              <TextInput
                id="metaTitle"
                name="metaTitle"
                defaultValue={settings.metaTitle}
                placeholder="Melophile Records"
                maxLength={120}
                required
              />
            </Field>

            <Field
              label="Site description"
              htmlFor="metaDescription"
              hint="Shown in search results."
              error={state.fieldErrors?.metaDescription}
            >
              <TextArea
                id="metaDescription"
                name="metaDescription"
                rows={3}
                defaultValue={settings.metaDescription}
                maxLength={300}
              />
            </Field>
          </div>
        </div>
      </section>

      <SaveBar saving={pending} saved={state.saved}>
        <a
          className="btn btn--sm btn--ghost"
          href="/"
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
