'use server'

import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import {
  BEAT_LICENSES,
  db,
  MUSIC_FORMATS,
  PREVIEW_KINDS,
  products,
  releases,
  storePage,
  type BeatLicense,
  type MusicFormat,
  type PreviewKind,
  type ProductKind,
  type PublishStatus,
  type Variant,
} from '@/db'
import { applyImageField, cleanupImage, parseRepeaterRequiring } from '@/lib/admin-images'
import {
  reorderProduct,
  slugTakenByOtherProduct,
  topOrderForKind,
} from '@/lib/admin-store-queries'
import { parseMoney, slugify } from '@/lib/format'
import { safeUrl } from '@/lib/markdown'
import { revalidateContent } from '@/lib/revalidate'
import { requireAdmin } from '@/lib/session'
import { STORE_TAGS } from '@/lib/store-data'
import { productSchema, toFieldErrors, type FieldErrors } from '@/lib/validation'

/* ==========================================================================
   The store — create, update, delete, publish, reorder, and the page copy.

   Same contract as src/lib/actions/releases.ts. Every action starts with
   requireAdmin(). Every one that writes ends with revalidateContent(), which
   is what puts a save on the public site without a redeploy. Nothing here
   throws at the client: a taken slug, a price that is not a price, a missing
   row — all of it comes back as state the form renders inline.

   TWO THINGS ARE PARTICULAR TO THIS FILE.

   Money. Every price column is integer minor units — pence. The editor shows
   and accepts pounds, so pounds are converted at exactly one point on the way
   in (parseMoney) and one point on the way out (formatMoney, in the page).
   Nothing in between ever holds a decimal, which is what keeps a save-then-
   reload from multiplying a price by a hundred.

   Kind. One table holds three different things, so the columns that belong to
   the other two are cleared on every save rather than left as they were. A
   beat that used to be a music item must not keep a musicFormat: the row would
   read as valid and the storefront would render a badge for a field this kind
   does not have.
   ========================================================================== */

export type ProductState = {
  error?: string
  fieldErrors?: FieldErrors
  saved?: boolean
}

export type StoreSettingsState = {
  error?: string
  fieldErrors?: FieldErrors
  saved?: boolean
}

const VARIANT_KEYS = ['label', 'sku', 'stock']

const PREVIEW_VALUES: readonly string[] = PREVIEW_KINDS
const FORMAT_VALUES: readonly string[] = MUSIC_FORMATS
const LICENSE_VALUES: readonly string[] = BEAT_LICENSES

/* --------------------------------- money --------------------------------- */

const PRICE_HELP = 'Enter a price like 24.00.'

type MoneyOk = { ok: true; cents: number }
type MoneyBad = { ok: false; error: string }

/**
 * Pounds in, pence out. parseMoney('12.50') is 1250 and parseMoney('nonsense')
 * is null — the null is the whole point of this wrapper, because a price that
 * silently becomes 0 is worse than a price the client is asked to retype.
 */
function readMoney(raw: string): MoneyOk | MoneyBad {
  const cents = parseMoney(raw)
  if (cents === null) return { ok: false, error: PRICE_HELP }
  if (cents < 0) return { ok: false, error: `A price cannot be negative. ${PRICE_HELP}` }
  return { ok: true, cents }
}

/** Blank is a value here: no "was" price, no flat shipping. */
function readOptionalMoney(raw: string): { ok: true; cents: number | null } | MoneyBad {
  if (raw.trim() === '') return { ok: true, cents: null }
  return readMoney(raw)
}

/* -------------------------------- counters ------------------------------- */

type CountOk = { ok: true; value: number | null }

function readWholeNumber(
  raw: string,
  message: string,
  max: number,
): CountOk | { ok: false; error: string } {
  const text = raw.trim()
  if (text === '') return { ok: true, value: null }

  const value = Number(text)
  if (!Number.isInteger(value) || value < 0 || value > max) {
    return { ok: false, error: message }
  }
  return { ok: true, value }
}

/* ------------------------------- repeaters ------------------------------- */

/**
 * Merch sizes. A row with no label is not a variant, so it goes; the stock
 * cell is free text on purpose — "In stock", "2 left", "made to order" — and
 * is rendered to the customer exactly as it is typed.
 */
function readVariants(formData: FormData): Variant[] {
  return parseRepeaterRequiring(formData, 'variants', VARIANT_KEYS, ['label']).map(
    (row) => ({
      label: row.label ?? '',
      sku: row.sku ?? '',
      stock: row.stock ?? '',
    }),
  )
}

/* --------------------------------- images -------------------------------- */

/**
 * cleanupImage() checks the release, artist and About tables before it removes
 * a file — it predates the store and knows nothing about products. Deleting a
 * picture two products share would blank the other one, because products.imageId
 * is ON DELETE SET NULL. So the product check happens here first, and
 * cleanupImage() only ever sees an image that nothing in the store uses either.
 *
 * Call it AFTER the row has been written, never before: an image removed first
 * leaves the row pointing at a file that is already gone.
 */
async function releaseProductImage(imageId: number | null): Promise<void> {
  if (imageId === null) return

  const stillUsed = await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.imageId, imageId))
    .all()

  if (stillUsed.length > 0) return
  await cleanupImage(imageId)
}

/* --------------------------------- save ---------------------------------- */

/**
 * Creates when the hidden `id` is empty, updates when it is not.
 *
 * The kind is read from the database on an update and from the form only on a
 * create. The editor renders it read-only for exactly this reason, and the
 * server does not take the client's word for it either — a changed kind would
 * orphan the columns the old kind was using.
 */
export async function saveProduct(
  _previous: ProductState,
  formData: FormData,
): Promise<ProductState> {
  await requireAdmin()

  const rawId = String(formData.get('id') ?? '').trim()
  const id = rawId === '' ? null : Number(rawId)
  if (id !== null && !Number.isInteger(id)) {
    return {
      error: 'That item could not be identified. Go back to the store and open it again.',
    }
  }

  let current: { kind: ProductKind; imageId: number | null } | null = null
  if (id !== null) {
    const row = await db
      .select({ kind: products.kind, imageId: products.imageId })
      .from(products)
      .where(eq(products.id, id))
      .get()

    if (!row) {
      return {
        error: 'That item is no longer here. It may have been deleted in another tab.',
      }
    }
    current = { kind: row.kind, imageId: row.imageId }
  }

  const parsed = productSchema.safeParse({
    title: String(formData.get('title') ?? ''),
    subtitle: String(formData.get('subtitle') ?? ''),
    kind: current ? current.kind : String(formData.get('kind') ?? ''),
    description: String(formData.get('description') ?? ''),
    status: String(formData.get('status') ?? 'draft'),
  })

  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }
  const values = parsed.data
  const kind: ProductKind = values.kind

  // Normalised rather than rejected: the client types words, the store needs a
  // web address, and slugify() is the same function the public links use.
  const slug = slugify(String(formData.get('slug') ?? '')) || slugify(values.title)
  if (!slug) {
    return {
      fieldErrors: {
        slug: 'Give this item a web address — a few words in letters and numbers, like tour-tee.',
      },
    }
  }

  if (await slugTakenByOtherProduct(slug, id)) {
    return {
      fieldErrors: {
        slug: 'Another item already uses that web address. Change it slightly.',
      },
    }
  }

  const price = readMoney(String(formData.get('priceCents') ?? ''))
  if (!price.ok) return { fieldErrors: { priceCents: price.error } }

  const compareAt = readOptionalMoney(String(formData.get('compareAtCents') ?? ''))
  if (!compareAt.ok) return { fieldErrors: { compareAtCents: compareAt.error } }

  if (compareAt.cents !== null && compareAt.cents <= price.cents) {
    return {
      fieldErrors: {
        compareAtCents:
          'The was-price has to be higher than the price, or there is nothing to strike through.',
      },
    }
  }

  const stock = readWholeNumber(
    String(formData.get('stock') ?? ''),
    'Enter a whole number of items, or leave it blank for unlimited.',
    1_000_000,
  )
  if (!stock.ok) return { fieldErrors: { stock: stock.error } }

  /* ------------------------------ preview ------------------------------ */

  const rawPreviewKind = String(formData.get('previewKind') ?? 'none')
  const chosenPreview: PreviewKind = PREVIEW_VALUES.includes(rawPreviewKind)
    ? (rawPreviewKind as PreviewKind)
    : 'none'

  let previewUrl = ''
  if (chosenPreview !== 'none') {
    const raw = String(formData.get('previewUrl') ?? '').trim()
    if (raw) {
      const safe = safeUrl(raw)
      if (!safe) {
        return {
          fieldErrors: {
            previewUrl:
              'That is not a link the site can open. Paste a full http:// or https:// address.',
          },
        }
      }
      previewUrl = safe
    }
  }
  // A preview kind with no link is not a preview. Storing 'audio' with a blank
  // URL would put an empty player on the public page.
  const previewKind: PreviewKind = previewUrl ? chosenPreview : 'none'

  /* --------------------------- kind-specific --------------------------- */

  // Everything starts cleared, and only the chosen kind fills its own columns
  // back in. That is what stops a beat carrying a stale musicFormat.
  let variants: Variant[] = []
  let musicFormat: MusicFormat | null = null
  let releaseId: number | null = null
  let licenseType: BeatLicense | null = null
  let bpm: number | null = null
  let musicalKey = ''
  let digital = false
  let downloadUrl = ''

  if (kind === 'merch') {
    variants = readVariants(formData)
  }

  if (kind === 'music' || kind === 'beat') {
    digital = formData.get('digital') === 'on'

    const raw = String(formData.get('downloadUrl') ?? '').trim()
    if (raw) {
      const safe = safeUrl(raw)
      if (!safe) {
        return {
          fieldErrors: {
            downloadUrl:
              'That is not a link the site can open. Paste a full http:// or https:// address.',
          },
        }
      }
      // Kept whether or not "digital" is ticked. Unticking the box is how the
      // client pauses delivery, not how they throw the link away.
      downloadUrl = safe
    }
  }

  if (kind === 'music') {
    const rawFormat = String(formData.get('musicFormat') ?? '')
    musicFormat = FORMAT_VALUES.includes(rawFormat)
      ? (rawFormat as MusicFormat)
      : 'single'

    const rawRelease = String(formData.get('releaseId') ?? '').trim()
    if (rawRelease !== '') {
      const candidate = Number(rawRelease)
      if (!Number.isInteger(candidate)) {
        return { fieldErrors: { releaseId: 'Pick a release from the list, or none.' } }
      }

      // The <select> only offers real releases, so this catches one thing: a
      // release deleted in another tab since this form was opened.
      const release = await db
        .select({ id: releases.id })
        .from(releases)
        .where(eq(releases.id, candidate))
        .get()

      if (!release) {
        return {
          fieldErrors: {
            releaseId: 'That release is no longer here. Pick another, or set it to none.',
          },
        }
      }
      releaseId = candidate
    }
  }

  if (kind === 'beat') {
    const rawLicense = String(formData.get('licenseType') ?? '')
    licenseType = LICENSE_VALUES.includes(rawLicense)
      ? (rawLicense as BeatLicense)
      : 'lease'

    const tempo = readWholeNumber(
      String(formData.get('bpm') ?? ''),
      'Enter the tempo as a whole number, like 140.',
      400,
    )
    if (!tempo.ok) return { fieldErrors: { bpm: tempo.error } }
    bpm = tempo.value

    musicalKey = String(formData.get('musicalKey') ?? '')
      .trim()
      .slice(0, 20)
  }

  /* -------------------------------- image ------------------------------- */

  // Last, because it writes a file: everything that can be rejected has been
  // rejected by now, so a failed save never leaves an upload behind.
  const image = await applyImageField(formData, 'image', current?.imageId ?? null)
  if (!image.ok) return { error: image.error }

  const now = new Date()
  const row = {
    kind,
    slug,
    title: values.title,
    subtitle: values.subtitle,
    description: values.description,
    priceCents: price.cents,
    compareAtCents: compareAt.cents,
    imageId: image.imageId,
    previewUrl,
    previewKind,
    releaseId,
    musicFormat,
    licenseType,
    bpm,
    musicalKey,
    variants,
    stock: stock.value,
    digital,
    downloadUrl,
    featured: formData.get('featured') === 'on',
    status: values.status,
    updatedAt: now,
  }

  if (id === null) {
    // A new item goes to the top of its own kind's run, which is where the
    // client is looking after they save it. The arrows move it from there.
    const top = await topOrderForKind(kind)

    const inserted = await db
      .insert(products)
      .values({ ...row, order: top, createdAt: now })
      .returning({ id: products.id })
      .get()

    if (!inserted) {
      if (image.changed) await cleanupImage(image.imageId)
      return { error: 'Could not save that item. Try again.' }
    }

    revalidateContent(STORE_TAGS.products)
    redirect(`/admin/store/${inserted.id}`)
  }

  await db.update(products).set(row).where(eq(products.id, id))

  // Only after the row points at the new picture.
  const previous = current?.imageId ?? null
  if (image.changed && previous !== null && previous !== image.imageId) {
    await releaseProductImage(previous)
  }

  revalidateContent(STORE_TAGS.products)
  return { saved: true }
}

/* ------------------------------ row actions ------------------------------ */

/**
 * Bound with the id: deleteProduct.bind(null, id).
 *
 * Past orders are safe. order_items snapshots the title and the price it
 * charged and holds the product reference ON DELETE SET NULL, so removing an
 * item from the store cannot rewrite what somebody was charged for it.
 */
export async function deleteProduct(id: number): Promise<void> {
  await requireAdmin()

  const row = await db
    .select({ imageId: products.imageId })
    .from(products)
    .where(eq(products.id, id))
    .get()

  if (!row) redirect('/admin/store')

  await db.delete(products).where(eq(products.id, id))
  await releaseProductImage(row.imageId)

  revalidateContent(STORE_TAGS.products)
  redirect('/admin/store')
}

/** Inline publish / unpublish from the list. Bound with the id and the target. */
export async function setProductStatus(id: number, status: PublishStatus): Promise<void> {
  await requireAdmin()

  await db
    .update(products)
    .set({ status, updatedAt: new Date() })
    .where(eq(products.id, id))

  revalidateContent(STORE_TAGS.products)
}

/** The order arrows. Bound with the id and the direction. */
export async function moveProduct(id: number, direction: 'up' | 'down'): Promise<void> {
  await requireAdmin()
  await reorderProduct(id, direction)
  revalidateContent(STORE_TAGS.products)
}

/* ----------------------------- store settings ---------------------------- */

/**
 * The store page copy has its own schema, here rather than in
 * src/lib/validation.ts: nothing outside this file validates it, and the
 * browser has no second copy of these rules to keep in step.
 *
 * The three section headings and the page heading are the only fields that
 * refuse blank. A blank intro is a designed state — the storefront renders no
 * paragraph at all — but a blank heading is a section with no name on it.
 */
const HEADING = (what: string) =>
  z
    .string()
    .trim()
    .min(1, `The ${what} needs a heading.`)
    .max(80, 'Keep a heading under 80 characters.')

const storeSettingsSchema = z.object({
  heading: z
    .string()
    .trim()
    .min(1, 'The store page needs a heading.')
    .max(120, 'Keep the heading under 120 characters.'),
  intro: z.string().max(2000, 'That intro is over 2000 characters. Trim it.'),
  merchHeading: HEADING('merch section'),
  merchIntro: z.string().max(1000, 'That intro is over 1000 characters.'),
  musicHeading: HEADING('music section'),
  musicIntro: z.string().max(1000, 'That intro is over 1000 characters.'),
  beatsHeading: HEADING('beats section'),
  beatsIntro: z.string().max(1000, 'That intro is over 1000 characters.'),
  emptyMessage: z.string().max(600, 'That message is over 600 characters.'),
  currency: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{3}$/, 'Use the three-letter code — GBP, USD, EUR.')
    .transform((value) => value.toUpperCase()),
  currencySymbol: z
    .string()
    .trim()
    .min(1, 'The price symbol cannot be blank. £, $ or €.')
    .max(4, 'A currency symbol is at most four characters.'),
  shippingNote: z.string().max(600, 'That note is over 600 characters.'),
  checkoutNote: z.string().max(600, 'That note is over 600 characters.'),
  successMessage: z.string().max(1000, 'That message is over 1000 characters.'),
})

/**
 * The store_page singleton, id 1. A database that has been migrated but never
 * seeded has no row at all, so saving inserts it rather than failing — the
 * admin is usable on a fresh install and the client never meets a screen that
 * cannot be saved.
 */
export async function saveStoreSettings(
  _previous: StoreSettingsState,
  formData: FormData,
): Promise<StoreSettingsState> {
  await requireAdmin()

  const parsed = storeSettingsSchema.safeParse({
    heading: String(formData.get('heading') ?? ''),
    intro: String(formData.get('intro') ?? ''),
    merchHeading: String(formData.get('merchHeading') ?? ''),
    merchIntro: String(formData.get('merchIntro') ?? ''),
    musicHeading: String(formData.get('musicHeading') ?? ''),
    musicIntro: String(formData.get('musicIntro') ?? ''),
    beatsHeading: String(formData.get('beatsHeading') ?? ''),
    beatsIntro: String(formData.get('beatsIntro') ?? ''),
    emptyMessage: String(formData.get('emptyMessage') ?? ''),
    currency: String(formData.get('currency') ?? ''),
    currencySymbol: String(formData.get('currencySymbol') ?? ''),
    shippingNote: String(formData.get('shippingNote') ?? ''),
    checkoutNote: String(formData.get('checkoutNote') ?? ''),
    successMessage: String(formData.get('successMessage') ?? ''),
  })

  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }
  const values = parsed.data

  // Pounds in the field, pence in the column — the same conversion every price
  // in the store goes through. Blank means no flat rate rather than an error.
  const shipping = readOptionalMoney(String(formData.get('shippingCents') ?? ''))
  if (!shipping.ok) return { fieldErrors: { shippingCents: shipping.error } }

  const row = {
    heading: values.heading,
    intro: values.intro,
    merchHeading: values.merchHeading,
    merchIntro: values.merchIntro,
    musicHeading: values.musicHeading,
    musicIntro: values.musicIntro,
    beatsHeading: values.beatsHeading,
    beatsIntro: values.beatsIntro,
    emptyMessage: values.emptyMessage,
    currency: values.currency,
    currencySymbol: values.currencySymbol,
    shippingCents: shipping.cents ?? 0,
    shippingNote: values.shippingNote,
    checkoutNote: values.checkoutNote,
    successMessage: values.successMessage,
    updatedAt: new Date(),
  }

  const existing = await db
    .select({ id: storePage.id })
    .from(storePage)
    .where(eq(storePage.id, 1))
    .get()

  if (existing) await db.update(storePage).set(row).where(eq(storePage.id, 1))
  else await db.insert(storePage).values({ id: 1, ...row })

  revalidateContent(STORE_TAGS.storePage)
  return { saved: true }
}
