import { defineCloudflareConfig } from '@opennextjs/cloudflare'

// Cloudflare's build phase runs `npm run build`, which invokes OpenNext. Keep
// its inner Next.js build on a separate script to avoid recursively invoking
// OpenNext and to retain the database migration performed before each build.
const config = defineCloudflareConfig()
config.buildCommand = 'npm run build:next'

export default config
