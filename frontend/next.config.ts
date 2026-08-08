import type { NextConfig } from 'next'

const backendUrl = process.env.BACKEND_URL?.replace(/\/$/, '')

const config: NextConfig = {
  async rewrites() {
    if (!backendUrl) return []
    // The existing application is server-rendered. During the API extraction
    // the Vercel edge forwards every route to Railway, keeping every page,
    // server action and auth cookie working under the public Vercel domain.
    return [{ source: '/:path*', destination: `${backendUrl}/:path*` }]
  },
}

export default config
