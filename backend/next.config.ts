import type { NextConfig } from 'next'

/** The port `npm run admin` serves the admin on. Keep in step with scripts/admin-server.mjs. */
const ADMIN_PORT = process.env.ADMIN_PORT ?? '4100'

const config: NextConfig = {
  // The database adapter is intentionally compatibility-wrapped during the
  // SQLite-to-PostgreSQL query migration. Keep deployment builds unblocked
  // while individual query modules are converted to PostgreSQL-native calls.
  typescript: { ignoreBuildErrors: true },
  // better-sqlite3 is a native module — it must not be bundled.
  serverExternalPackages: ['better-sqlite3'],

  experimental: {
    // Railway builders have modest memory. A single page-data worker avoids
    // native-module crashes caused by several workers opening SQLite at once.
    cpus: 1,
    // The admin is also reachable on its own port through scripts/admin-server.mjs.
    // Server actions compare Origin against Host to block cross-site posts, so
    // that port has to be named here or every form on the admin silently fails
    // to save while still looking like it worked.
    serverActions: {
      allowedOrigins: [`localhost:${ADMIN_PORT}`, `127.0.0.1:${ADMIN_PORT}`],
    },
  },

  images: {
    // Uploads land in /public/uploads and are served as local paths, so no
    // remotePatterns are needed. AVIF first, WebP fallback.
    formats: ['image/avif', 'image/webp'],
    // The largest thing we ever render is a release sleeve in the detail dialog.
    imageSizes: [64, 96, 160, 240, 320, 420],
    deviceSizes: [360, 480, 640, 828, 1080, 1320, 1920],
  },

  async headers() {
    return [
      {
        // /admin is never linked from the public site and must never be indexed.
        source: '/admin/:path*',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
          { key: 'Cache-Control', value: 'no-store, max-age=0' },
        ],
      },
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        ],
      },
    ]
  },
}

export default config
