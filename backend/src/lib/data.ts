import { and, asc, desc, eq, inArray } from 'drizzle-orm'
import { unstable_cache } from 'next/cache'
import {
  aboutPhotos,
  about as aboutTable,
  artists,
  blackouts,
  contact as contactTable,
  db,
  home as homeTable,
  releaseArtists,
  releases,
  services,
  siteSettings,
  type AboutRow,
  type ArtistRow,
  type ContactRow,
  type HomeRow,
  type ImageRow,
  type ReleaseRow,
  type ServiceRow,
  type SiteSettingsRow,
} from '@/db'

/* ------------------------------------------------------------------ *
 * Cache tags. The admin calls revalidateContent() with these on save,
 * which is how content goes live without a redeploy.
 * ------------------------------------------------------------------ */
export const TAGS = {
  settings: 'settings',
  home: 'home',
  about: 'about',
  contact: 'contact',
  services: 'services',
  releases: 'releases',
  artists: 'artists',
  blackouts: 'blackouts',
} as const

export type CacheTag = (typeof TAGS)[keyof typeof TAGS]

/* ------------------------------------------------------------------ *
 * Composed shapes — what pages receive
 * ------------------------------------------------------------------ */

export type ReleaseFull = ReleaseRow & {
  artist: ArtistRow | null
  cover: ImageRow | null
  features: { artist: ArtistRow; role: string }[]
}

export type ArtistWithPhoto = ArtistRow & { photo: ImageRow | null }

export type ArtistFull = ArtistWithPhoto & {
  /** Union of releases where this artist is primary and where they feature. */
  appearsOn: ReleaseFull[]
}

export type AboutPhotoFull = {
  id: number
  caption: string
  order: number
  image: ImageRow | null
}

export type AboutContent = {
  about: AboutRow
  /** May be empty. An empty array is a designed state, not a missing one. */
  photos: AboutPhotoFull[]
  catalogCount: number
}

/* ------------------------------------------------------------------ *
 * Singleton fallbacks
 *
 * The seed guarantees these rows exist. The fallbacks mean that a database
 * migrated but not seeded renders an empty site with working empty states,
 * rather than a stack trace.
 * ------------------------------------------------------------------ */

const now = () => new Date(0)

const FALLBACK_SETTINGS: SiteSettingsRow = {
  id: 1,
  logoText: 'MELOPHILE',
  navMusic: 'Music',
  navArtists: 'Artists',
  navAbout: 'About us',
  navContact: 'Contact',
  navStore: 'Store',
  navEvents: 'Events',
  footerText: '',
  socialLinks: [],
  metaTitle: 'Melophile Records',
  metaDescription: '',
  updatedAt: now(),
}

const FALLBACK_HOME: HomeRow = {
  id: 1,
  wordmarkLine1: 'MELOPHILE',
  wordmarkLine2: 'RECORDS',
  wordmarkTagline: '',
  scrollCue: 'Scroll',
  musicHeading: 'Music',
  musicIntro: '',
  musicCta: 'See all music',
  servicesHeading: 'Our services',
  servicesIntro: '',
  contactHeading: 'Contact',
  contactCta: 'Book the studio',
  featuredCount: 4,
  updatedAt: now(),
}

const FALLBACK_ABOUT: AboutRow = {
  id: 1,
  heading: 'Our story',
  body: '',
  foundedYear: null,
  showCatalogCount: true,
  updatedAt: now(),
}

const FALLBACK_CONTACT: ContactRow = {
  id: 1,
  addressLines: '',
  emails: [],
  phone: '',
  hours: '',
  socialLinks: [],
  mapEmbed: '',
  bookingHeading: 'Book the studio',
  bookingIntro: '',
  bookingSuccessMessage: '',
  responseTime: 'within two working days',
  updatedAt: now(),
}

/* ------------------------------------------------------------------ *
 * Reads. Every one is tagged, so one save invalidates exactly what changed.
 * ------------------------------------------------------------------ */

export const getSiteSettings = unstable_cache(
  async (): Promise<SiteSettingsRow> => {
    const row = await db.select().from(siteSettings).where(eq(siteSettings.id, 1)).get()
    return row ?? FALLBACK_SETTINGS
  },
  ['site-settings'],
  { tags: [TAGS.settings] },
)

export const getHome = unstable_cache(
  async (): Promise<HomeRow> => {
    const row = await db.select().from(homeTable).where(eq(homeTable.id, 1)).get()
    return row ?? FALLBACK_HOME
  },
  ['home'],
  { tags: [TAGS.home] },
)

export const getContact = unstable_cache(
  async (): Promise<ContactRow> => {
    const row = await db.select().from(contactTable).where(eq(contactTable.id, 1)).get()
    return row ?? FALLBACK_CONTACT
  },
  ['contact'],
  { tags: [TAGS.contact] },
)

export const getServices = unstable_cache(
  async (): Promise<ServiceRow[]> =>
    db
      .select()
      .from(services)
      .where(eq(services.status, 'published'))
      .orderBy(asc(services.order), asc(services.id))
      .all(),
  ['services'],
  { tags: [TAGS.services] },
)

/** Full catalogue, in the order the client set in the admin. */
export const getReleases = unstable_cache(
  async (): Promise<ReleaseFull[]> => {
    const rows = await db.query.releases.findMany({
      where: eq(releases.status, 'published'),
      orderBy: [asc(releases.order), desc(releases.releaseDate)],
      with: {
        artist: true,
        cover: true,
        features: { with: { artist: true } },
      },
    })
    return rows.map(normaliseRelease)
  },
  ['releases'],
  { tags: [TAGS.releases, TAGS.artists] },
)

/**
 * Home section 2. "Most recent" means most recent, so this sorts by release
 * date rather than by the manual catalogue order — with any release the client
 * has marked `featured` pinned to the front. Same rows as /music, never a copy.
 */
export const getRecentReleases = unstable_cache(
  async (limit: number): Promise<ReleaseFull[]> => {
    const clamped = Math.min(8, Math.max(4, Math.trunc(limit) || 4))
    const rows = await db.query.releases.findMany({
      where: eq(releases.status, 'published'),
      orderBy: [desc(releases.featured), desc(releases.releaseDate)],
      limit: clamped,
      with: {
        artist: true,
        cover: true,
        features: { with: { artist: true } },
      },
    })
    return rows.map(normaliseRelease)
  },
  ['recent-releases'],
  { tags: [TAGS.releases, TAGS.artists] },
)

export const getReleaseBySlug = unstable_cache(
  async (slug: string): Promise<ReleaseFull | null> => {
    const row = await db.query.releases.findFirst({
      where: and(eq(releases.slug, slug), eq(releases.status, 'published')),
      with: { artist: true, cover: true, features: { with: { artist: true } } },
    })
    return row ? normaliseRelease(row) : null
  },
  ['release-by-slug'],
  { tags: [TAGS.releases, TAGS.artists] },
)

export const getCatalogCount = unstable_cache(
  async (): Promise<number> => {
    const rows = await db
      .select({ id: releases.id })
      .from(releases)
      .where(eq(releases.status, 'published'))
      .all()
    return rows.length
  },
  ['catalog-count'],
  { tags: [TAGS.releases] },
)

/** The grid. Photos and nothing else — but the payload carries what the
 *  click-to-reveal panel needs, so opening it costs no round trip. */
export const getArtists = unstable_cache(
  async (): Promise<ArtistFull[]> => {
    const rows = await db.query.artists.findMany({
      where: eq(artists.status, 'published'),
      orderBy: [asc(artists.order), asc(artists.id)],
      with: { photo: true },
    })
    if (rows.length === 0) return []

    const ids = rows.map((r) => r.id)

    // Primary-artist releases.
    const primary = await db.query.releases.findMany({
      where: and(eq(releases.status, 'published'), inArray(releases.artistId, ids)),
      orderBy: [desc(releases.releaseDate)],
      with: { artist: true, cover: true, features: { with: { artist: true } } },
    })

    // Features. Derived, never a second stored copy of the catalogue.
    const featureLinks: { releaseId: number; artistId: number }[] = await db
      .select({ releaseId: releaseArtists.releaseId, artistId: releaseArtists.artistId })
      .from(releaseArtists)
      .where(inArray(releaseArtists.artistId, ids))
      .all()

    const featureReleaseIds = [...new Set(featureLinks.map((l) => l.releaseId))]
    const featureReleases = featureReleaseIds.length
      ? await db.query.releases.findMany({
          where: and(
            eq(releases.status, 'published'),
            inArray(releases.id, featureReleaseIds),
          ),
          with: { artist: true, cover: true, features: { with: { artist: true } } },
        })
      : []
    const featureById = new Map(featureReleases.map((r) => [r.id, normaliseRelease(r)]))

    return rows.map((artist) => {
      const own = primary.filter((r) => r.artistId === artist.id).map(normaliseRelease)
      const guested = featureLinks
        .filter((l) => l.artistId === artist.id)
        .map((l) => featureById.get(l.releaseId))
        .filter((r): r is ReleaseFull => Boolean(r))

      const merged = [...own, ...guested]
      const deduped = [...new Map(merged.map((r) => [r.id, r])).values()].sort((a, b) =>
        b.releaseDate.localeCompare(a.releaseDate),
      )

      return { ...artist, photo: artist.photo ?? null, appearsOn: deduped }
    })
  },
  ['artists'],
  { tags: [TAGS.artists, TAGS.releases] },
)

export const getAbout = unstable_cache(
  async (): Promise<AboutContent> => {
    const row = await db.select().from(aboutTable).where(eq(aboutTable.id, 1)).get()
    const photos = await db.query.aboutPhotos.findMany({
      orderBy: [asc(aboutPhotos.order), asc(aboutPhotos.id)],
      with: { image: true },
    })
    const published = await db
      .select({ id: releases.id })
      .from(releases)
      .where(eq(releases.status, 'published'))
      .all()

    return {
      about: row ?? FALLBACK_ABOUT,
      // A slot with no image attached is not a photo. It exists in the admin
      // as an obviously-fillable drop zone and is simply absent out here.
      photos: photos
        .filter((p) => p.image !== null)
        .map((p) => ({
          id: p.id,
          caption: p.caption,
          order: p.order,
          image: p.image,
        })),
      catalogCount: published.length,
    }
  },
  ['about'],
  { tags: [TAGS.about, TAGS.releases] },
)

/** ISO 'YYYY-MM-DD' strings the client has marked unavailable. */
export const getBlackoutDates = unstable_cache(
  async (): Promise<string[]> => {
    const rows = await db
      .select({ date: blackouts.date })
      .from(blackouts)
      .orderBy(asc(blackouts.date))
      .all()
    return rows.map((r) => r.date)
  },
  ['blackouts'],
  { tags: [TAGS.blackouts] },
)

/* ------------------------------------------------------------------ *
 * helpers
 * ------------------------------------------------------------------ */

type RawRelease = ReleaseRow & {
  artist?: ArtistRow | null
  cover?: ImageRow | null
  features?: { role: string; artist: ArtistRow | null }[]
}

function normaliseRelease(row: RawRelease): ReleaseFull {
  return {
    ...row,
    artist: row.artist ?? null,
    cover: row.cover ?? null,
    features: (row.features ?? [])
      .filter((f): f is { role: string; artist: ArtistRow } => Boolean(f.artist))
      .map((f) => ({ artist: f.artist, role: f.role })),
  }
}
