import Link from 'next/link'
import { SectionHead } from '@/components/site/SectionHead'
import { SiteChrome } from '@/components/site/SiteChrome'
import { getSiteSettings } from '@/lib/data'

export const metadata = { title: 'Page not found' }

/* This is the GLOBAL 404, so it sits outside app/(site) and has to bring the
   public furniture with it. */

/**
 * An empty state, not an apology. It tells you what happened and offers the two
 * things somebody who lands here actually wants.
 */
export default async function NotFound() {
  const settings = await getSiteSettings()

  return (
    <SiteChrome>
      <section className="sec">
        <div className="shell">
          <SectionHead
            channel="00"
            label="No signal"
            heading="That page is not here"
            headingLevel={1}
            intro="The address may have changed, or the link that brought you here was wrong."
          />

          <p className="mono nf__code">404 — NO SUCH ROUTE</p>

          <div className="nf__actions">
            <Link href="/music" className="btn">
              {settings.navMusic}
            </Link>
            <Link href="/contact#book" className="btn">
              Book the studio
            </Link>
            <Link href="/" className="arrow-link">
              Back to the start
              <span className="arrow-link__line" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>
    </SiteChrome>
  )
}
