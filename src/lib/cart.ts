import { inArray } from 'drizzle-orm'
import { db, events, products, type OrderItemKind } from '@/db'
import { normaliseLines, type CartLine } from './cart-types'
import { getStorePage } from '@/lib/store-data'

/* ==========================================================================
   The cart.

   THE RULE THIS FILE EXISTS TO ENFORCE: a price never comes from the browser.
   The cart in localStorage holds ids and quantities and nothing else. Every
   amount is looked up from the database again at price time and again at
   checkout. A cart that carries its own prices is a cart a customer can edit
   with devtools and buy a hoodie for a penny.
   ========================================================================== */

export {
  CART_STORAGE_KEY,
  MAX_LINE_QUANTITY,
  CART_CHANGED_EVENT,
  PREVIEW_PLAY_EVENT,
  normaliseLines,
  type CartLine,
} from './cart-types'

/** One basket line with its money worked out. Server-side only. */
export type PricedLine = {
  type: 'product' | 'ticket'
  id: number
  kind: OrderItemKind
  slug: string
  title: string
  subtitle: string
  variant: string
  unitPriceCents: number
  quantity: number
  lineTotalCents: number
  imagePath: string | null
  imageAlt: string
  digital: boolean
  /** Set when the line cannot be bought as asked. The line still renders. */
  issue: string | null
}

export type PricedCart = {
  lines: PricedLine[]
  subtotalCents: number
  shippingCents: number
  totalCents: number
  currency: string
  symbol: string
  /** True when anything in the basket has to be posted. */
  hasPhysical: boolean
  /** True when every line is a download — no address needed. */
  digitalOnly: boolean
  itemCount: number
  /** Blocking problems. A cart with any of these cannot check out. */
  issues: string[]
}

/**
 * Turns ids into money, reading everything fresh.
 *
 * Never throws on a bad line: an item that has sold out or been unpublished
 * since it went in the basket comes back with an `issue` so the cart page can
 * explain it, rather than vanishing without a word.
 */
export async function priceCart(lines: CartLine[]): Promise<PricedCart> {
  const clean = normaliseLines(lines)
  const settings = await getStorePage()

  const empty: PricedCart = {
    lines: [],
    subtotalCents: 0,
    shippingCents: 0,
    totalCents: 0,
    currency: settings.currency,
    symbol: settings.currencySymbol,
    hasPhysical: false,
    digitalOnly: true,
    itemCount: 0,
    issues: [],
  }

  if (clean.length === 0) return empty

  const productIds = clean.filter((l) => l.type === 'product').map((l) => l.id)
  const eventIds = clean.filter((l) => l.type === 'ticket').map((l) => l.id)

  const [productRows, eventRows] = await Promise.all([
    productIds.length
      ? db.query.products.findMany({
          where: inArray(products.id, productIds),
          with: { image: true },
        })
      : Promise.resolve([]),
    eventIds.length
      ? db.query.events.findMany({
          where: inArray(events.id, eventIds),
          with: { image: true },
        })
      : Promise.resolve([]),
  ])

  const productById = new Map(productRows.map((r) => [r.id, r]))
  const eventById = new Map(eventRows.map((r) => [r.id, r]))

  const priced: PricedLine[] = []
  const issues: string[] = []

  for (const line of clean) {
    if (line.type === 'product') {
      const product = productById.get(line.id)
      if (!product || product.status !== 'published') {
        issues.push(
          'An item in your basket is no longer for sale. Remove it to continue.',
        )
        continue
      }

      let quantity = line.quantity
      let issue: string | null = null

      if (product.stock !== null) {
        if (product.stock <= 0) {
          issue = 'Sold out.'
          quantity = 0
        } else if (quantity > product.stock) {
          quantity = product.stock
          issue = `Only ${product.stock} left — the quantity has been reduced.`
        }
      }

      // An exclusive licence is by definition a single sale.
      if (product.licenseType === 'exclusive' && quantity > 1) {
        quantity = 1
        issue = 'An exclusive licence is sold once, so the quantity is one.'
      }

      if (quantity === 0) {
        issues.push(`${product.title} is sold out. Remove it to continue.`)
      }

      priced.push({
        type: 'product',
        id: product.id,
        kind: product.kind,
        slug: product.slug,
        title: product.title,
        subtitle: product.subtitle,
        variant: line.variant ?? '',
        unitPriceCents: product.priceCents,
        quantity,
        lineTotalCents: product.priceCents * quantity,
        imagePath: product.image?.path ?? null,
        imageAlt: product.image?.alt ?? '',
        digital: product.digital,
        issue,
      })
      continue
    }

    const event = eventById.get(line.id)
    if (!event || event.status !== 'published') {
      issues.push('An event in your basket is no longer on sale. Remove it to continue.')
      continue
    }

    const left =
      event.capacity === null ? null : Math.max(0, event.capacity - event.ticketsSold)
    let quantity = line.quantity
    let issue: string | null = null

    if (left !== null) {
      if (left <= 0) {
        issue = 'Sold out.'
        quantity = 0
        issues.push(`${event.title} has sold out. Remove it to continue.`)
      } else if (quantity > left) {
        quantity = left
        issue = `Only ${left} ${left === 1 ? 'ticket' : 'tickets'} left — the quantity has been reduced.`
      }
    }

    priced.push({
      type: 'ticket',
      id: event.id,
      kind: 'ticket',
      slug: event.slug,
      title: event.title,
      subtitle: event.venue,
      variant: '',
      unitPriceCents: event.priceCents,
      quantity,
      lineTotalCents: event.priceCents * quantity,
      imagePath: event.image?.path ?? null,
      imageAlt: event.image?.alt ?? '',
      digital: true, // a ticket is emailed, never posted
      issue,
    })
  }

  const subtotalCents = priced.reduce((sum, l) => sum + l.lineTotalCents, 0)
  const hasPhysical = priced.some((l) => !l.digital && l.quantity > 0)
  const shippingCents = hasPhysical ? settings.shippingCents : 0

  return {
    lines: priced,
    subtotalCents,
    shippingCents,
    totalCents: subtotalCents + shippingCents,
    currency: settings.currency,
    symbol: settings.currencySymbol,
    hasPhysical,
    digitalOnly: !hasPhysical,
    itemCount: priced.reduce((sum, l) => sum + l.quantity, 0),
    issues: [...new Set(issues)],
  }
}
