import { and, asc, desc, eq, inArray, ne } from 'drizzle-orm'
import {
  aboutPhotos,
  about as aboutTable,
  adminUsers,
  artists,
  blackouts,
  bookings,
  contact as contactTable,
  db,
  home as homeTable,
  images,
  releaseArtists,
  releases,
  services,
  siteSettings,
  type AboutRow,
  type ArtistRow,
  type BookingStatus,
  type ContactRow,
  type HomeRow,
  type ImageRow,
  type ReleaseRow,
  type ServiceRow,
  type SiteSettingsRow,
} from '@/db'

/* ==========================================================================
   Admin reads.

   Separate from src/lib/data.ts on purpose, and the difference matters:

     data.ts    cached with unstable_cache, and filtered to status='published'.
                Right for the public site, wrong for an editor — the client
                would not see their own drafts, and would see a stale row for
                as long as the cache holds after a save.

     this file  no cache, no status filter. Every admin page also sets
                `export const dynamic = 'force-dynamic'`, so an editor always
                shows exactly what is in the database right now.
   ========================================================================== */

/* ------------------------------- releases ------------------------------- */

export type AdminRelease = ReleaseRow & {
  artist: ArtistRow | null
  cover: ImageRow | null
  features: { artistId: number; name: string; role: string }[]
}

export async function listReleases(): Promise<AdminRelease[]> {
  const rows = await db.query.releases.findMany({
    orderBy: [asc(releases.order), desc(releases.releaseDate)],
    with: { artist: true, cover: true, features: { with: { artist: true } } },
  })
  return rows.map(normalise)
}

export async function getReleaseForEdit(id: number): Promise<AdminRelease | null> {
  const row = await db.query.releases.findFirst({
    where: eq(releases.id, id),
    with: { artist: true, cover: true, features: { with: { artist: true } } },
  })
  return row ? normalise(row) : null
}

type RawRelease = ReleaseRow & {
  artist?: ArtistRow | null
  cover?: ImageRow | null
  features?: { role: string; artistId: number; artist?: ArtistRow | null }[]
}

function normalise(row: RawRelease): AdminRelease {
  return {
    ...row,
    artist: row.artist ?? null,
    cover: row.cover ?? null,
    features: (row.features ?? [])
      .filter((f) => f.artist)
      .map((f) => ({
        artistId: f.artistId,
        name: f.artist?.name ?? '',
        role: f.role,
      })),
  }
}

/** True if another release already uses this slug. */
export async function slugTakenByOtherRelease(
  slug: string,
  exceptId: number | null,
): Promise<boolean> {
  const row = await db
    .select({ id: releases.id })
    .from(releases)
    .where(
      exceptId === null
        ? eq(releases.slug, slug)
        : and(eq(releases.slug, slug), ne(releases.id, exceptId)),
    )
    .get()
  return Boolean(row)
}

/** The next free catalogue number, e.g. LMTLS-010. Suggested, never forced. */
export async function suggestCatalogNumber(): Promise<string> {
  const rows = await db
    .select({ catalogNumber: releases.catalogNumber })
    .from(releases)
    .all()

  let prefix = 'LMTLS'
  let highest = 0
  for (const row of rows) {
    const match = /^([A-Za-z]+)-(\d+)$/.exec(row.catalogNumber.trim())
    if (!match) continue
    prefix = match[1] ?? prefix
    const n = Number(match[2])
    if (n > highest) highest = n
  }
  const width = Math.max(3, String(highest).length)
  return `${prefix}-${String(highest + 1).padStart(width, '0')}`
}

/* -------------------------------- artists -------------------------------- */

export type AdminArtist = ArtistRow & {
  photo: ImageRow | null
  /** Read-only: derived from the catalogue, never stored twice. */
  appearsOn: { id: number; title: string; catalogNumber: string; releaseDate: string }[]
}

export async function listArtists(): Promise<AdminArtist[]> {
  const rows = await db.query.artists.findMany({
    orderBy: [asc(artists.order), asc(artists.id)],
    with: { photo: true },
  })
  if (rows.length === 0) return []

  const ids = rows.map((r) => r.id)

  const primary = await db
    .select({
      id: releases.id,
      title: releases.title,
      catalogNumber: releases.catalogNumber,
      releaseDate: releases.releaseDate,
      artistId: releases.artistId,
    })
    .from(releases)
    .where(inArray(releases.artistId, ids))
    .all()

  const guest = await db
    .select({
      id: releases.id,
      title: releases.title,
      catalogNumber: releases.catalogNumber,
      releaseDate: releases.releaseDate,
      artistId: releaseArtists.artistId,
    })
    .from(releaseArtists)
    .innerJoin(releases, eq(releases.id, releaseArtists.releaseId))
    .where(inArray(releaseArtists.artistId, ids))
    .all()

  const all = [...primary, ...guest]

  return rows.map((artist) => {
    const mine = all.filter((r) => r.artistId === artist.id)
    const deduped = [...new Map(mine.map((r) => [r.id, r])).values()].sort((a, b) =>
      b.releaseDate.localeCompare(a.releaseDate),
    )
    return {
      ...artist,
      photo: artist.photo ?? null,
      appearsOn: deduped.map(({ id, title, catalogNumber, releaseDate }) => ({
        id,
        title,
        catalogNumber,
        releaseDate,
      })),
    }
  })
}

export async function getArtistForEdit(id: number): Promise<AdminArtist | null> {
  const all = await listArtists()
  return all.find((a) => a.id === id) ?? null
}

export async function slugTakenByOtherArtist(
  slug: string,
  exceptId: number | null,
): Promise<boolean> {
  const row = await db
    .select({ id: artists.id })
    .from(artists)
    .where(
      exceptId === null
        ? eq(artists.slug, slug)
        : and(eq(artists.slug, slug), ne(artists.id, exceptId)),
    )
    .get()
  return Boolean(row)
}

/** For the artist <select> on the release editor. */
export async function artistOptions(): Promise<{ value: string; label: string }[]> {
  const rows = await db
    .select({ id: artists.id, name: artists.name, status: artists.status })
    .from(artists)
    .orderBy(asc(artists.name))
    .all()
  return rows.map((r) => ({
    value: String(r.id),
    label: r.status === 'draft' ? `${r.name} (draft)` : r.name,
  }))
}

/* -------------------------------- services ------------------------------- */

export async function listServices(): Promise<ServiceRow[]> {
  return db.select().from(services).orderBy(asc(services.order), asc(services.id)).all()
}

export async function getServiceForEdit(id: number): Promise<ServiceRow | null> {
  return (await db.select().from(services).where(eq(services.id, id)).get()) ?? null
}

/* --------------------------------- pages --------------------------------- */

/**
 * Unlike the public getter, this KEEPS slots whose imageId is null. The empty
 * slots are the point of this screen: the client has to be able to see and fill
 * them here even though they collapse to nothing on the public page.
 */
export type AdminAboutPhoto = {
  id: number
  caption: string
  order: number
  image: ImageRow | null
}

export async function getAboutForEdit(): Promise<{
  about: AboutRow
  photos: AdminAboutPhoto[]
}> {
  const about = await db.select().from(aboutTable).where(eq(aboutTable.id, 1)).get()
  const photos = await db.query.aboutPhotos.findMany({
    orderBy: [asc(aboutPhotos.order), asc(aboutPhotos.id)],
    with: { image: true },
  })

  return {
    about: about ?? {
      id: 1,
      heading: 'Our story',
      body: '',
      foundedYear: null,
      showCatalogCount: true,
      updatedAt: new Date(),
    },
    photos: photos.map((p) => ({
      id: p.id,
      caption: p.caption,
      order: p.order,
      image: p.image ?? null,
    })),
  }
}

export async function getContactForEdit(): Promise<ContactRow | null> {
  return (
    (await db.select().from(contactTable).where(eq(contactTable.id, 1)).get()) ?? null
  )
}

export async function getSettingsForEdit(): Promise<SiteSettingsRow | null> {
  return (
    (await db.select().from(siteSettings).where(eq(siteSettings.id, 1)).get()) ?? null
  )
}

export async function getHomeForEdit(): Promise<HomeRow | null> {
  return (await db.select().from(homeTable).where(eq(homeTable.id, 1)).get()) ?? null
}

/* -------------------------------- bookings ------------------------------- */

export async function listBookings(status?: BookingStatus) {
  return db
    .select()
    .from(bookings)
    .where(status ? eq(bookings.status, status) : undefined)
    .orderBy(desc(bookings.createdAt))
    .all()
}

export async function getBooking(id: number) {
  return (await db.select().from(bookings).where(eq(bookings.id, id)).get()) ?? null
}

export async function bookingCounts(): Promise<Record<BookingStatus | 'all', number>> {
  const rows = await db.select({ status: bookings.status }).from(bookings).all()
  const counts = { all: rows.length, new: 0, confirmed: 0, declined: 0, done: 0 }
  for (const row of rows) counts[row.status] += 1
  return counts
}

/* ------------------------------- blackouts ------------------------------- */

export async function listBlackouts() {
  return db.select().from(blackouts).orderBy(asc(blackouts.date)).all()
}

/* ------------------------------- dashboard ------------------------------- */

export type AdminCounts = {
  releases: { published: number; draft: number }
  artists: { published: number; draft: number }
  services: { published: number; draft: number }
  bookings: { new: number; total: number }
  aboutPhotoSlots: { filled: number; empty: number }
  placeholderImages: number
}

export async function adminCounts(): Promise<AdminCounts> {
  const [rel, art, svc, bkg, slots, ph] = await Promise.all([
    db.select({ status: releases.status }).from(releases).all(),
    db.select({ status: artists.status }).from(artists).all(),
    db.select({ status: services.status }).from(services).all(),
    db.select({ status: bookings.status }).from(bookings).all(),
    db.select({ imageId: aboutPhotos.imageId }).from(aboutPhotos).all(),
    db.select({ id: images.id }).from(images).where(eq(images.isPlaceholder, true)).all(),
  ])

  const split = (rows: { status: string }[]) => ({
    published: rows.filter((r) => r.status === 'published').length,
    draft: rows.filter((r) => r.status === 'draft').length,
  })

  return {
    releases: split(rel),
    artists: split(art),
    services: split(svc),
    bookings: {
      new: bkg.filter((b) => b.status === 'new').length,
      total: bkg.length,
    },
    aboutPhotoSlots: {
      filled: slots.filter((s) => s.imageId !== null).length,
      empty: slots.filter((s) => s.imageId === null).length,
    },
    placeholderImages: ph.length,
  }
}

export async function getAdminUser(id: number) {
  return (await db.select().from(adminUsers).where(eq(adminUsers.id, id)).get()) ?? null
}

/* --------------------------------- order --------------------------------- */

export type Orderable = 'releases' | 'artists' | 'services'

/**
 * Moves a row up or down and writes both `order` values.
 *
 * Sequential integers are rewritten across the whole list first, because seeded
 * or hand-edited rows can share an order value — and swapping two identical
 * numbers looks like the button is broken.
 */
export async function reorder(
  table: Orderable,
  id: number,
  direction: 'up' | 'down',
): Promise<void> {
  const target = { releases, artists, services }[table]

  const rows = await db
    .select({ id: target.id, order: target.order })
    .from(target)
    .orderBy(asc(target.order), asc(target.id))
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
    await db.update(target).set({ order: position }).where(eq(target.id, row.id))
  }
}
