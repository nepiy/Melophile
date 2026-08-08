'use client'

import { Fragment, useActionState } from 'react'
import { SaveBar } from '@/components/admin/SaveBar'
import {
  Checkbox,
  Field,
  FormError,
  ImageField,
  MarkdownField,
  TextInput,
  type AdminImage,
} from '@/components/admin/fields'
import {
  addAboutPhotoSlot,
  moveAboutPhotoSlot,
  removeAboutPhotoSlot,
  saveAbout,
  type PageState,
} from '@/lib/actions/pages'

/* ==========================================================================
   The About editor.

   Two jobs on one screen. The first is the story itself — one heading and one
   long field, which is the whole of the public page.

   The second is the photo slots, and they are the reason this screen exists in
   this shape. Today every slot is empty, and the public page drops an empty
   slot out of the DOM entirely: no frame, no gap, nothing. That is correct out
   there and useless in here, so the same empty slots are drawn as labelled drop
   zones with their own order and remove controls. The client can see exactly
   how many places a photo can go before they have a single photo to put in one.

   A client component for one reason: useActionState, so an error lands next to
   the field that caused it.
   ========================================================================== */

export type AboutFormValues = {
  heading: string
  body: string
  /** Kept as a string: the box is a number input and blank is a real value. */
  foundedYear: string
  showCatalogCount: boolean
}

export type AboutSlot = {
  id: number
  caption: string
  image: AdminImage | null
}

const EMPTY: PageState = {}

export function AboutForm({
  about,
  slots,
}: {
  about: AboutFormValues
  slots: AboutSlot[]
}) {
  const [state, action, pending] = useActionState(saveAbout, EMPTY)

  const filled = slots.filter((slot) => slot.image).length

  return (
    <>
      <form className="ad-form" action={action} noValidate>
        <FormError message={state.error} />

        <section className="ad-panel" aria-labelledby="about-story">
          <div className="ad-panel__head">
            <span className="label" id="about-story">
              The story
            </span>
          </div>
          <div className="ad-panel__body">
            <div className="ad-form">
              <Field
                label="Heading"
                htmlFor="heading"
                hint="The title at the top of the page, and the browser tab."
                error={state.fieldErrors?.heading}
                required
              >
                <TextInput
                  id="heading"
                  name="heading"
                  defaultValue={about.heading}
                  placeholder="Our story"
                  maxLength={120}
                  required
                />
              </Field>

              <MarkdownField
                id="body"
                name="body"
                label="The story"
                rows={24}
                defaultValue={about.body}
                hint="The whole page. Write it in as many paragraphs as it takes — this is the one place on the site with room for them."
                error={state.fieldErrors?.body}
              />

              <div className="ad-cols">
                <Field
                  label="Founded"
                  htmlFor="foundedYear"
                  hint="Prints as EST. 2016 beside the heading. Leave it blank to hide that line."
                  error={state.fieldErrors?.foundedYear}
                >
                  <TextInput
                    id="foundedYear"
                    name="foundedYear"
                    type="number"
                    defaultValue={about.foundedYear}
                    placeholder="2016"
                    min={1900}
                    max={2200}
                  />
                </Field>

                <div className="ad-field ap-check">
                  <Checkbox
                    id="showCatalogCount"
                    name="showCatalogCount"
                    defaultChecked={about.showCatalogCount}
                    label="Show the release count next to the founding year."
                    hint="Counts published releases, and stays hidden until there is at least one."
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="ad-panel" aria-labelledby="about-slots">
          <div className="ad-panel__head">
            <span className="label" id="about-slots">
              Photo slots
            </span>
            <span className="mono ap-count">
              {slots.length} {slots.length === 1 ? 'slot' : 'slots'} · {filled} filled
            </span>
          </div>

          <div className="ad-panel__body">
            <p className="ap-note">
              Empty slots show nothing on the public page. Fill one and the story page
              reflows to make room.
            </p>
            <p className="ap-note ap-note--quiet">
              Adding, moving and removing a slot happen straight away and reload this
              panel. Save your words first.
            </p>

            {slots.length === 0 ? (
              <div className="empty">
                <p className="empty__title">No photo slots</p>
                <p className="empty__text">
                  Add one and it appears here as an empty frame, ready for a picture.
                </p>
              </div>
            ) : (
              <ul className="ap-slots">
                {slots.map((slot, index) => (
                  <li className="ap-slot" key={slot.id}>
                    <div className="ap-slot__head">
                      <span className="mono ap-slot__n">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <span
                        className="label ap-slot__state"
                        data-filled={slot.image ? 'true' : undefined}
                      >
                        {slot.image ? 'Filled' : 'Empty'}
                      </span>

                      {/* Each button drives one of the small forms below. The
                          `form` attribute is what keeps them out of this form
                          without nesting one inside it. */}
                      <span className="ap-slot__tools">
                        <button
                          type="submit"
                          form={`slot-${slot.id}-up`}
                          className="ad-iconbtn"
                          disabled={index === 0}
                          aria-label={`Move slot ${index + 1} up`}
                        >
                          <span aria-hidden="true">↑</span>
                        </button>
                        <button
                          type="submit"
                          form={`slot-${slot.id}-down`}
                          className="ad-iconbtn"
                          disabled={index === slots.length - 1}
                          aria-label={`Move slot ${index + 1} down`}
                        >
                          <span aria-hidden="true">↓</span>
                        </button>
                        <button
                          type="submit"
                          form={`slot-${slot.id}-remove`}
                          className="btn btn--sm ad-danger"
                        >
                          {slot.image ? 'Remove slot and photo' : 'Remove slot'}
                          <span className="vh"> {index + 1}</span>
                        </button>
                      </span>
                    </div>

                    <div className="ap-slot__body">
                      <ImageField
                        name={`slot-${slot.id}`}
                        label={`Photo ${index + 1}`}
                        image={slot.image}
                        aspect="auto"
                        hint="Any shape. The column keeps the proportions of what you upload rather than cropping it."
                      />

                      <Field
                        label="Caption"
                        htmlFor={`caption-${slot.id}`}
                        hint="Optional. Printed under the photo in the mono, numbered for you."
                      >
                        <TextInput
                          id={`caption-${slot.id}`}
                          name={`caption-${slot.id}`}
                          defaultValue={slot.caption}
                          placeholder="Live room, 2019"
                          maxLength={200}
                        />
                      </Field>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <button type="submit" form="slot-add" className="btn btn--sm ap-add">
              Add another slot
            </button>
          </div>
        </section>

        <SaveBar saving={pending} saved={state.saved}>
          <a
            className="btn btn--sm btn--ghost"
            href="/about"
            target="_blank"
            rel="noopener noreferrer"
          >
            View on the site
            <span className="vh"> (opens in a new tab)</span>
          </a>
        </SaveBar>
      </form>

      {/* The slot actions, one empty form each. They have to live outside the
          editor form — a nested <form> is invalid HTML and the browser drops
          the inner one — and the buttons above reach them by id, so nothing
          here depends on JS having run. */}
      <div className="ap-forms" hidden>
        {slots.map((slot) => (
          <Fragment key={slot.id}>
            <form
              id={`slot-${slot.id}-up`}
              action={moveAboutPhotoSlot.bind(null, slot.id, 'up')}
            />
            <form
              id={`slot-${slot.id}-down`}
              action={moveAboutPhotoSlot.bind(null, slot.id, 'down')}
            />
            <form
              id={`slot-${slot.id}-remove`}
              action={removeAboutPhotoSlot.bind(null, slot.id)}
            />
          </Fragment>
        ))}
        <form id="slot-add" action={addAboutPhotoSlot} />
      </div>
    </>
  )
}
