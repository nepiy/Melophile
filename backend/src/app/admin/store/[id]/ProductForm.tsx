'use client'

import { useActionState, useRef, useState, type FormEvent } from 'react'
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
import type { ProductKind } from '@/db'
import { deleteProduct, saveProduct, type ProductState } from '@/lib/actions/store'
import { slugify } from '@/lib/format'

/* ==========================================================================
   The store item editor.

   A client component for three reasons and no others: useActionState, so an
   error lands next to the field that caused it; the slug assist; and the kind
   switch, which decides whether this form shows sizes, a music format or a
   tempo. Everything it renders is a primitive from fields.tsx and every value
   is posted as ordinary multipart form data.

   ONLY ONE KIND'S FIELDS ARE RENDERED. The others are not hidden, they are not
   there — so they post nothing, and the action clears their columns anyway.
   The two halves agree: a beat cannot carry a leftover music format.

   PRICES ARE POUNDS IN THIS FORM AND PENCE IN THE DATABASE. The page converted
   pence to pounds on the way in; saveProduct converts pounds to pence on the
   way out with parseMoney. Nothing here does arithmetic on money at all.
   ========================================================================== */

export type ProductFormValues = {
  /** null creates. */
  id: number | null
  kind: ProductKind
  title: string
  subtitle: string
  slug: string
  description: string
  /** Pounds, as typed: '24.00'. */
  price: string
  /** Pounds, blank when the item is not reduced. */
  compareAt: string
  previewKind: string
  previewUrl: string
  /** Blank means unlimited. */
  stock: string
  featured: boolean
  status: 'draft' | 'published'
  image: AdminImage | null
  variants: Record<string, string>[]
  musicFormat: string
  releaseId: string
  licenseType: string
  bpm: string
  musicalKey: string
  digital: boolean
  downloadUrl: string
}

const EMPTY: ProductState = {}

const KIND_OPTIONS = [
  { value: 'merch', label: 'Merch' },
  { value: 'music', label: 'Music' },
  { value: 'beat', label: 'Beat' },
]

const KIND_LABEL: Record<ProductKind, string> = {
  merch: 'Merch',
  music: 'Music',
  beat: 'Beat',
}

const FORMAT_OPTIONS = [
  { value: 'album', label: 'Album' },
  { value: 'ep', label: 'EP' },
  { value: 'mixtape', label: 'Mixtape' },
  { value: 'single', label: 'Single' },
]

const LICENSE_OPTIONS = [
  { value: 'lease', label: 'Lease' },
  { value: 'exclusive', label: 'Exclusive' },
]

const PREVIEW_OPTIONS = [
  { value: 'none', label: 'No preview' },
  { value: 'audio', label: 'Audio' },
  { value: 'video', label: 'Video' },
]

const VARIANT_COLUMNS = [
  { key: 'label', label: 'Size', placeholder: 'Medium', width: '10rem' },
  { key: 'sku', label: 'Code', placeholder: 'TEE-M', width: '10rem' },
  { key: 'stock', label: 'Stock', placeholder: 'In stock' },
]

export function ProductForm({
  product,
  releaseOptions,
  currencySymbol,
  viewUrl,
}: {
  product: ProductFormValues
  /** Published releases, plus whichever one this item already points at. */
  releaseOptions: { value: string; label: string }[]
  /** From the store page copy, so the price fields are labelled in the right money. */
  currencySymbol: string
  /** Set only for a published item. */
  viewUrl: string | null
}) {
  const [state, action, pending] = useActionState(saveProduct, EMPTY)

  const isNew = product.id === null
  const [kind, setKind] = useState<ProductKind>(product.kind)
  const [license, setLicense] = useState(product.licenseType)
  const [preview, setPreview] = useState(product.previewKind)

  // Existing items start "touched": a slug that changes under the client breaks
  // every link anyone has already shared.
  const slugTouched = useRef(!isNew)

  /**
   * One handler on the form rather than controlled inputs, because the field
   * primitives are deliberately uncontrolled — a change event bubbles up to
   * here and the slug field is found by name on the form itself.
   */
  function onFormChange(event: FormEvent<HTMLFormElement>) {
    const target = event.target

    if (target instanceof HTMLSelectElement) {
      if (target.name === 'kind') setKind(target.value as ProductKind)
      if (target.name === 'licenseType') setLicense(target.value)
      if (target.name === 'previewKind') setPreview(target.value)
      return
    }

    if (!(target instanceof HTMLInputElement)) return

    if (target.name === 'slug') {
      slugTouched.current = true
      return
    }
    if (target.name !== 'title' || slugTouched.current) return

    const slug = event.currentTarget.elements.namedItem('slug')
    if (slug instanceof HTMLInputElement) slug.value = slugify(target.value)
  }

  const digital = kind === 'music' || kind === 'beat'

  return (
    <>
      <form className="ad-form" action={action} onChange={onFormChange} noValidate>
        <input type="hidden" name="id" value={product.id ?? ''} />

        <FormError message={state.error} />

        <section className="ad-panel" aria-labelledby="sto-basics">
          <div className="ad-panel__head">
            <span className="label" id="sto-basics">
              The item
            </span>
          </div>
          <div className="ad-panel__body">
            <div className="ad-form">
              <div className="ad-cols">
                {isNew ? (
                  <Field
                    label="Kind"
                    htmlFor="kind"
                    hint="What this is. It decides which fields the rest of this form shows, and it is fixed once the item is saved."
                    error={state.fieldErrors?.kind}
                    required
                  >
                    <SelectField
                      id="kind"
                      name="kind"
                      defaultValue={product.kind}
                      options={KIND_OPTIONS}
                    />
                  </Field>
                ) : (
                  <div className="ad-field">
                    <span className="label ad-field__label">Kind</span>
                    <p className="ad-field__hint">
                      Fixed after the first save. Changing it would strand the fields this
                      kind uses — the sizes on a shirt, the tempo on a beat. Make a new
                      item and delete this one instead.
                    </p>
                    <p className="mono sto-readonly">{KIND_LABEL[product.kind]}</p>
                  </div>
                )}

                <Field
                  label="Title"
                  htmlFor="title"
                  error={state.fieldErrors?.title}
                  required
                >
                  <TextInput
                    id="title"
                    name="title"
                    defaultValue={product.title}
                    maxLength={160}
                    required
                  />
                </Field>

                <Field
                  label="One-liner"
                  htmlFor="subtitle"
                  hint="The quiet line under the title — “Heavyweight cotton”, “Prod. by Kaya”."
                  error={state.fieldErrors?.subtitle}
                >
                  <TextInput
                    id="subtitle"
                    name="subtitle"
                    defaultValue={product.subtitle}
                    maxLength={160}
                  />
                </Field>

                <Field
                  label="Web address"
                  htmlFor="slug"
                  hint={
                    isNew
                      ? 'The last part of the link to this item. It follows the title until you type here.'
                      : 'The last part of the link. It is never changed for you — but changing it yourself breaks links people have already shared.'
                  }
                  error={state.fieldErrors?.slug}
                >
                  <TextInput
                    id="slug"
                    name="slug"
                    defaultValue={product.slug}
                    placeholder="tour-tee"
                    maxLength={72}
                  />
                </Field>

                <Field
                  label={`Price (${currencySymbol})`}
                  htmlFor="priceCents"
                  hint="In pounds and pence. Type 24.00, not 2400."
                  error={state.fieldErrors?.priceCents}
                  required
                >
                  <TextInput
                    id="priceCents"
                    name="priceCents"
                    defaultValue={product.price}
                    placeholder="24.00"
                    maxLength={12}
                    required
                  />
                </Field>

                <Field
                  label={`Was (${currencySymbol})`}
                  htmlFor="compareAtCents"
                  hint="Shows struck through. Leave blank if it is not reduced."
                  error={state.fieldErrors?.compareAtCents}
                >
                  <TextInput
                    id="compareAtCents"
                    name="compareAtCents"
                    defaultValue={product.compareAt}
                    placeholder="30.00"
                    maxLength={12}
                  />
                </Field>
              </div>

              <ImageField
                name="image"
                label="Picture"
                image={product.image}
                aspect="square"
                hint="Square art. Anything from 800×800 up is plenty — it is resized on save."
              />
            </div>
          </div>
        </section>

        <section className="ad-panel" aria-labelledby="sto-words">
          <div className="ad-panel__head">
            <span className="label" id="sto-words">
              Words
            </span>
          </div>
          <div className="ad-panel__body">
            <MarkdownField
              id="description"
              name="description"
              label="Description"
              defaultValue={product.description}
              hint="Shown when someone opens the item. What it is, what it is made of, what they get."
              error={state.fieldErrors?.description}
            />
          </div>
        </section>

        {kind === 'merch' ? (
          <section className="ad-panel" aria-labelledby="sto-merch">
            <div className="ad-panel__head">
              <span className="label" id="sto-merch">
                Sizes
              </span>
            </div>
            <div className="ad-panel__body">
              <RepeaterField
                name="variants"
                label="Sizes"
                hint={
                  'Sizes. The stock column is free text — "In stock", "2 left", "Sold out" — because that is what a customer reads.'
                }
                columns={VARIANT_COLUMNS}
                rows={product.variants}
                addLabel="Add a size"
              />
            </div>
          </section>
        ) : null}

        {kind === 'music' ? (
          <section className="ad-panel" aria-labelledby="sto-music">
            <div className="ad-panel__head">
              <span className="label" id="sto-music">
                Music
              </span>
            </div>
            <div className="ad-panel__body">
              <div className="ad-form">
                <div className="ad-cols">
                  <Field
                    label="Format"
                    htmlFor="musicFormat"
                    error={state.fieldErrors?.musicFormat}
                  >
                    <SelectField
                      id="musicFormat"
                      name="musicFormat"
                      defaultValue={product.musicFormat}
                      options={FORMAT_OPTIONS}
                    />
                  </Field>

                  <Field
                    label="Part of the catalogue"
                    htmlFor="releaseId"
                    hint="Links this item to a release under Releases, so the two pages point at each other. Only published releases are listed."
                    error={state.fieldErrors?.releaseId}
                  >
                    <SelectField
                      id="releaseId"
                      name="releaseId"
                      defaultValue={product.releaseId}
                      options={[{ value: '', label: '— none —' }, ...releaseOptions]}
                    />
                  </Field>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {kind === 'beat' ? (
          <section className="ad-panel" aria-labelledby="sto-beat">
            <div className="ad-panel__head">
              <span className="label" id="sto-beat">
                Beat
              </span>
            </div>
            <div className="ad-panel__body">
              <div className="ad-form">
                <div className="ad-cols">
                  <Field
                    label="Licence"
                    htmlFor="licenseType"
                    hint="A lease stays on sale. An exclusive is sold once."
                    error={state.fieldErrors?.licenseType}
                  >
                    <SelectField
                      id="licenseType"
                      name="licenseType"
                      defaultValue={product.licenseType}
                      options={LICENSE_OPTIONS}
                    />
                  </Field>

                  <Field label="Tempo" htmlFor="bpm" error={state.fieldErrors?.bpm}>
                    <TextInput
                      id="bpm"
                      name="bpm"
                      type="number"
                      min={0}
                      max={400}
                      defaultValue={product.bpm}
                      placeholder="140"
                    />
                  </Field>

                  <Field
                    label="Key"
                    htmlFor="musicalKey"
                    error={state.fieldErrors?.musicalKey}
                  >
                    <TextInput
                      id="musicalKey"
                      name="musicalKey"
                      defaultValue={product.musicalKey}
                      placeholder="F minor"
                      maxLength={20}
                    />
                  </Field>
                </div>

                {license === 'exclusive' ? (
                  <p className="sto-note">
                    An exclusive is sold once. Set the stock below to 1 so it comes off
                    sale the moment it goes.
                  </p>
                ) : null}
              </div>
            </div>
          </section>
        ) : null}

        {digital ? (
          <section className="ad-panel" aria-labelledby="sto-delivery">
            <div className="ad-panel__head">
              <span className="label" id="sto-delivery">
                Delivery
              </span>
            </div>
            <div className="ad-panel__body">
              <div className="ad-form">
                <Checkbox
                  id="digital"
                  name="digital"
                  defaultChecked={product.digital}
                  label="This is a download."
                  hint="A download needs no address at checkout and is delivered by link as soon as the order is paid."
                />

                <Field
                  label="Download link"
                  htmlFor="downloadUrl"
                  hint="Only ever shown to someone who has paid."
                  error={state.fieldErrors?.downloadUrl}
                >
                  <TextInput
                    id="downloadUrl"
                    name="downloadUrl"
                    defaultValue={product.downloadUrl}
                    placeholder="https://"
                    maxLength={500}
                  />
                </Field>
              </div>
            </div>
          </section>
        ) : null}

        <section className="ad-panel" aria-labelledby="sto-preview">
          <div className="ad-panel__head">
            <span className="label" id="sto-preview">
              Preview
            </span>
          </div>
          <div className="ad-panel__body">
            <div className="ad-form">
              <div className="ad-cols">
                <Field
                  label="Preview"
                  htmlFor="previewKind"
                  hint="A clip people can play before they buy."
                  error={state.fieldErrors?.previewKind}
                >
                  <SelectField
                    id="previewKind"
                    name="previewKind"
                    defaultValue={product.previewKind}
                    options={PREVIEW_OPTIONS}
                  />
                </Field>

                <Field
                  label="Preview link"
                  htmlFor="previewUrl"
                  hint={
                    preview === 'none'
                      ? 'Ignored while the preview is set to no preview.'
                      : 'A full https:// address. An empty link turns the preview off.'
                  }
                  error={state.fieldErrors?.previewUrl}
                >
                  <TextInput
                    id="previewUrl"
                    name="previewUrl"
                    defaultValue={product.previewUrl}
                    placeholder="https://"
                    maxLength={500}
                  />
                </Field>
              </div>
            </div>
          </div>
        </section>

        <section className="ad-panel" aria-labelledby="sto-visibility">
          <div className="ad-panel__head">
            <span className="label" id="sto-visibility">
              Stock and visibility
            </span>
          </div>
          <div className="ad-panel__body">
            <div className="ad-form">
              <Field
                label="Stock"
                htmlFor="stock"
                hint="Leave blank for unlimited. 0 marks it sold out."
                error={state.fieldErrors?.stock}
              >
                <TextInput
                  id="stock"
                  name="stock"
                  type="number"
                  min={0}
                  defaultValue={product.stock}
                  placeholder="Unlimited"
                />
              </Field>

              <div className="ad-field">
                <span className="label ad-field__label">Status</span>
                <p className="ad-field__hint">
                  A draft is invisible in the store. Published puts it on sale straight
                  away.
                </p>
                <StatusToggle name="status" value={product.status} />
              </div>

              <Checkbox
                id="featured"
                name="featured"
                defaultChecked={product.featured}
                label="Pin to the front of the store."
                hint="The store otherwise shows the newest items first."
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
      {product.id === null ? null : (
        <form className="sto-danger" action={deleteProduct.bind(null, product.id)}>
          <p className="sto-danger__text">
            Deleting takes this item out of the store immediately and cannot be undone.
            Orders already placed keep their own copy of the title and the price, so
            nothing anyone has bought changes. The picture goes with it, unless another
            page uses the same one.
          </p>
          <DangerButton confirmLabel="Delete it">Delete item</DangerButton>
        </form>
      )}
    </>
  )
}
