import type { NextConfig } from 'next'

const backendUrl = process.env.BACKEND_URL?.replace(/\/$/, '')

const config: NextConfig = {
  async rewrites() {
    if (!backendUrl) return []
    return [{ source: '/api/:path*', destination: `${backendUrl}/api/:path*` }]
  },
}

export default config
