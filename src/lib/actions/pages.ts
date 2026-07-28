'use server'

import { asc, eq } from 'drizzle-orm'
import { z } from 'zod'
import {
  about as aboutTable,
  aboutPhotos,
  contact as contactTable,
  db,
  home as homeTable,
  siteSettings,
  type EmailItem,
  type SocialItem,
} from '@/db'
import { applyImageField, cleanupImage, parseRepeaterRequiring } from '@/lib/admin-images'
import { TAGS } from '@/lib/data'
import { safeUrl } from '@/lib/markdown'
import { revalidateContent } from '@/lib/revalidate'
import { requireAdmin } from '@/lib/session'
import {
  aboutSchema,
  contactSchema,
  toFieldErrors,
  type FieldErrors,
} from '@/lib/validation'

/* ==========================================================================
   The four singleton pages — about, contact, settings, home.

   Same rules the release and roster actions follow: requireAdmin() first,
   validate before writing, revalidate after, and never throw at the client. A
   rejected save comes back as state the form renders next to the field that
   caused it.

   One thing is particular to these four. Each is a single row with id = 1, and
   a database that has been migrated but never seeded has no row at all. Saving
   inserts it rather than failing, so the admin is usable on a fresh install and
   the client never meets a screen that cannot be saved.

   Revalidation is narrow on purpose: each of these writes exactly one tag, and
   revalidateContent() works out which routes that tag reaches.
   ========================================================================== */

export type PageState = {
  error?: string
  fieldErrors?: FieldErrors
  saved?: boolean
}

const EMAIL_KEYS = ['label', 'address']
const SOCIAL_KEYS = ['platform', 'url']

/* ------------------------------- repeaters ------------------------------- */

/**
 * The email list on /contact. A row with no address is not an address, so it
 * goes; the label is free text and may be blank, which renders as the address
 * on its own.
 */
function readEmails(formData: FormData): EmailItem[] {
  return parseRepeaterRequiring(formData, 'emails', EMAIL_KEYS, ['address']).map(
    (row) => ({ label: row.label ?? '', address: row.address ?? '' }),
  )
}

/**
 * Social links, for both the contact row and the settings row.
 *
 * A row needs both a platform and an address the browser can actually open —
 * safeUrl() rejects javascript: and friends. A row it refuses is dropped rather
 * than stored, because a dropped row is visible to the client the next time
 * they open the form and a dead link on the public page is not. The hint on the
 * field says so.
 */
function readSocials(formData: FormData, name: string): SocialItem[] {
  const out: SocialItem[] = []

  for (const row of parseRepeaterRequiring(formData, name, SOCIAL_KEYS, SOCIAL_KEYS)) {
    const url = safeUrl(row.url ?? '')
    if (!url) continue
    out.push({ platform: row.platform ?? '', url })
  }

  return out
}

/* ---------------------------------- about -------------------------------- */

export async function saveAbout(
  _previous: PageState,
  formData: FormData,
): Promise<PageState> {
  await requireAdmin()

  const parsed = aboutSchema.safeParse({
    heading: String(formData.get('heading') ?? ''),
    body: String(formData.get('body') ?? ''),
    // Sent as typed. The schema accepts a year or an empty string.
    foundedYear: String(formData.get('foundedYear') ?? '').trim(),
    // Absent when unticked — never a boolean cast of a missing value.
    showCatalogCount: formData.get('showCatalogCount') === 'on',
  })

  if (!parsed.success) {
    const fieldErrors = toFieldErrors(parsed.error)
    // foundedYear is a union of "a year" and "blank", and a failed union reports
    // its own generic message. Say what to type instead.
    if (fieldErrors.foundedYear) {
      fieldErrors.foundedYear =
        'Enter the year as four digits between 1900 and 2200, like 2016 — or leave it blank to hide the line.'
    }
    return { fieldErrors }
  }

  const values = parsed.data
  const now = new Date()
  const row = {
    heading: values.heading,
    body: values.body,
    foundedYear: typeof values.foundedYear === 'number' ? values.foundedYear : null,
    showCatalogCount: values.showCatalogCount,
    updatedAt: now,
  }

  const existing = await db
    .select({ id: aboutTable.id })
    .from(aboutTable)
    .where(eq(aboutTable.id, 1))
    .get()

  if (existing) await db.update(aboutTable).set(row).where(eq(aboutTable.id, 1))
  else await db.insert(aboutTable).values({ id: 1, ...row })

  // The words are written before any image is touched, so a slot that is
  // rejected for missing alt text can never cost the client their story.
  const slots = await db
    .select({
      id: aboutPhotos.id,
      imageId: aboutPhotos.imageId,
    })
    .from(aboutPhotos)
    .orderBy(asc(aboutPhotos.order), asc(aboutPhotos.id))
    .all()

  for (const [index, slot] of slots.entries()) {
    const captionField = `caption-${slot.id}`

    // A slot added in another tab after this form loaded posts nothing of its
    // own. Skipping it leaves it alone rather than blanking a caption this
    // form never showed.
    if (!formData.has(captionField)) continue

    const applied = await applyImageField(formData, `slot-${slot.id}`, slot.imageId)
    if (!applied.ok) {
      // Whatever was written above stays written; the client sees it on reload.
      revalidateContent(TAGS.about)
      return { error: `Photo slot ${index + 1}: ${applied.error}` }
    }

    await db
      .update(aboutPhotos)
      .set({
        imageId: applied.imageId,
        caption: String(formData.get(captionField) ?? '')
          .trim()
          .slice(0, 200),
      })
      .where(eq(aboutPhotos.id, slot.id))

    // Only after the slot points at the new image, and only if nothing else
    // uses the old one — cleanupImage() checks.
    if (applied.changed && slot.imageId !== null && slot.imageId !== applied.imageId) {
      await cleanupImage(slot.imageId)
    }
  }

  revalidateContent(TAGS.about)
  return { saved: true }
}

/* ----------------------------- about photo slots -------------------------- */

/**
 * Rewrites `order` as sequential integers across every slot.
 *
 * Seeded rows can share an order value, and swapping two identical numbers
 * looks exactly like a button that does nothing.
 */
async function renumberSlots(): Promise<void> {
  const rows = await db
    .select({ id: aboutPhotos.id })
    .from(aboutPhotos)
    .orderBy(asc(aboutPhotos.order), asc(aboutPhotos.id))
    .all()

  for (const [position, row] of rows.entries()) {
    await db
      .update(aboutPhotos)
      .set({ order: position })
      .where(eq(aboutPhotos.id, row.id))
  }
}

/** A new empty slot at the end. Invisible on the public page until it is filled. */
export async function addAboutPhotoSlot(): Promise<void> {
  await requireAdmin()

  const rows = await db.select({ order: aboutPhotos.order }).from(aboutPhotos).all()
  const last = rows.length === 0 ? 0 : Math.max(...rows.map((r) => r.order)) + 1

  await db.insert(aboutPhotos).values({ imageId: null, caption: '', order: last })

  revalidateContent(TAGS.about)
}

/** Bound with the id: removeAboutPhotoSlot.bind(null, id). */
export async function removeAboutPhotoSlot(id: number): Promise<void> {
  await requireAdmin()

  const row = await db
    .select({ imageId: aboutPhotos.imageId })
    .from(aboutPhotos)
    .where(eq(aboutPhotos.id, id))
    .get()

  if (!row) return

  await db.delete(aboutPhotos).where(eq(aboutPhotos.id, id))
  // The picture only goes if no release, artist or other slot points at it.
  await cleanupImage(row.imageId)
  await renumberSlots()

  revalidateContent(TAGS.about)
}

/** Bound with the id and the direction: moveAboutPhotoSlot.bind(null, id, 'up'). */
export async function moveAboutPhotoSlot(
  id: number,
  direction: 'up' | 'down',
): Promise<void> {
  await requireAdmin()

  const rows = await db
    .select({ id: aboutPhotos.id, order: aboutPhotos.order })
    .from(aboutPhotos)
    .orderBy(asc(aboutPhotos.order), asc(aboutPhotos.id))
    .all()

  const index = rows.findIndex((r) => r.id === id)
  if (index === -1) return

  const swapWith = direction === 'up' ? index - 1 : index + 1
  if (swapWith < 0 || swapWith >= rows.length) return

  const next = [...rows]
  const a = next[index]
  const b = next[swapWith]
  if (!a || !b) return
  next[index] = b
  next[swapWith] = a

  for (const [position, row] of next.entries()) {
    await db
      .update(aboutPhotos)
      .set({ order: position })
      .where(eq(aboutPhotos.id, row.id))
  }

  revalidateContent(TAGS.about)
}

/* --------------------------------- contact -------------------------------- */

export async function saveContact(
  _previous: PageState,
  formData: FormData,
): Promise<PageState> {
  await requireAdmin()

  const parsed = contactSchema.safeParse({
    addressLines: String(formData.get('addressLines') ?? ''),
    phone: String(formData.get('phone') ?? ''),
    hours: String(formData.get('hours') ?? ''),
    mapEmbed: String(formData.get('mapEmbed') ?? ''),
    bookingHeading: String(formData.get('bookingHeading') ?? ''),
    bookingIntro: String(formData.get('bookingIntro') ?? ''),
    bookingSuccessMessage: String(formData.get('bookingSuccessMessage') ?? ''),
    responseTime: String(formData.get('responseTime') ?? ''),
  })

  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

  const values = parsed.data
  const now = new Date()
  const row = {
    addressLines: values.addressLines,
    emails: readEmails(formData),
    phone: values.phone,
    hours: values.hours,
    socialLinks: readSocials(formData, 'socialLinks'),
    mapEmbed: values.mapEmbed,
    bookingHeading: values.bookingHeading,
    bookingIntro: values.bookingIntro,
    bookingSuccessMessage: values.bookingSuccessMessage,
    responseTime: values.responseTime,
    updatedAt: now,
  }

  const existing = await db
    .select({ id: contactTable.id })
    .from(contactTable)
    .where(eq(contactTable.id, 1))
    .get()

  if (existing) await db.update(contactTable).set(row).where(eq(contactTable.id, 1))
  else await db.insert(contactTable).values({ id: 1, ...row })

  revalidateContent(TAGS.contact)
  return { saved: true }
}

/* -------------------------------- settings -------------------------------- */

/**
 * Settings and home have their own schemas, here rather than in
 * src/lib/validation.ts: nothing outside this file validates them, and the
 * browser has no second copy of these rules to keep in step.
 *
 * The nav labels and the logo are the one place blank is refused. A blank label
 * is not an omission the site can render around — it is a menu item nobody can
 * see or click.
 */
const NAV_LABEL = z
  .string()
  .trim()
  .min(1, 'A nav label cannot be blank — type the word the menu should show.')
  .max(40, 'Keep a nav label under 40 characters; the bar is one line.')

const settingsSchema = z.object({
  logoText: z
    .string()
    .trim()
    .min(1, 'The site needs a wordmark. Type the label name.')
    .max(40, 'Keep the wordmark under 40 characters.'),
  navMusic: NAV_LABEL,
  navArtists: NAV_LABEL,
  navAbout: NAV_LABEL,
  navContact: NAV_LABEL,
  footerText: z.string().max(600, 'That footer line is over 600 characters. Trim it.'),
  metaTitle: z
    .string()
    .trim()
    .min(1, 'Search results need a title. The label name works.')
    .max(120, 'Keep the title under 120 characters — search results cut it off.'),
  metaDescription: z
    .string()
    .max(300, 'That is over 300 characters. Search results show about 160.'),
})

export async function saveSettings(
  _previous: PageState,
  formData: FormData,
): Promise<PageState> {
  await requireAdmin()

  const parsed = settingsSchema.safeParse({
    logoText: String(formData.get('logoText') ?? ''),
    navMusic: String(formData.get('navMusic') ?? ''),
    navArtists: String(formData.get('navArtists') ?? ''),
    navAbout: String(formData.get('navAbout') ?? ''),
    navContact: String(formData.get('navContact') ?? ''),
    footerText: String(formData.get('footerText') ?? ''),
    metaTitle: String(formData.get('metaTitle') ?? ''),
    metaDescription: String(formData.get('metaDescription') ?? ''),
  })

  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

  const values = parsed.data
  const now = new Date()
  const row = {
    logoText: values.logoText,
    navMusic: values.navMusic,
    navArtists: values.navArtists,
    navAbout: values.navAbout,
    navContact: values.navContact,
    footerText: values.footerText,
    socialLinks: readSocials(formData, 'socialLinks'),
    metaTitle: values.metaTitle,
    metaDescription: values.metaDescription,
    updatedAt: now,
  }

  const existing = await db
    .select({ id: siteSettings.id })
    .from(siteSettings)
    .where(eq(siteSettings.id, 1))
    .get()

  if (existing) await db.update(siteSettings).set(row).where(eq(siteSettings.id, 1))
  else await db.insert(siteSettings).values({ id: 1, ...row })

  revalidateContent(TAGS.settings)
  return { saved: true }
}

/* ---------------------------------- home ---------------------------------- */

const WORDMARK_LINE = z
  .string()
  .trim()
  .max(24, 'The wordmark is set very large — keep a line under 24 characters.')

const HEADING = z
  .string()
  .trim()
  .min(1, 'A section needs a heading.')
  .max(80, 'Keep a heading under 80 characters.')

const CTA = z
  .string()
  .trim()
  .min(1, 'A button needs a label.')
  .max(40, 'Keep a button label under 40 characters.')

const INTRO = z
  .string()
  .max(600, 'That is over 600 characters. One or two lines reads best.')

const homeSchema = z.object({
  wordmarkLine1: WORDMARK_LINE.min(1, 'The first line of the wordmark cannot be blank.'),
  wordmarkLine2: WORDMARK_LINE,
  wordmarkTagline: z
    .string()
    .max(200, 'That tagline is over 200 characters. One line reads best.'),
  scrollCue: z.string().trim().max(24, 'Keep the scroll cue to a word or two.'),
  musicHeading: HEADING,
  musicIntro: INTRO,
  musicCta: CTA,
  servicesHeading: HEADING,
  servicesIntro: INTRO,
  contactHeading: HEADING,
  contactCta: CTA,
})

/** What getRecentReleases() will accept. Four fills the row; eight fills two. */
function clampFeaturedCount(raw: string): number {
  const n = Number(raw)
  return Math.min(8, Math.max(4, Math.trunc(n) || 4))
}

export async function saveHome(
  _previous: PageState,
  formData: FormData,
): Promise<PageState> {
  await requireAdmin()

  const parsed = homeSchema.safeParse({
    wordmarkLine1: String(formData.get('wordmarkLine1') ?? ''),
    wordmarkLine2: String(formData.get('wordmarkLine2') ?? ''),
    wordmarkTagline: String(formData.get('wordmarkTagline') ?? ''),
    scrollCue: String(formData.get('scrollCue') ?? ''),
    musicHeading: String(formData.get('musicHeading') ?? ''),
    musicIntro: String(formData.get('musicIntro') ?? ''),
    musicCta: String(formData.get('musicCta') ?? ''),
    servicesHeading: String(formData.get('servicesHeading') ?? ''),
    servicesIntro: String(formData.get('servicesIntro') ?? ''),
    contactHeading: String(formData.get('contactHeading') ?? ''),
    contactCta: String(formData.get('contactCta') ?? ''),
  })

  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

  const now = new Date()
  const row = {
    ...parsed.data,
    // Clamped rather than rejected: the number box is a preference, not a
    // question with a wrong answer.
    featuredCount: clampFeaturedCount(String(formData.get('featuredCount') ?? '')),
    updatedAt: now,
  }

  const existing = await db
    .select({ id: homeTable.id })
    .from(homeTable)
    .where(eq(homeTable.id, 1))
    .get()

  if (existing) await db.update(homeTable).set(row).where(eq(homeTable.id, 1))
  else await db.insert(homeTable).values({ id: 1, ...row })

  revalidateContent(TAGS.home)
  return { saved: true }
}
