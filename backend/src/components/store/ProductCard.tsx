import Link from 'next/link'
import { Reveal } from '@/components/site/Reveal'
import { SmartImage } from '@/components/site/SmartImage'
import type { ImageRow, ProductKind, Variant } from '@/db'
import { beatLicenseLabel, formatMoney, musicFormatLabel } from '@/lib/format'
import type { ProductFull } from '@/lib/store-data'

/* ==========================================================================
   One product, and the vocabulary the whole storefront agrees on.

   THE URL SEGMENT IS NOT THE DATABASE KIND. The store reads /store/beats but
   the column says 'beat', and there is exactly one place in the codebase that
   knows that — this file. Every page maps through kindForSegment() on the way
   in and productHref() on the way out, so the two spellings can never drift
   and a bad segment has one answer: notFound().

   This module carries no 'use client' on purpose. Server pages call
   kindForSegment() and toCard() directly; the client listing imports the card
   itself. A module without the directive can be used from both graphs — with
   the directive, calling toCard() on the server would throw.
   ========================================================================== */

export const STORE_SEGMENTS = ['merch', 'music', 'beats'] as const
export type StoreSegment = (typeof STORE_SEGMENTS)[number]

/** The only two lines in the codebase that know the segment is not the kind. */
const KIND_BY_SEGMENT: Record<StoreSegment, ProductKind> = {
  merch: 'merch',
  music: 'music',
  beats: 'beat',
}

const SEGMENT_BY_KIND: Record<ProductKind, StoreSegment> = {
  merch: 'merch',
  music: 'music',
  beat: 'beats',
}

/** A URL segment → the DB kind, or null for anything we do not sell. */
export function kindForSegment(segment: string): ProductKind | null {
  return KIND_BY_SEGMENT[segment as StoreSegment] ?? null
}

export function segmentForKind(kind: ProductKind): StoreSegment {
  return SEGMENT_BY_KIND[kind]
}

export function productHref(product: { kind: ProductKind; slug: string }): string {
  return `/store/${segmentForKind(product.kind)}/${product.slug}`
}

/* --------------------------------------------------------------------------
   Stock

   A variant's stock is free text — "In stock", "4 left", "made to order" —
   because a small label counts shirts on a shelf, not in a database. The only
   string we read as a state rather than as a note is "sold out".
   -------------------------------------------------------------------------- */

export function variantSoldOut(variant: Variant): boolean {
  return /sold\s*out/i.test(variant.stock)
}

/** Every size gone, or the row's own counter at zero. */
export function productSoldOut(product: {
  stock: number | null
  variants: Variant[]
}): boolean {
  if (product.stock !== null && product.stock <= 0) return true
  return product.variants.length > 0 && product.variants.every(variantSoldOut)
}

/* --------------------------------------------------------------------------
   The card's data

   Deliberately not ProductFull. `downloadUrl` is the thing a customer is
   paying for and it sits on the same row as the title — handing the whole row
   to a client component would ship it in the RSC payload to anyone who views
   source. Pages map through toCard() so only these fields ever cross.
   -------------------------------------------------------------------------- */

export type StoreCard = {
  id: number
  kind: ProductKind
  slug: string
  title: string
  subtitle: string
  priceCents: number
  compareAtCents: number | null
  image: ImageRow | null
  musicFormat: string | null
  licenseType: string | null
  bpm: number | null
  musicalKey: string
  sizes: { label: string; soldOut: boolean }[]
  soldOut: boolean
}

export function toCard(product: ProductFull): StoreCard {
  return {
    id: product.id,
    kind: product.kind,
    slug: product.slug,
    title: product.title,
    subtitle: product.subtitle,
    priceCents: product.priceCents,
    compareAtCents: product.compareAtCents,
    image: product.image,
    musicFormat: product.musicFormat,
    licenseType: product.licenseType,
    bpm: product.bpm,
    musicalKey: product.musicalKey,
    sizes: product.variants.map((variant) => ({
      label: variant.label,
      soldOut: variantSoldOut(variant),
    })),
    soldOut: productSoldOut(product),
  }
}

/** 'Album', 'Lease' — the one badge a card carries. Merch needs none. */
export function cardBadge(card: StoreCard): string {
  if (card.kind === 'music') return musicFormatLabel(card.musicFormat)
  if (card.kind === 'beat') return beatLicenseLabel(card.licenseType)
  return ''
}

/** '92 BPM · F minor'. Either half may be missing. */
export function beatSpec(card: { bpm: number | null; musicalKey: string }): string {
  return [card.bpm ? `${card.bpm} BPM` : '', card.musicalKey].filter(Boolean).join(' · ')
}

/** An exclusive is sold once, so it is "Sold" — not "Sold out", which implies
    a restock. Everything else can be printed again. */
export function soldLabel(card: { licenseType: string | null }): string {
  return card.licenseType === 'exclusive' ? 'Sold' : 'Sold out'
}

/* --------------------------------------------------------------------------
   The card itself

   A link and only a link. The button that spends money lives on the product
   page, where the size, the quantity and the licence are all in view — a card
   that adds to a basket on one click is a card that adds the wrong size.
   -------------------------------------------------------------------------- */

export type ProductCardProps = {
  card: StoreCard
  /** The store's currency symbol, from the store_page row. */
  symbol: string
  imageSizes?: string
}

export function ProductCard({
  card,
  symbol,
  imageSizes = '(max-width: 560px) 92vw, (max-width: 1000px) 46vw, 31vw',
}: ProductCardProps) {
  const badge = cardBadge(card)
  const spec = card.kind === 'beat' ? beatSpec(card) : ''
  const reduced = card.compareAtCents !== null && card.compareAtCents > card.priceCents

  return (
    <Link
      href={productHref(card)}
      className="rel st-card"
      data-soldout={card.soldOut ? 'true' : 'false'}
    >
      <SmartImage
        image={card.image}
        alt={card.image?.alt || `${card.title} — product photograph`}
        sizes={imageSizes}
        className="rel__art"
        emptyLabel="No photograph yet"
      />

      <div className="rel__meta">
        {badge ? <span className="st-chip st-card__badge">{badge}</span> : null}

        <h3 className="rel__title">{card.title}</h3>
        {card.subtitle ? <p className="st-card__sub">{card.subtitle}</p> : null}
        {spec ? <p className="mono st-card__spec">{spec}</p> : null}

        <p className="mono st-card__price">
          {reduced && card.compareAtCents !== null ? (
            <>
              <span className="vh">Was </span>
              <s className="st-card__was">{formatMoney(card.compareAtCents, symbol)}</s>
              <span className="vh">, now </span>
            </>
          ) : null}
          <span className="st-card__now">{formatMoney(card.priceCents, symbol)}</span>
          {reduced ? <span className="st-chip st-chip--lit">Reduced</span> : null}
          {card.soldOut ? (
            <span className="st-chip st-chip--out">{soldLabel(card)}</span>
          ) : null}
        </p>

        {card.sizes.length > 0 ? (
          <ul className="st-card__sizes" aria-label="Sizes">
            {card.sizes.map((size) => (
              <li
                key={size.label}
                className="st-card__size"
                data-out={size.soldOut ? 'true' : 'false'}
              >
                {size.label}
                {size.soldOut ? <span className="vh"> — sold out</span> : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </Link>
  )
}

/** The grid every list of products uses, so the columns and the stagger are
    identical on the landing strip, the three listings and the filtered view. */
export function ProductGrid({
  cards,
  symbol,
  imageSizes,
}: {
  cards: StoreCard[]
  symbol: string
  imageSizes?: string
}) {
  return (
    <ul className="st-grid">
      {cards.map((card, i) => (
        // Staggered by column, not by absolute position: the last row of a
        // twelve-item grid should not wait two thirds of a second to arrive.
        <Reveal as="li" key={card.id} index={i % 3} className="st-grid__item">
          <ProductCard card={card} symbol={symbol} imageSizes={imageSizes} />
        </Reveal>
      ))}
    </ul>
  )
}
