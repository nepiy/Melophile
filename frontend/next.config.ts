import type { NextConfig } from 'next'

const backendUrl = process.env.BACKEND_URL?.trim()
  .replace(/\/$/, '')
  .replace(/^(?!https?:\/\/)/, 'https://')

const config: NextConfig = {
  async rewrites() {
    if (!backendUrl) return []
    // The existing application is server-rendered. During the API extraction
    // the Vercel edge forwards every route to Railway, keeping every page,
    // server action and auth cookie working under the public Vercel domain.
    return {
      // `beforeFiles` is essential: the frontend has a temporary local `/`
      // page during the migration, and this must not win over the Railway app.
      beforeFiles: [{ source: '/:path*', destination: `${backendUrl}/:path*` }],
      afterFiles: [],
      fallback: [],
    }
  },
}

export default config
