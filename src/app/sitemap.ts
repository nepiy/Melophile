import type { MetadataRoute } from 'next'
import { getAbout, getArtists, getReleases } from '@/lib/data'

/**
 * The five public routes. /admin is deliberately absent — it is excluded here,
 * in robots.ts, and by the X-Robots-Tag header in next.config.ts.
 *
 * lastModified comes from the content's own updatedAt where there is one, so a
 * crawler is told the truth rather than "today" on every fetch.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(
    /\/$/,
    '',
  )

  const [releases, artists, about] = await Promise.all([
    getReleases(),
    getArtists(),
    getAbout(),
  ])

  const newest = (dates: (Date | null | undefined)[]): Date => {
    const times = dates
      .filter((d): d is Date => d instanceof Date)
      .map((d) => d.getTime())
    return times.length ? new Date(Math.max(...times)) : new Date()
  }

  return [
    {
      url: `${base}/`,
      lastModified: newest([
        ...releases.map((r) => r.updatedAt),
        ...artists.map((a) => a.updatedAt),
      ]),
      changeFrequency: 'monthly',
      priority: 1,
    },
    {
      url: `${base}/music`,
      lastModified: newest(releases.map((r) => r.updatedAt)),
      changeFrequency: 'monthly',
      priority: 0.9,
    },
    {
      url: `${base}/artists`,
      lastModified: newest(artists.map((a) => a.updatedAt)),
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${base}/about`,
      lastModified: about.about.updatedAt,
      changeFrequency: 'yearly',
      priority: 0.6,
    },
    {
      url: `${base}/contact`,
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 0.7,
    },
  ]
}
