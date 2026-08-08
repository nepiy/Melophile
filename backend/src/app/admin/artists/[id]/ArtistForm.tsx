'use client'

import Link from 'next/link'
import { useActionState, useRef, type FormEvent } from 'react'
import { SaveBar } from '@/components/admin/SaveBar'
import {
  DangerButton,
  Field,
  FormError,
  ImageField,
  MarkdownField,
  RepeaterField,
  StatusToggle,
  TextInput,
  type AdminImage,
} from '@/components/admin/fields'
import { deleteArtist, saveArtist, type ArtistState } from '@/lib/actions/roster'
import { formatYear, pluralise, slugify } from '@/lib/format'

/* ==========================================================================
   The artist editor form.

   A client component for two reasons and no others: useActionState, so an
   error lands next to the field that caused it, and the slug assist below.
   Everything it renders is a primitive from fields.tsx, and every value is
   posted as ordinary multipart form data.

   "Appears on" is in here but is not a field. It is read out of the catalogue
   on every load and never written, so the one way to change it is to edit a
   release — which the panel says in words rather than leaving to be guessed.
   ========================================================================== */

export type ArtistFormValues = {
  /** null creates. */
  id: number | null
  name: string
  slug: string
  role: string
  shortDescription: string
  status: 'draft' | 'published'
  photo: AdminImage | null
  links: Record<string, string>[]
}

export type ArtistAppearance = {
  id: number
  title: string
  catalogNumber: string
  releaseDate: string
}

const EMPTY: ArtistState = {}

const LINK_COLUMNS = [
  { key: 'label', label: 'Label', placeholder: 'Instagram', width: '12rem' },
  { key: 'url', label: 'Link', placeholder: 'https://' },
]

export function ArtistForm({
  artist,
  appearsOn,
  viewUrl,
}: {
  artist: ArtistFormValues
  /** Derived from the catalogue on the server. Read-only, never posted. */
  appearsOn: ArtistAppearance[]
  /** Set only for a published artist. */
  viewUrl: string | null
}) {
  const [state, action, pending] = useActionState(saveArtist, EMPTY)

  const isNew = artist.id === null
  // Existing artists start "touched": a slug that changes under the client
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
    if (target.name !== 'name' || slugTouched.current) return

    const slug = event.currentTarget.elements.namedItem('slug')
    if (slug instanceof HTMLInputElement) slug.value = slugify(target.value)
  }

  return (
    <>
      <form className="ad-form" action={action} onChange={onFormChange} noValidate>
        <input type="hidden" name="id" value={artist.id ?? ''} />

        <FormError message={state.error} />

        <section className="ad-panel" aria-labelledby="art-basics">
          <div className="ad-panel__head">
            <span className="label" id="art-basics">
              The artist
            </span>
          </div>
          <div className="ad-panel__body">
            <div className="ad-form">
              <div className="ad-cols">
                <Field
                  label="Name"
                  htmlFor="name"
                  error={state.fieldErrors?.name}
                  required
                >
                  <TextInput
                    id="name"
                    name="name"
                    defaultValue={artist.name}
                    maxLength={120}
                    required
                  />
                </Field>

                <Field
                  label="Web address"
                  htmlFor="slug"
                  hint={
                    isNew
                      ? 'The name in web form, used in links to this artist. It follows the name until you type here, and then it stays as you left it.'
                      : 'The name in web form, used in links to this artist. It never changes on its own — edit it here and links people have already shared will break.'
                  }
                  error={state.fieldErrors?.slug}
                >
                  <TextInput
                    id="slug"
                    name="slug"
                    defaultValue={artist.slug}
                    placeholder="nadia-oyelowo"
                    maxLength={72}
                  />
                </Field>

                <Field
                  label="Role or genre"
                  htmlFor="role"
                  hint="One line, shown under the name when someone opens them."
                  error={state.fieldErrors?.role}
                >
                  <TextInput
                    id="role"
                    name="role"
                    defaultValue={artist.role}
                    placeholder="Bass, composer — jazz and broken beat"
                    maxLength={120}
                  />
                </Field>
              </div>

              <ImageField
                name="photo"
                label="Portrait"
                image={artist.photo}
                aspect="portrait"
                hint="The grid is nothing but photographs, so this is the whole of the first impression. Upright works best — it is cropped to 4:5 and resized on save."
              />
            </div>
          </div>
        </section>

        <section className="ad-panel" aria-labelledby="art-words">
          <div className="ad-panel__head">
            <span className="label" id="art-words">
              Words
            </span>
          </div>
          <div className="ad-panel__body">
            <div className="ad-form">
              <MarkdownField
                id="shortDescription"
                name="shortDescription"
                label="Short description"
                defaultValue={artist.shortDescription}
                hint="This is what appears when someone clicks their photo — the grid shows photographs and nothing else, so nothing you write here is visible until then. A paragraph is plenty."
                error={state.fieldErrors?.shortDescription}
              />

              <RepeaterField
                name="links"
                label="Links"
                hint="Where else to find them. Both columns are needed, and the address has to be a full http:// or https:// one — a row that is not is dropped when you save, so the site never shows a link that goes nowhere."
                columns={LINK_COLUMNS}
                rows={artist.links}
                addLabel="Add a link"
              />
            </div>
          </div>
        </section>

        <section className="ad-panel" aria-labelledby="art-appears">
          <div className="ad-panel__head">
            <span className="label" id="art-appears">
              Appears on
            </span>
            <span className="mono ros-count">
              {appearsOn.length} {pluralise(appearsOn.length, 'release')}
            </span>
          </div>
          <div className="ad-panel__body">
            <p className="ros-appears__note">
              Read from the catalogue, not stored here. To change it, open the release and
              set this artist as the main artist or add them as a guest.
            </p>

            {appearsOn.length === 0 ? (
              <p className="ros-appears__blank">
                {isNew
                  ? 'Nothing yet — save this artist and they can be picked on a release.'
                  : 'Nothing yet. They appear here as soon as a release names them.'}
              </p>
            ) : (
              <ul className="ros-appears">
                {appearsOn.map((release) => (
                  <li className="ros-appears__item" key={release.id}>
                    <span className="mono ros-appears__cat">
                      {release.catalogNumber || '—'}
                    </span>
                    <Link
                      href={`/admin/releases/${release.id}`}
                      className="ros-appears__title"
                    >
                      {release.title}
                    </Link>
                    <span className="mono ros-appears__year">
                      {formatYear(release.releaseDate)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="ad-panel" aria-labelledby="art-visibility">
          <div className="ad-panel__head">
            <span className="label" id="art-visibility">
              Visibility
            </span>
          </div>
          <div className="ad-panel__body">
            <div className="ad-field">
              <span className="label ad-field__label">Status</span>
              <p className="ad-field__hint">
                A draft is invisible on the site. Published puts them on the grid straight
                away.
              </p>
              <StatusToggle name="status" value={artist.status} />
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
      {artist.id === null ? null : (
        <form className="ros-danger" action={deleteArtist.bind(null, artist.id)}>
          <p className="ros-danger__text">
            Deleting takes this artist off the grid immediately and cannot be undone.
            Their releases stay in the catalogue, with the artist left blank. The portrait
            goes with them, unless another page uses the same picture.
          </p>
          <DangerButton confirmLabel="Delete them">Delete artist</DangerButton>
        </form>
      )}
    </>
  )
}
