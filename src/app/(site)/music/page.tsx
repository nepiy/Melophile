import type { Metadata } from 'next'
import { ReleaseCatalog } from '@/components/music/ReleaseCatalog'
import { SectionHead } from '@/components/site/SectionHead'
import { getHome, getReleases } from '@/lib/data'

import '@/styles/music.css'

/* ==========================================================================
   /music — the full catalogue.

   Reads the same getReleases() rows the home page's section 2 reads, so there
   is one catalogue in one place and the two can never drift apart. The heading
   and the intro are the client's words, from the `home` row; the only English
   literals on this page are our own chrome and the empty state.

   ?r=<slug> is resolved here, on the server, against the published list — so a
   stale or hand-typed link renders the catalogue rather than an empty dialog,
   and a real one arrives with the detail view already open.
   ========================================================================== */

export async function generateMetadata(): Promise<Metadata> {
  const home = await getHome()
  return {
    title: 'Music',
    description: home.musicIntro || undefined,
  }
}

export default async function MusicPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [home, releases, params] = await Promise.all([
    getHome(),
    getReleases(),
    searchParams,
  ])

  const raw = params.r
  const requested =
    typeof raw === 'string' ? raw : Array.isArray(raw) ? raw[0] : undefined
  const openSlug =
    requested && releases.some((release) => release.slug === requested) ? requested : null

  return (
    <section className="sec mus" aria-labelledby="catalogue-heading">
      <div className="shell">
        {releases.length === 0 ? (
          <>
            <SectionHead
              channel="01"
              label="Catalogue"
              heading={home.musicHeading}
              intro={home.musicIntro}
              id="catalogue-heading"
              headingLevel={1}
            />

            <div className="empty">
              <p className="empty__title">No releases published yet</p>
              <p className="empty__text">
                Add the first one from the admin. It will appear here as soon as you
                publish it.
              </p>
            </div>
          </>
        ) : (
          <ReleaseCatalog
            releases={releases}
            heading={home.musicHeading}
            intro={home.musicIntro}
            headingId="catalogue-heading"
            initialSlug={openSlug}
          />
        )}
      </div>
    </section>
  )
}
