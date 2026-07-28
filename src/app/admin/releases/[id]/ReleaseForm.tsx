'use client'

import { useActionState, useRef, type FormEvent } from 'react'
import { SaveBar } from '@/components/admin/SaveBar'
import {
  Checkbox,
  DangerButton,
  Field,
  FormError,
  ImageField,
  MarkdownField,
  RepeaterField,
  SelectField,
  StatusToggle,
  TextInput,
  type AdminImage,
} from '@/components/admin/fields'
import { deleteRelease, saveRelease, type ReleaseState } from '@/lib/actions/releases'
import { slugify } from '@/lib/format'

/* ==========================================================================
   The release editor form.

   A client component for two reasons and no others: useActionState, so an
   error lands next to the field that caused it, and the slug assist below.
   Everything it renders is a primitive from fields.tsx, and every value is
   posted as ordinary multipart form data.
   ========================================================================== */

export type ReleaseFormValues = {
  /** null creates. */
  id: number | null
  title: string
  slug: string
  artistId: string
  type: string
  releaseDate: string
  catalogNumber: string
  description: string
  credits: string
  status: 'draft' | 'published'
  featured: boolean
  cover: AdminImage | null
  tracks: Record<string, string>[]
  links: Record<string, string>[]
  features: Record<string, string>[]
}

const EMPTY: ReleaseState = {}

const TYPE_OPTIONS = [
  { value: 'album', label: 'Album' },
  { value: 'ep', label: 'EP' },
  { value: 'single', label: 'Single' },
]

const TRACK_COLUMNS = [
  { key: 'n', label: '#', placeholder: '1', width: '3.5rem' },
  { key: 'title', label: 'Track', placeholder: 'Track title' },
  { key: 'duration', label: 'Length', placeholder: '4:12', width: '6rem' },
]

const LINK_COLUMNS = [
  { key: 'platform', label: 'Platform', placeholder: 'spotify', width: '9rem' },
  { key: 'url', label: 'Link', placeholder: 'https://' },
]

const FEATURE_COLUMNS = [
  { key: 'artist', label: 'Artist', placeholder: 'Exact artist name' },
  { key: 'role', label: 'Role', placeholder: 'Vocals', width: '12rem' },
]

export function ReleaseForm({
  release,
  artistOptions,
  runtime,
  viewUrl,
}: {
  release: ReleaseFormValues
  artistOptions: { value: string; label: string }[]
  /** Worked out on the server from the saved tracklist. '' when there is none. */
  runtime: string
  /** Set only for a published release. */
  viewUrl: string | null
}) {
  const [state, action, pending] = useActionState(saveRelease, EMPTY)

  const isNew = release.id === null
  // Existing releases start "touched": a slug that changes under the client
  // breaks every link anyone has already shared.
  const slugTouched = useRef(!isNew)

  /**
   * The slug assist. One handler on the form rather than a controlled input,
   * because TextInput is deliberately uncontrolled — a change event bubbles to
   * here, and the slug field is found by name on the form itself.
   */
  function onFormChange(event: FormEvent<HTMLFormElement>) {
    const target = event.target
    if (!(target instanceof HTMLInputElement)) return

    if (target.name === 'slug') {
      slugTouched.current = true
      return
    }
    if (target.name !== 'title' || slugTouched.current) return

    const slug = event.currentTarget.elements.namedItem('slug')
    if (slug instanceof HTMLInputElement) slug.value = slugify(target.value)
  }

  return (
    <>
      <form className="ad-form" action={action} onChange={onFormChange} noValidate>
        <input type="hidden" name="id" value={release.id ?? ''} />

        <FormError message={state.error} />

        <section className="ad-panel" aria-labelledby="rel-basics">
          <div className="ad-panel__head">
            <span className="label" id="rel-basics">
              The release
            </span>
          </div>
          <div className="ad-panel__body">
            <div className="ad-form">
              <div className="ad-cols">
                <Field
                  label="Title"
                  htmlFor="title"
                  error={state.fieldErrors?.title}
                  required
                >
                  <TextInput
                    id="title"
                    name="title"
                    defaultValue={release.title}
                    maxLength={160}
                    required
                  />
                </Field>

                <Field
                  label="Web address"
                  htmlFor="slug"
                  hint={
                    isNew
                      ? 'The last part of the link to this release: /music?r=your-slug. It follows the title until you type here.'
                      : 'The last part of the link: /music?r=your-slug. Changing it breaks links people have already shared.'
                  }
                  error={state.fieldErrors?.slug}
                >
                  <TextInput
                    id="slug"
                    name="slug"
                    defaultValue={release.slug}
                    placeholder="midnight-tape"
                    maxLength={72}
                  />
                </Field>

                <Field
                  label="Artist"
                  htmlFor="artistId"
                  hint="The main artist. Guests go in the features list further down."
                  error={state.fieldErrors?.artistId}
                >
                  <SelectField
                    id="artistId"
                    name="artistId"
                    defaultValue={release.artistId}
                    options={[{ value: '', label: '— none —' }, ...artistOptions]}
                  />
                </Field>

                <Field label="Type" htmlFor="type" error={state.fieldErrors?.type}>
                  <SelectField
                    id="type"
                    name="type"
                    defaultValue={release.type}
                    options={TYPE_OPTIONS}
                  />
                </Field>

                <Field
                  label="Release date"
                  htmlFor="releaseDate"
                  hint="The date shown on the site, and the date the catalogue sorts by."
                  error={state.fieldErrors?.releaseDate}
                  required
                >
                  <TextInput
                    id="releaseDate"
                    name="releaseDate"
                    type="date"
                    defaultValue={release.releaseDate}
                    required
                  />
                </Field>

                <Field
                  label="Catalogue number"
                  htmlFor="catalogNumber"
                  hint="Shown on the site in the mono type."
                  error={state.fieldErrors?.catalogNumber}
                >
                  <TextInput
                    id="catalogNumber"
                    name="catalogNumber"
                    defaultValue={release.catalogNumber}
                    placeholder="LMTLS-001"
                    maxLength={40}
                  />
                </Field>
              </div>

              <ImageField
                name="cover"
                label="Sleeve"
                image={release.cover}
                aspect="square"
                hint="Square art. Anything from 800×800 up is plenty — it is resized on save."
              />
            </div>
          </div>
        </section>

        <section className="ad-panel" aria-labelledby="rel-words">
          <div className="ad-panel__head">
            <span className="label" id="rel-words">
              Words
            </span>
          </div>
          <div className="ad-panel__body">
            <div className="ad-form">
              <MarkdownField
                id="description"
                name="description"
                label="Description"
                defaultValue={release.description}
                hint="Shown when someone opens the release. A paragraph or two is enough."
                error={state.fieldErrors?.description}
              />

              <MarkdownField
                id="credits"
                name="credits"
                label="Credits"
                rows={8}
                defaultValue={release.credits}
                hint="Written, produced, mixed, mastered — whoever should be named."
                error={state.fieldErrors?.credits}
              />
            </div>
          </div>
        </section>

        <section className="ad-panel" aria-labelledby="rel-tracks">
          <div className="ad-panel__head">
            <span className="label" id="rel-tracks">
              Tracklist
            </span>
            {runtime ? (
              <span className="mono rel-runtime">
                Total runtime {runtime}
                <span className="rel-runtime__note"> · worked out again on save</span>
              </span>
            ) : null}
          </div>
          <div className="ad-panel__body">
            <RepeaterField
              name="tracklist"
              label="Tracks"
              hint="Durations like 4:12. The total is worked out for you. A row with no title is dropped."
              columns={TRACK_COLUMNS}
              rows={release.tracks}
              addLabel="Add a track"
            />
          </div>
        </section>

        <section className="ad-panel" aria-labelledby="rel-links">
          <div className="ad-panel__head">
            <span className="label" id="rel-links">
              Links and guests
            </span>
          </div>
          <div className="ad-panel__body">
            <div className="ad-form">
              <RepeaterField
                name="streamingLinks"
                label="Streaming links"
                hint="The platform must be one of spotify, apple, youtube, bandcamp, soundcloud — anything else is dropped when you save, so the site never shows a button that goes nowhere."
                columns={LINK_COLUMNS}
                rows={release.links}
                addLabel="Add a link"
              />

              <RepeaterField
                name="features"
                label="Features"
                hint="Guests on this release. The artist must already exist under Artists — type the name as it is spelled there. Names that match nobody are ignored on save."
                columns={FEATURE_COLUMNS}
                rows={release.features}
                addLabel="Add a guest"
              />
            </div>
          </div>
        </section>

        <section className="ad-panel" aria-labelledby="rel-visibility">
          <div className="ad-panel__head">
            <span className="label" id="rel-visibility">
              Visibility
            </span>
          </div>
          <div className="ad-panel__body">
            <div className="ad-form">
              <div className="ad-field">
                <span className="label ad-field__label">Status</span>
                <p className="ad-field__hint">
                  A draft is invisible on the site. Published puts it in the catalogue
                  straight away.
                </p>
                <StatusToggle name="status" value={release.status} />
              </div>

              <Checkbox
                id="featured"
                name="featured"
                defaultChecked={release.featured}
                label="Pin to the front of the home page's music row."
                hint="The row otherwise shows the most recent releases."
              />
            </div>
          </div>
        </section>

        <SaveBar saving={pending} saved={state.saved}>
          {viewUrl ? (
            <a
              className="btn btn--sm btn--ghost"
              href={viewUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              View on the site
              <span className="vh"> (opens in a new tab)</span>
            </a>
          ) : null}
        </SaveBar>
      </form>

      {/* Its own form, and it has to be: a submit button inside the editor form
          would post the editor form, and a nested <form> is invalid HTML that
          the browser silently drops. */}
      {release.id === null ? null : (
        <form className="rel-danger" action={deleteRelease.bind(null, release.id)}>
          <p className="rel-danger__text">
            Deleting takes this release off the site immediately and cannot be undone. The
            sleeve goes with it, unless another page uses the same picture.
          </p>
          <DangerButton confirmLabel="Delete it">Delete release</DangerButton>
        </form>
      )}
    </>
  )
}
