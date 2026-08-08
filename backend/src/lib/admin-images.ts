import { eq } from 'drizzle-orm'
import { aboutPhotos, artists, db, images, releases } from '@/db'
import { storage } from '@/lib/storage'

/* ==========================================================================
   The other half of <ImageField>.

   ImageField posts three things for a field called `cover`:
     cover        the File (empty when the client did not choose one)
     coverAlt     the alt text
     coverRemove  'on' when the "Remove image" box is ticked

   This turns those three into an image id, and handles the four cases that all
   have to work: no change, alt-text-only change, replacement, and removal.
   Every editor calls this rather than reimplementing it, so alt text is never
   optional and replaced files are never left behind on disk.
   ========================================================================== */

export type ImageFieldOutcome =
  { ok: true; imageId: number | null; changed: boolean } | { ok: false; error: string }

/**
 * `currentImageId` is what the row points at today. The returned imageId is what
 * it should point at after the save — possibly the same, possibly null.
 *
 * Nothing is deleted until the parent row has been updated, so a failure part
 * way through can never leave a row pointing at a file that is gone. Call
 * cleanupImage(oldId) after the update has committed.
 */
export async function applyImageField(
  formData: FormData,
  name: string,
  currentImageId: number | null,
): Promise<ImageFieldOutcome> {
  const remove = formData.get(`${name}Remove`) === 'on'
  const alt = String(formData.get(`${name}Alt`) ?? '').trim()
  const raw = formData.get(name)
  const file = raw instanceof File && raw.size > 0 ? raw : null

  // Removal wins: if the client ticked the box, a stray file selection is not
  // what they meant.
  if (remove) {
    return { ok: true, imageId: null, changed: currentImageId !== null }
  }

  if (file) {
    if (!alt) {
      return {
        ok: false,
        error:
          'Add alt text for this image — one short phrase describing it, so the site works for people using a screen reader.',
      }
    }

    const saved = await storage.save(file)
    if (!saved.ok) return { ok: false, error: saved.error }

    const inserted = await db
      .insert(images)
      .values({
        path: saved.image.path,
        width: saved.image.width,
        height: saved.image.height,
        alt,
        mimeType: saved.image.mimeType,
        bytes: saved.image.bytes,
        isPlaceholder: false,
        createdAt: new Date(),
      })
      .returning({ id: images.id })
      .get()

    if (!inserted) {
      // The file is on disk but unreferenced; remove it rather than orphan it.
      await storage.remove(saved.image.path)
      return { ok: false, error: 'Could not save that image. Try again.' }
    }

    return { ok: true, imageId: inserted.id, changed: true }
  }

  // No new file. If the client corrected the alt text, that is still an edit
  // worth keeping — alt text is the thing people most often fix on a second pass.
  if (currentImageId !== null && alt) {
    const existing = await db
      .select({ alt: images.alt })
      .from(images)
      .where(eq(images.id, currentImageId))
      .get()

    if (existing && existing.alt !== alt) {
      await db.update(images).set({ alt }).where(eq(images.id, currentImageId))
      return { ok: true, imageId: currentImageId, changed: true }
    }
  }

  return { ok: true, imageId: currentImageId, changed: false }
}

/**
 * Deletes an image row and its file, but only once nothing points at it.
 *
 * The reference check is the whole reason this is a function: the same image can
 * legitimately be a release cover and an About photo, and deleting the file
 * because one of them let go would break the other.
 */
export async function cleanupImage(imageId: number | null): Promise<void> {
  if (imageId === null) return

  const [byRelease, byArtist, byAbout] = await Promise.all([
    db
      .select({ id: releases.id })
      .from(releases)
      .where(eq(releases.coverImageId, imageId))
      .all(),
    db.select({ id: artists.id }).from(artists).where(eq(artists.photoId, imageId)).all(),
    db
      .select({ id: aboutPhotos.id })
      .from(aboutPhotos)
      .where(eq(aboutPhotos.imageId, imageId))
      .all(),
  ])

  if (byRelease.length > 0 || byArtist.length > 0 || byAbout.length > 0) return

  const row = await db
    .select({ path: images.path })
    .from(images)
    .where(eq(images.id, imageId))
    .get()

  await db.delete(images).where(eq(images.id, imageId))
  if (row) await storage.remove(row.path)
}

/** Every image nothing points at. Used by the "tidy up" action on settings. */
export async function findOrphanImages(): Promise<{ id: number; path: string }[]> {
  const all = await db.select({ id: images.id, path: images.path }).from(images).all()
  if (all.length === 0) return []

  const used = new Set<number>()

  for (const row of await db.select({ id: releases.coverImageId }).from(releases).all()) {
    if (row.id !== null) used.add(row.id)
  }
  for (const row of await db.select({ id: artists.photoId }).from(artists).all()) {
    if (row.id !== null) used.add(row.id)
  }
  for (const row of await db
    .select({ id: aboutPhotos.imageId })
    .from(aboutPhotos)
    .all()) {
    if (row.id !== null) used.add(row.id)
  }

  return all.filter((image) => !used.has(image.id))
}

/* ------------------------------ repeater JSON ----------------------------- */

/**
 * RepeaterField serialises its rows into one hidden input as JSON. Parsing it
 * defensively matters: it arrives as a string from the browser, so it is
 * untrusted, and a malformed value must produce an empty list rather than a
 * 500.
 */
export function parseRepeater(
  formData: FormData,
  name: string,
  keys: string[],
): Record<string, string>[] {
  const raw = formData.get(name)
  if (typeof raw !== 'string' || !raw.trim()) return []

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []

  const rows: Record<string, string>[] = []
  for (const entry of parsed) {
    if (typeof entry !== 'object' || entry === null) continue
    const row: Record<string, string> = {}
    let hasValue = false
    for (const key of keys) {
      const value = (entry as Record<string, unknown>)[key]
      const text = typeof value === 'string' ? value.trim() : ''
      row[key] = text
      if (text) hasValue = true
    }
    // Drop rows the client left entirely blank rather than storing empty tracks.
    if (hasValue) rows.push(row)
  }
  return rows
}

/** Also drops rows whose required column is blank. */
export function parseRepeaterRequiring(
  formData: FormData,
  name: string,
  keys: string[],
  required: string[],
): Record<string, string>[] {
  return parseRepeater(formData, name, keys).filter((row) =>
    required.every((key) => (row[key] ?? '').length > 0),
  )
}
