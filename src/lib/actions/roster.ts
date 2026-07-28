'use server'

import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import {
  artists,
  db,
  services,
  SERVICE_ICONS,
  type LinkItem,
  type PublishStatus,
  type ServiceIcon,
} from '@/db'
import { applyImageField, cleanupImage, parseRepeaterRequiring } from '@/lib/admin-images'
import { reorder, slugTakenByOtherArtist } from '@/lib/admin-queries'
import { TAGS } from '@/lib/data'
import { slugify } from '@/lib/format'
import { safeUrl } from '@/lib/markdown'
import { revalidateContent } from '@/lib/revalidate'
import { requireAdmin } from '@/lib/session'
import {
  artistSchema,
  serviceSchema,
  toFieldErrors,
  type FieldErrors,
} from '@/lib/validation'

/* ==========================================================================
   The roster — artists and the services the studio offers.

   Two collections in one file because they are operated as one job: who the
   label works with, and what the room does. They share every rule the release
   actions follow — requireAdmin() first, validate before writing, revalidate
   after, and never throw at the client. A rejected save comes back as state
   the form renders next to the field that caused it.

   Artists revalidate the release tag as well as their own: the catalogue
   prints artist names, and the artist panel prints the catalogue.
   ========================================================================== */

export type ArtistState = {
  error?: string
  fieldErrors?: FieldErrors
  saved?: boolean
}

export type ServiceState = {
  error?: string
  fieldErrors?: FieldErrors
  saved?: boolean
}

const LINK_KEYS = ['label', 'url']

const ICONS: ReadonlySet<string> = new Set<string>(SERVICE_ICONS)

/* -------------------------------- artists -------------------------------- */

/**
 * The "Elsewhere" links on the artist panel.
 *
 * A row needs both a label and an address to be a link, and the address has to
 * be one the browser can open — safeUrl() rejects javascript: and friends. A
 * row it refuses is dropped rather than stored, because a dropped row is
 * visible to the client the next time they open the form and a dead link on the
 * public page is not. The hint on the field says so.
 */
function readLinks(formData: FormData): LinkItem[] {
  const out: LinkItem[] = []

  for (const row of parseRepeaterRequiring(formData, 'links', LINK_KEYS, LINK_KEYS)) {
    const url = safeUrl(row.url ?? '')
    if (!url) continue
    out.push({ label: row.label ?? '', url })
  }

  return out
}

/**
 * Creates when the hidden `id` is empty, updates when it is not.
 *
 * `appearsOn` is never touched here: it is read back out of the catalogue, and
 * the only way to change it is to edit a release.
 */
export async function saveArtist(
  _previous: ArtistState,
  formData: FormData,
): Promise<ArtistState> {
  await requireAdmin()

  const rawId = String(formData.get('id') ?? '').trim()
  const id = rawId === '' ? null : Number(rawId)
  if (id !== null && !Number.isInteger(id)) {
    return {
      error:
        'That artist could not be identified. Go back to the list and open it again.',
    }
  }

  const parsed = artistSchema.safeParse({
    name: String(formData.get('name') ?? ''),
    role: String(formData.get('role') ?? ''),
    shortDescription: String(formData.get('shortDescription') ?? ''),
    status: String(formData.get('status') ?? 'draft'),
  })

  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }
  const values = parsed.data

  // Normalised rather than rejected: the client types words, the site needs a
  // web address, and slugify() is the same function the public links use.
  const slug = slugify(String(formData.get('slug') ?? '')) || slugify(values.name)
  if (!slug) {
    return {
      fieldErrors: {
        slug: 'Give this artist a web address — a few words in letters and numbers, like nadia-oyelowo.',
      },
    }
  }

  // Checked here so the UNIQUE constraint on artists.slug never gets the chance
  // to turn a typo into a 500.
  if (await slugTakenByOtherArtist(slug, id)) {
    return {
      fieldErrors: {
        slug: 'Another artist already uses that web address. Change it slightly.',
      },
    }
  }

  let currentPhotoId: number | null = null
  if (id !== null) {
    const current = await db
      .select({ photoId: artists.photoId })
      .from(artists)
      .where(eq(artists.id, id))
      .get()

    if (!current) {
      return {
        error:
          'That artist is no longer here. They may have been deleted in another tab.',
      }
    }
    currentPhotoId = current.photoId
  }

  // Last, because it writes a file: everything that can be rejected has been
  // rejected by now, so a failed save never leaves an upload behind.
  const photo = await applyImageField(formData, 'photo', currentPhotoId)
  if (!photo.ok) return { error: photo.error }

  const now = new Date()
  const row = {
    slug,
    name: values.name,
    photoId: photo.imageId,
    shortDescription: values.shortDescription,
    role: values.role,
    links: readLinks(formData),
    status: values.status,
    updatedAt: now,
  }

  if (id === null) {
    // The roster is a wall the client curates, so a new face joins the end of
    // it rather than jumping the queue. The arrows on the list move it.
    const orders = await db.select({ order: artists.order }).from(artists).all()
    const last = orders.length === 0 ? 0 : Math.max(...orders.map((o) => o.order)) + 1

    const inserted = await db
      .insert(artists)
      .values({ ...row, order: last, createdAt: now })
      .returning({ id: artists.id })
      .get()

    if (!inserted) {
      if (photo.changed) await cleanupImage(photo.imageId)
      return { error: 'Could not save that artist. Try again.' }
    }

    revalidateContent(TAGS.artists, TAGS.releases)
    redirect(`/admin/artists/${inserted.id}`)
  }

  await db.update(artists).set(row).where(eq(artists.id, id))

  // Only after the row points at the new image, and only if nothing else uses
  // the old one — cleanupImage() checks.
  if (photo.changed && currentPhotoId !== null && currentPhotoId !== photo.imageId) {
    await cleanupImage(currentPhotoId)
  }

  revalidateContent(TAGS.artists, TAGS.releases)
  return { saved: true }
}

/** Bound with the id: deleteArtist.bind(null, id). */
export async function deleteArtist(id: number): Promise<void> {
  await requireAdmin()

  const row = await db
    .select({ photoId: artists.photoId })
    .from(artists)
    .where(eq(artists.id, id))
    .get()

  if (!row) redirect('/admin/artists')

  // Releases keep their rows: artistId is set to null and the feature join
  // cascades, so nothing in the catalogue disappears with the artist.
  await db.delete(artists).where(eq(artists.id, id))
  await cleanupImage(row.photoId)

  revalidateContent(TAGS.artists, TAGS.releases)
  redirect('/admin/artists')
}

/** Inline publish / unpublish from the list. Bound with the id and the target. */
export async function setArtistStatus(id: number, status: PublishStatus): Promise<void> {
  await requireAdmin()

  await db
    .update(artists)
    .set({ status, updatedAt: new Date() })
    .where(eq(artists.id, id))

  revalidateContent(TAGS.artists, TAGS.releases)
}

/** The order arrows. Bound with the id and the direction. */
export async function moveArtist(id: number, direction: 'up' | 'down'): Promise<void> {
  await requireAdmin()
  await reorder('artists', id, direction)
  revalidateContent(TAGS.artists, TAGS.releases)
}

/* -------------------------------- services ------------------------------- */

export async function saveService(
  _previous: ServiceState,
  formData: FormData,
): Promise<ServiceState> {
  await requireAdmin()

  const rawId = String(formData.get('id') ?? '').trim()
  const id = rawId === '' ? null : Number(rawId)
  if (id !== null && !Number.isInteger(id)) {
    return {
      error:
        'That service could not be identified. Go back to the list and open it again.',
    }
  }

  const parsed = serviceSchema.safeParse({
    title: String(formData.get('title') ?? ''),
    description: String(formData.get('description') ?? ''),
    icon: String(formData.get('icon') ?? ''),
    status: String(formData.get('status') ?? 'draft'),
  })

  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }
  const values = parsed.data

  // The <select> only offers the eight slugs the icon set draws. This catches a
  // hand-posted form, and keeps the column to values ServiceIcon can render.
  if (!ICONS.has(values.icon)) {
    return { fieldErrors: { icon: 'Pick one of the icons in the list.' } }
  }

  const now = new Date()
  const row = {
    title: values.title,
    description: values.description,
    icon: values.icon as ServiceIcon,
    status: values.status,
    updatedAt: now,
  }

  if (id === null) {
    const orders = await db.select({ order: services.order }).from(services).all()
    const last = orders.length === 0 ? 0 : Math.max(...orders.map((o) => o.order)) + 1

    const inserted = await db
      .insert(services)
      .values({ ...row, order: last })
      .returning({ id: services.id })
      .get()

    if (!inserted) return { error: 'Could not save that service. Try again.' }

    revalidateContent(TAGS.services)
    redirect(`/admin/services/${inserted.id}`)
  }

  const current = await db
    .select({ id: services.id })
    .from(services)
    .where(eq(services.id, id))
    .get()

  if (!current) {
    return {
      error: 'That service is no longer here. It may have been deleted in another tab.',
    }
  }

  await db.update(services).set(row).where(eq(services.id, id))

  revalidateContent(TAGS.services)
  return { saved: true }
}

/** Bound with the id: deleteService.bind(null, id). */
export async function deleteService(id: number): Promise<void> {
  await requireAdmin()

  await db.delete(services).where(eq(services.id, id))

  revalidateContent(TAGS.services)
  redirect('/admin/services')
}

/** Inline publish / unpublish from the list. Bound with the id and the target. */
export async function setServiceStatus(id: number, status: PublishStatus): Promise<void> {
  await requireAdmin()

  await db
    .update(services)
    .set({ status, updatedAt: new Date() })
    .where(eq(services.id, id))

  revalidateContent(TAGS.services)
}

/** The order arrows. Bound with the id and the direction. */
export async function moveService(id: number, direction: 'up' | 'down'): Promise<void> {
  await requireAdmin()
  await reorder('services', id, direction)
  revalidateContent(TAGS.services)
}
