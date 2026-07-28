'use client'

import { useActionState } from 'react'
import { SaveBar } from '@/components/admin/SaveBar'
import { Field, FormError, TextArea, TextInput } from '@/components/admin/fields'
import { saveHome, type PageState } from '@/lib/actions/pages'

/* ==========================================================================
   The Home editor.

   Every user-visible string on / is a field here: the wordmark, the scroll cue,
   all four section headings, both button labels. The panels follow the scroll
   order of the page itself — hero, music, services, contact — so finding a line
   in here means remembering where it sits out there.

   A client component for one reason: useActionState, so an error lands next to
   the field that caused it.
   ========================================================================== */

export type HomeFormValues = {
  wordmarkLine1: string
  wordmarkLine2: string
  wordmarkTagline: string
  scrollCue: string
  musicHeading: string
  musicIntro: string
  musicCta: string
  servicesHeading: string
  servicesIntro: string
  contactHeading: string
  contactCta: string
  /** Kept as a string: it is a number box, and it is clamped on the server. */
  featuredCount: string
}

const EMPTY: PageState = {}

export function HomeForm({ home }: { home: HomeFormValues }) {
  const [state, action, pending] = useActionState(saveHome, EMPTY)

  return (
    <form className="ad-form" action={action} noValidate>
      <FormError message={state.error} />

      <section className="ad-panel" aria-labelledby="hm-hero">
        <div className="ad-panel__head">
          <span className="label" id="hm-hero">
            Hero
          </span>
          <span className="mono ap-count">Section 01</span>
        </div>
        <div className="ad-panel__body">
          <div className="ad-form">
            <div className="ad-field">
              <span className="label ad-field__label">Wordmark</span>
              <p className="ad-field__hint">
                The two lines of the animated wordmark. Short words work best — this is
                set very large.
              </p>
            </div>

            <div className="ad-cols">
              <Field
                label="Line one"
                htmlFor="wordmarkLine1"
                error={state.fieldErrors?.wordmarkLine1}
                required
              >
                <TextInput
                  id="wordmarkLine1"
                  name="wordmarkLine1"
                  defaultValue={home.wordmarkLine1}
                  placeholder="MELOPHILE"
                  maxLength={24}
                  required
                />
              </Field>

              <Field
                label="Line two"
                htmlFor="wordmarkLine2"
                error={state.fieldErrors?.wordmarkLine2}
              >
                <TextInput
                  id="wordmarkLine2"
                  name="wordmarkLine2"
                  defaultValue={home.wordmarkLine2}
                  placeholder="RECORDS"
                  maxLength={24}
                />
              </Field>
            </div>

            <Field
              label="Tagline"
              htmlFor="wordmarkTagline"
              hint="One line under the wordmark. Blank leaves the wordmark on its own."
              error={state.fieldErrors?.wordmarkTagline}
            >
              <TextArea
                id="wordmarkTagline"
                name="wordmarkTagline"
                rows={2}
                defaultValue={home.wordmarkTagline}
                maxLength={200}
              />
            </Field>

            <Field
              label="Scroll cue"
              htmlFor="scrollCue"
              hint="The word at the bottom of the first screen that says there is more."
              error={state.fieldErrors?.scrollCue}
            >
              <TextInput
                id="scrollCue"
                name="scrollCue"
                defaultValue={home.scrollCue}
                placeholder="Scroll"
                maxLength={24}
              />
            </Field>
          </div>
        </div>
      </section>

      <section className="ad-panel" aria-labelledby="hm-music">
        <div className="ad-panel__head">
          <span className="label" id="hm-music">
            Music
          </span>
          <span className="mono ap-count">Section 02</span>
        </div>
        <div className="ad-panel__body">
          <div className="ad-form">
            <div className="ad-cols">
              <Field
                label="Heading"
                htmlFor="musicHeading"
                error={state.fieldErrors?.musicHeading}
                required
              >
                <TextInput
                  id="musicHeading"
                  name="musicHeading"
                  defaultValue={home.musicHeading}
                  placeholder="Music"
                  maxLength={80}
                  required
                />
              </Field>

              <Field
                label="Link to the catalogue"
                htmlFor="musicCta"
                hint="The arrow link beside the heading, which goes to /music."
                error={state.fieldErrors?.musicCta}
                required
              >
                <TextInput
                  id="musicCta"
                  name="musicCta"
                  defaultValue={home.musicCta}
                  placeholder="See all music"
                  maxLength={40}
                  required
                />
              </Field>
            </div>

            <Field
              label="Intro"
              htmlFor="musicIntro"
              hint="One or two lines under the heading."
              error={state.fieldErrors?.musicIntro}
            >
              <TextArea
                id="musicIntro"
                name="musicIntro"
                rows={3}
                defaultValue={home.musicIntro}
                maxLength={600}
              />
            </Field>

            <Field
              label="Releases shown"
              htmlFor="featuredCount"
              hint="How many recent releases the home page shows. Between 4 and 8."
              error={state.fieldErrors?.featuredCount}
            >
              <TextInput
                id="featuredCount"
                name="featuredCount"
                type="number"
                defaultValue={home.featuredCount}
                min={4}
                max={8}
              />
            </Field>
          </div>
        </div>
      </section>

      <section className="ad-panel" aria-labelledby="hm-services">
        <div className="ad-panel__head">
          <span className="label" id="hm-services">
            Services
          </span>
          <span className="mono ap-count">Section 03</span>
        </div>
        <div className="ad-panel__body">
          <div className="ad-form">
            <Field
              label="Heading"
              htmlFor="servicesHeading"
              error={state.fieldErrors?.servicesHeading}
              required
            >
              <TextInput
                id="servicesHeading"
                name="servicesHeading"
                defaultValue={home.servicesHeading}
                placeholder="Our services"
                maxLength={80}
                required
              />
            </Field>

            <Field
              label="Intro"
              htmlFor="servicesIntro"
              hint="One or two lines under the heading. What is listed underneath is edited in Services."
              error={state.fieldErrors?.servicesIntro}
            >
              <TextArea
                id="servicesIntro"
                name="servicesIntro"
                rows={3}
                defaultValue={home.servicesIntro}
                maxLength={600}
              />
            </Field>
          </div>
        </div>
      </section>

      <section className="ad-panel" aria-labelledby="hm-contact">
        <div className="ad-panel__head">
          <span className="label" id="hm-contact">
            Contact
          </span>
          <span className="mono ap-count">Section 04</span>
        </div>
        <div className="ad-panel__body">
          <div className="ad-form">
            <div className="ad-cols">
              <Field
                label="Heading"
                htmlFor="contactHeading"
                error={state.fieldErrors?.contactHeading}
                required
              >
                <TextInput
                  id="contactHeading"
                  name="contactHeading"
                  defaultValue={home.contactHeading}
                  placeholder="Contact"
                  maxLength={80}
                  required
                />
              </Field>

              <Field
                label="Button label"
                htmlFor="contactCta"
                hint="The button that goes to the booking form on /contact."
                error={state.fieldErrors?.contactCta}
                required
              >
                <TextInput
                  id="contactCta"
                  name="contactCta"
                  defaultValue={home.contactCta}
                  placeholder="Book the studio"
                  maxLength={40}
                  required
                />
              </Field>
            </div>

            <p className="ap-note ap-note--quiet">
              The address, phone and hours in this section come from Contact, so they
              exist in one place only.
            </p>
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
