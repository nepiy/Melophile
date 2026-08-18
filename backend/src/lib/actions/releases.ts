'use server'

import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import {
  artists,
  db,
  releaseArtists,
  releases,
  STREAMING_PLATFORMS,
  type PublishStatus,
  type StreamingLink,
  type Track,
} from '@/db'
import { applyImageField, cleanupImage, parseRepeaterRequiring } from '@/lib/admin-images'
import { reorder, slugTakenByOtherRelease } from '@/lib/admin-queries'
import { TAGS } from '@/lib/data'
import { slugify } from '@/lib/format'
import { safeUrl } from '@/lib/markdown'
import { revalidateContent } from '@/lib/revalidate'
import { requireAdmin } from '@/lib/session'
import { releaseSchema, toFieldErrors, type FieldErrors } from '@/lib/validation'

/* ==========================================================================
   Releases — create, update, delete, publish, reorder.

   Every action starts with requireAdmin(). Every one that writes ends with
   revalidateContent(), which is what makes a save appear on the public site
   without a redeploy.

   Nothing here throws at the client: a bad slug, a missing row or a rejected
   image comes back as state the form renders inline.
   ========================================================================== */

export type ReleaseState = {
  error?: string
  fieldErrors?: FieldErrors
  saved?: boolean
}

const TRACK_KEYS = ['n', 'title', 'duration']
const LINK_KEYS = ['platform', 'url']
const FEATURE_KEYS = ['artist', 'role']

const PLATFORMS: ReadonlySet<string> = new Set<string>(STREAMING_PLATFORMS)

/* ------------------------------- repeaters ------------------------------- */

/**
 * A track with no title is not a track, so those rows go. The number column is
 * a convenience: blank or nonsense falls back to the row's position, which is
 * what the client meant by typing them in that order.
 */
function readTracklist(formData: FormData): Track[] {
  return parseRepeaterRequiring(formData, 'tracklist', TRACK_KEYS, ['title']).map(
    (row, index) => {
      const n = Number(row.n)
      return {
        n: Number.isFinite(n) && n > 0 ? Math.trunc(n) : index + 1,
        title: row.title ?? '',
        duration: row.duration ?? '',
      }
    },
  )
}

/**
 * Only the five platforms the site can render a button for, and only links it
 * can actually open. A typo'd platform is dropped rather than stored, because
 * a dropped row is visible to the client on the next load and a broken link on
 * the public page is not. The hint on the field says so.
 */
function readStreamingLinks(formData: FormData): StreamingLink[] {
  const out: StreamingLink[] = []

  for (const row of parseRepeaterRequiring(
    formData,
    'streamingLinks',
    LINK_KEYS,
    LINK_KEYS,
  )) {
    const platform = (row.platform ?? '').toLowerCase()
    const url = safeUrl(row.url ?? '')
    if (!PLATFORMS.has(platform) || !url) continue
    out.push({ platform: platform as StreamingLink['platform'], url })
  }

  return out
}

/**
 * Rewrites the release_artists join rows from the features repeater.
 *
 * The cell holds a NAME, matched case-insensitively against the artists that
 * exist. Names that match nobody are ignored — the alternative is inventing an
 * artist row from a typo. Duplicates are dropped too: (releaseId, artistId) is
 * the primary key, and a repeated name would otherwise fail the insert.
 */
async function writeFeatures(releaseId: number, formData: FormData): Promise<void> {
  const rows = parseRepeaterRequiring(formData, 'features', FEATURE_KEYS, ['artist'])

  await db.delete(releaseArtists).where(eq(releaseArtists.releaseId, releaseId))
  if (rows.length === 0) return

  const known: { id: number; name: string }[] = await db
    .select({ id: artists.id, name: artists.name })
    .from(artists)
    .all()
  const byName = new Map(
    known.map((artist) => [artist.name.trim().toLowerCase(), artist.id]),
  )

  const values: { releaseId: number; artistId: number; role: string }[] = []
  const seen = new Set<number>()

  for (const row of rows) {
    const artistId = byName.get((row.artist ?? '').toLowerCase())
    if (artistId === undefined || seen.has(artistId)) continue
    seen.add(artistId)
    values.push({ releaseId, artistId, role: row.role ?? '' })
  }

  if (values.length > 0) await db.insert(releaseArtists).values(values)
}

/* -------------------------------- save ---------------------------------- */

/**
 * Creates when the hidden `id` is empty, updates when it is not. One action for
 * both, because the two differ in three lines and a second copy is a second
 * place for the validation to drift.
 */
export async function saveRelease(
  _previous: ReleaseState,
  formData: FormData,
): Promise<ReleaseState> {
  await requireAdmin()

  const rawId = String(formData.get('id') ?? '').trim()
  const id = rawId === '' ? null : Number(rawId)
  if (id !== null && !Number.isInteger(id)) {
    return {
      error:
        'That release could not be identified. Go back to the list and open it again.',
    }
  }

  const artistRaw = String(formData.get('artistId') ?? '').trim()

  const parsed = releaseSchema.safeParse({
    title: String(formData.get('title') ?? ''),
    artistId: artistRaw === '' ? null : artistRaw,
    type: String(formData.get('type') ?? ''),
    releaseDate: String(formData.get('releaseDate') ?? ''),
    catalogNumber: String(formData.get('catalogNumber') ?? ''),
    description: String(formData.get('description') ?? ''),
    credits: String(formData.get('credits') ?? ''),
    status: String(formData.get('status') ?? 'draft'),
    featured: formData.get('featured') === 'on',
  })

  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }
  const values = parsed.data

  // The slug is normalised rather than rejected: the client types words, the
  // site needs a web address, and slugify() is the same function the public
  // links are built from.
  const slug = slugify(String(formData.get('slug') ?? '')) || slugify(values.title)
  if (!slug) {
    return {
      fieldErrors: {
        slug: 'Give this release a web address — a few words in letters and numbers, like midnight-tape.',
      },
    }
  }

  if (await slugTakenByOtherRelease(slug, id)) {
    return {
      fieldErrors: {
        slug: 'Another release already uses that web address. Change it slightly.',
      },
    }
  }

  // The <select> only offers real artists, so this catches one thing: an artist
  // deleted in another tab since this form was opened.
  if (values.artistId !== null) {
    const artist = await db
      .select({ id: artists.id })
      .from(artists)
      .where(eq(artists.id, values.artistId))
      .get()

    if (!artist) {
      return {
        fieldErrors: {
          artistId: 'That artist is no longer here. Pick another, or set it to none.',
        },
      }
    }
  }

  let currentCoverId: number | null = null
  if (id !== null) {
    const current = await db
      .select({ coverImageId: releases.coverImageId })
      .from(releases)
      .where(eq(releases.id, id))
      .get()

    if (!current) {
      return {
        error: 'That release is no longer here. It may have been deleted in another tab.',
      }
    }
    currentCoverId = current.coverImageId
  }

  // Last, because it writes a file: everything that can be rejected has been
  // rejected by now, so a failed save never leaves an upload behind.
  const cover = await applyImageField(formData, 'cover', currentCoverId)
  if (!cover.ok) return { error: cover.error }

  const now = new Date()
  const row = {
    slug,
    title: values.title,
    artistId: values.artistId,
    type: values.type,
    coverImageId: cover.imageId,
    releaseDate: values.releaseDate,
    catalogNumber: values.catalogNumber,
    description: values.description,
    tracklist: readTracklist(formData),
    credits: values.credits,
    streamingLinks: readStreamingLinks(formData),
    featured: values.featured,
    status: values.status,
    updatedAt: now,
  }

  if (id === null) {
    // The catalogue is ordered newest first, so a new release goes to the top
    // rather than the bottom. The arrows on the list move it from there.
    const orders = await db.select({ order: releases.order }).from(releases).all()
    const top = orders.length === 0 ? 0 : Math.min(...orders.map((o) => o.order)) - 1

    const inserted = await db
      .insert(releases)
      .values({ ...row, order: top, createdAt: now })
      .returning({ id: releases.id })
      .get()

    if (!inserted) {
      if (cover.changed) await cleanupImage(cover.imageId)
      return { error: 'Could not save that release. Try again.' }
    }

    await writeFeatures(inserted.id, formData)
    revalidateContent(TAGS.releases, TAGS.artists)
    redirect(`/admin/releases/${inserted.id}`)
  }

  await db.update(releases).set(row).where(eq(releases.id, id))
  await writeFeatures(id, formData)

  // Only after the row points at the new image, and only if nothing else uses
  // the old one — cleanupImage() checks.
  if (cover.changed && currentCoverId !== null && currentCoverId !== cover.imageId) {
    await cleanupImage(currentCoverId)
  }

  revalidateContent(TAGS.releases, TAGS.artists)
  return { saved: true }
}

/* ------------------------------ row actions ------------------------------ */

/** Bound with the id: deleteRelease.bind(null, id). */
export async function deleteRelease(id: number): Promise<void> {
  await requireAdmin()

  const row = await db
    .select({ coverImageId: releases.coverImageId })
    .from(releases)
    .where(eq(releases.id, id))
    .get()

  if (!row) redirect('/admin/releases')

  // release_artists cascades. The sleeve is only removed if no other row uses it.
  await db.delete(releases).where(eq(releases.id, id))
  await cleanupImage(row.coverImageId)

  revalidateContent(TAGS.releases, TAGS.artists)
  redirect('/admin/releases')
}

/** Inline publish / unpublish from the list. Bound with the id and the target. */
export async function setReleaseStatus(id: number, status: PublishStatus): Promise<void> {
  await requireAdmin()

  await db
    .update(releases)
    .set({ status, updatedAt: new Date() })
    .where(eq(releases.id, id))

  revalidateContent(TAGS.releases, TAGS.artists)
}

/** The order arrows. Bound with the id and the direction. */
export async function moveRelease(id: number, direction: 'up' | 'down'): Promise<void> {
  await requireAdmin()
  await reorder('releases', id, direction)
  revalidateContent(TAGS.releases, TAGS.artists)
}
