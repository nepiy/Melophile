import type { ReactNode } from 'react'
import { SiteChrome } from '@/components/site/SiteChrome'

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
