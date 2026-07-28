import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'
import { SmartImage } from '@/components/site/SmartImage'
import { AddToCart } from '@/components/store/AddToCart'
import { PreviewPlayer } from '@/components/store/PreviewPlayer'
import {
  beatSpec,
  cardBadge,
  kindForSegment,
  soldLabel,
  toCard,
} from '@/components/store/ProductCard'
import { CART_STORAGE_KEY, MAX_LINE_QUANTITY } from '@/lib/cart'
import { formatMoney, musicFormatLabel, productKindLabel } from '@/lib/format'
import { RichText, stripMarkdown } from '@/lib/markdown'
import { getProductBySlug, getStorePage } from '@/lib/store-data'

import '@/styles/store.css'

/* ==========================================================================
   One product.

   The slug is unique across the whole table, so the kind segment is not needed
   to find the row — which is exactly why it is checked. /store/beats/<a-tee>
   resolves a real product through the wrong door, and a page that renders it
   anyway hands out two URLs for one thing. It 404s.

   Order on the page is the order of the decision: what it is, what it costs,
   what you get, what it sounds like, then the button. The description is the
   long read and sits below all of it.
   ========================================================================== */

type Params = { kind: string; slug: string }

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>
}): Promise<Metadata> {
  const { kind: segment, slug } = await params
  const kind = kindForSegment(segment)
  const product = kind ? await getProductBySlug(slug) : null
  if (!product || product.kind !== kind) return { title: 'Store' }

  return {
    title: product.title,
    description: stripMarkdown(product.description, 160) || product.subtitle || undefined,
  }
}

export default async function ProductPage({ params }: { params: Promise<Params> }) {
  const { kind: segment, slug } = await params
  const kind = kindForSegment(segment)
  if (!kind) notFound()

  const [page, product] = await Promise.all([getStorePage(), getProductBySlug(slug)])
  if (!product || product.kind !== kind) notFound()

  const card = toCard(product)
  const symbol = page.currencySymbol
  const badge = cardBadge(card)
  const reduced =
    product.compareAtCents !== null && product.compareAtCents > product.priceCents
  const exclusive = product.licenseType === 'exclusive'

  /* The spec sheet. Only the rows this kind actually has. */
  const spec: { k: string; v: ReactNode }[] = []
  if (kind === 'music' && product.musicFormat) {
    spec.push({ k: 'Format', v: musicFormatLabel(product.musicFormat) })
  }
  if (kind === 'beat') {
    if (product.licenseType) {
      spec.push({ k: 'Licence', v: cardBadge(card) })
    }
    const tempo = beatSpec(product)
    if (tempo) spec.push({ k: 'Tempo and key', v: tempo })
  }
  if (card.sizes.length > 0) {
    spec.push({
      k: 'Sizes',
      v: (
        <span className="st-spec__sizes">
          {card.sizes.map((size) => (
            <span
              key={size.label}
              className="st-card__size"
              data-out={size.soldOut ? 'true' : 'false'}
            >
              {size.label}
              {size.soldOut ? <span className="vh"> — sold out</span> : null}
            </span>
          ))}
        </span>
      ),
    })
  }
  spec.push({ k: 'Delivery', v: product.digital ? 'Download' : 'Posted' })

  return (
    <section className="sec st" aria-labelledby="product-heading">
      <div className="shell">
        <p className="mono st-crumbs">
          <Link href="/store" className="st-crumbs__link">
            {page.heading || 'Store'}
          </Link>
          <span className="st-crumbs__sep" aria-hidden="true">
            /
          </span>
          <Link href={`/store/${segment}`} className="st-crumbs__link">
            {productKindLabel(kind)}
          </Link>
        </p>

        <div className="st-pd">
          <div className="st-pd__art">
            <SmartImage
              image={product.image}
              alt={product.image?.alt || `${product.title} — product photograph`}
              sizes="(max-width: 880px) 92vw, 44vw"
              priority
              emptyLabel="No photograph yet"
            />
          </div>

          <div className="st-pd__body">
            {badge ? <span className="st-chip st-pd__badge">{badge}</span> : null}

            <h1 id="product-heading" className="st-pd__title">
              {product.title}
            </h1>
            {product.subtitle ? <p className="st-pd__sub">{product.subtitle}</p> : null}

            <p className="st-pd__price">
              {reduced && product.compareAtCents !== null ? (
                <>
                  <span className="vh">Was </span>
                  <s className="st-pd__was">
                    {formatMoney(product.compareAtCents, symbol)}
                  </s>
                  <span className="vh">, now </span>
                </>
              ) : null}
              <span className="st-pd__now">
                {formatMoney(product.priceCents, symbol)}
              </span>
              {reduced ? <span className="st-chip st-chip--lit">Reduced</span> : null}
              {card.soldOut ? (
                <span className="st-chip st-chip--out">{soldLabel(card)}</span>
              ) : null}
            </p>

            <dl className="st-spec">
              {spec.map((row) => (
                <div key={row.k} className="st-spec__row">
                  <dt className="label st-spec__k">{row.k}</dt>
                  <dd className="mono st-spec__v">{row.v}</dd>
                </div>
              ))}
            </dl>

            <PreviewPlayer
              id={product.id}
              kind={product.previewKind}
              url={product.previewUrl}
              title={product.title}
            />

            <div className="st-pd__buy">
              <AddToCart
                id={product.id}
                title={product.title}
                stock={product.stock}
                sizes={card.sizes}
                exclusive={exclusive}
                soldOut={card.soldOut}
                /* The key and the cap are owned by '@/lib/cart' and handed
                   down from here: that module reads the database to re-price
                   the basket, so a client component cannot import it. */
                storageKey={CART_STORAGE_KEY}
                maxQuantity={MAX_LINE_QUANTITY}
              />

              {!product.digital && page.shippingNote ? (
                <p className="st-pd__note">{page.shippingNote}</p>
              ) : null}
              {product.digital ? (
                <p className="st-pd__note">
                  A download link is sent the moment the payment clears.
                </p>
              ) : null}
            </div>

            {product.description ? (
              <div className="st-pd__desc">
                <RichText value={product.description} />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  )
}
