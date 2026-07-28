import type { Metadata } from 'next'
import Link from 'next/link'
import { Reveal } from '@/components/site/Reveal'
import { SectionHead } from '@/components/site/SectionHead'
import { ProductGrid, toCard, type StoreSegment } from '@/components/store/ProductCard'
import { pluralise } from '@/lib/format'
import { getProducts, getStoreCounts, getStorePage } from '@/lib/store-data'

import '@/styles/store.css'

/* ==========================================================================
   /store — the landing.

   The store sells three unrelated things, so this page has one job: make the
   three obvious. Three panels, each with the client's own heading and intro
   and a count read from the database at request time, then the featured items
   underneath so the page still shows product rather than only signposts.

   Every heading and intro here comes from the `store_page` row. The only
   English written into this file is our own chrome.
   ========================================================================== */

export async function generateMetadata(): Promise<Metadata> {
  const page = await getStorePage()
  return {
    title: page.heading || 'Store',
    description: page.intro || undefined,
  }
}

export default async function StorePage() {
  const [page, counts, products] = await Promise.all([
    getStorePage(),
    getStoreCounts(),
    getProducts(),
  ])

  const sections: {
    segment: StoreSegment
    channel: string
    heading: string
    intro: string
    count: number
  }[] = [
    {
      segment: 'merch',
      channel: '01',
      heading: page.merchHeading,
      intro: page.merchIntro,
      count: counts.merch,
    },
    {
      segment: 'music',
      channel: '02',
      heading: page.musicHeading,
      intro: page.musicIntro,
      count: counts.music,
    },
    {
      segment: 'beats',
      channel: '03',
      heading: page.beatsHeading,
      intro: page.beatsIntro,
      count: counts.beat,
    },
  ]

  const total = counts.merch + counts.music + counts.beat
  // Whatever the client has flagged, in the order they set — the featured strip
  // is a cross-section of the store, not a fourth section with its own rules.
  const featured = products
    .filter((product) => product.featured)
    .slice(0, 6)
    .map(toCard)

  return (
    <section className="sec st" aria-labelledby="store-heading">
      <div className="shell">
        <SectionHead
          channel="01"
          label="Store"
          heading={page.heading}
          intro={page.intro}
          id="store-heading"
          headingLevel={1}
          aside={
            total > 0 ? (
              <p className="mono dim">
                {total} {pluralise(total, 'item')}
              </p>
            ) : null
          }
        />

        <ul className="st-opts">
          {sections.map((section, i) => (
            <Reveal as="li" key={section.segment} index={i} className="st-opts__cell">
              <Link href={`/store/${section.segment}`} className="st-opt">
                <span className="mono st-opt__chan" aria-hidden="true">
                  {section.channel}
                </span>
                <h2 className="st-opt__title">{section.heading}</h2>
                {section.intro ? <p className="st-opt__intro">{section.intro}</p> : null}
                <span className="st-opt__foot">
                  <span className="mono st-opt__count">
                    {section.count > 0
                      ? `${section.count} ${pluralise(section.count, 'item')}`
                      : 'Nothing yet'}
                  </span>
                  <span className="st-opt__go" aria-hidden="true" />
                </span>
              </Link>
            </Reveal>
          ))}
        </ul>

        {total === 0 ? (
          <div className="empty st-empty">
            <p className="empty__title">{page.emptyMessage || 'Nothing here yet.'}</p>
            <p className="empty__text">
              The studio is still recording. Everything the label makes lands here first.
            </p>
          </div>
        ) : null}

        {featured.length > 0 ? (
          <div className="st-feat">
            <div className="st-feat__head">
              <span className="label">Featured</span>
              <span className="st-feat__rule" aria-hidden="true" />
              <span className="mono dim">
                {featured.length} {pluralise(featured.length, 'item')}
              </span>
            </div>

            <ProductGrid
              cards={featured}
              symbol={page.currencySymbol}
              imageSizes="(max-width: 560px) 92vw, (max-width: 1000px) 46vw, 31vw"
            />
          </div>
        ) : null}
      </div>
    </section>
  )
}
