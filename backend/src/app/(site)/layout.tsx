import type { ReactNode } from 'react'
import { SiteChrome } from '@/components/site/SiteChrome'

// Public pages read label content, releases, events, and shop stock from SQLite.
// Rendering them on demand keeps that data current after an admin save and, more
// importantly, prevents Next from opening the native SQLite client in one of its
// isolated build-time page-data workers. Those workers are prone to crashing on
// constrained container builders such as Railway.
export const dynamic = 'force-dynamic'

/**
 * The public site. A route group, so it adds the nav and footer without adding
 * a URL segment — /music is still /music.
 *
 * /admin sits outside this group and therefore never inherits the public
 * header, which is the whole reason the group exists.
 */
export default function SiteLayout({ children }: { children: ReactNode }) {
  return <SiteChrome>{children}</SiteChrome>
}
