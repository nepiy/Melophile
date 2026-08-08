import type { MetadataRoute } from 'next'

/**
 * The admin is never linked from the public site, never in the sitemap, and
 * excluded here. next.config.ts also sends `X-Robots-Tag: noindex` on
 * /admin/* — belt and braces, because robots.txt is a request and a header is
 * an instruction.
 */
export default function robots(): MetadataRoute.Robots {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(
    /\/$/,
    '',
  )

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin', '/admin/', '/api/'],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  }
}
