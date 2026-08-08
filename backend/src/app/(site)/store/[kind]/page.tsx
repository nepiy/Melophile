import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SectionHead } from '@/components/site/SectionHead'
import { StoreListing } from '@/components/store/AddToCart'
import { kindForSegment, ProductGrid, toCard } from '@/components/store/ProductCard'
import type { ProductKind, StorePageRow } from '@/db'
import { pluralise, productKindLabel } from '@/lib/format'
import { getProductsByKind, getStorePage } from '@/lib/store-data'

import '@/styles/store.css'

/* ==========================================================================
   /store/merch · /store/music · /store/beats

   One listing, three kinds. The segment in the URL is not the value in the
   column — kindForSegment() is the only thing that knows that, and anything it
   does not recognise is a 404 rather than an empty grid, because /store/vinyl
   is a wrong address and not an empty shelf.

   Merch is a plain server-rendered grid: sizes are printed on the card and
   there is nothing to narrow. Music and beats each get one filter, which is
   the only reason any of this ships JavaScript.
   ========================================================================== */

type Params = { kind: string }

function copyFor(
  kind: ProductKind,
  page: StorePageRow,
): { heading: string; intro: string } {
  if (kind === 'merch') return { heading: page.merchHeading, intro: page.merchIntro }
  if (kind === 'music') return { heading: page.musicHeading, intro: page.musicIntro }
  return { heading: page.beatsHeading, intro: page.beatsIntro }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>
}): Promise<Metadata> {
  const { kind: segment } = await params
  const kind = kindForSegment(segment)
  if (!kind) return { title: 'Store' }

  const page = await getStorePage()
  const copy = copyFor(kind, page)
  return {
    title: copy.heading || productKindLabel(kind),
    description: copy.intro || undefined,
  }
}

export default async function StoreKindPage({ params }: { params: Promise<Params> }) {
  const { kind: segment } = await params
  const kind = kindForSegment(segment)
  if (!kind) notFound()

  const [page, products] = await Promise.all([getStorePage(), getProductsByKind(kind)])

  const copy = copyFor(kind, page)
  const cards = products.map(toCard)
  const symbol = page.currencySymbol
  const imageSizes = '(max-width: 560px) 92vw, (max-width: 1000px) 46vw, 31vw'

  return (
    <section className="sec st" aria-labelledby="listing-heading">
      <div className="shell">
        <p className="mono st-crumbs">
          <Link href="/store" className="st-crumbs__link">
            {page.heading || 'Store'}
          </Link>
          <span className="st-crumbs__sep" aria-hidden="true">
            /
          </span>
          <span className="st-crumbs__here">{productKindLabel(kind)}</span>
        </p>

        <SectionHead
          channel="01"
          label={productKindLabel(kind)}
          heading={copy.heading}
          intro={copy.intro}
          id="listing-heading"
          headingLevel={1}
          aside={
            cards.length > 0 ? (
              <p className="mono dim">
                {cards.length} {pluralise(cards.length, 'item')}
              </p>
            ) : null
          }
        />

        {cards.length === 0 ? (
          <div className="empty st-empty">
            <p className="empty__title">{page.emptyMessage || 'Nothing here yet.'}</p>
            <p className="empty__text">
              The rest of the store is open — take a look at what else the label has made.
            </p>
            <Link href="/store" className="btn st-empty__back">
              Back to the store
            </Link>
          </div>
        ) : kind === 'merch' ? (
          <ProductGrid cards={cards} symbol={symbol} imageSizes={imageSizes} />
        ) : (
          <StoreListing
            cards={cards}
            facet={kind === 'music' ? 'format' : 'license'}
            symbol={symbol}
            imageSizes={imageSizes}
          />
        )}
      </div>
    </section>
  )
}
