/* ==========================================================================
   Cart types and constants — the half of the cart that is safe on the client.

   This file exists because src/lib/cart.ts has to import the database to price
   a basket, and the database pulls in better-sqlite3, which pulls in `fs`.
   Importing any of that from a 'use client' component fails the build with
   "Can't resolve 'fs'". Splitting the pure values out means the browser and the
   server share one definition of a cart line instead of two that can drift.

   Nothing here touches the database, and nothing here is a price. The browser
   stores ids and quantities; every amount is computed server-side in cart.ts.
   ========================================================================== */

export const CART_STORAGE_KEY = 'melophile-cart-v1'
export const MAX_LINE_QUANTITY = 10

/** Broadcast after every write so the nav badge can update without a reload. */
export const CART_CHANGED_EVENT = 'cart:changed'

/** Broadcast by a preview player so the others stop. detail = the player's id. */
export const PREVIEW_PLAY_EVENT = 'preview:play'

/** What the browser stores. Ids and counts — deliberately no money. */
export type CartLine = {
  /** 'product' covers merch, music and beats; 'ticket' is an event. */
  type: 'product' | 'ticket'
  id: number
  quantity: number
  /** Merch size, e.g. 'L'. Empty or absent for everything else. */
  variant?: string
}

/**
 * Drops nonsense before it reaches the database — and before it is trusted in
 * the browser. Shared by both sides so the rules cannot disagree.
 */
export function normaliseLines(input: unknown): CartLine[] {
  if (!Array.isArray(input)) return []
  const out: CartLine[] = []
  const seen = new Set<string>()

  for (const raw of input.slice(0, 50)) {
    if (typeof raw !== 'object' || raw === null) continue
    const line = raw as Record<string, unknown>
    const type = line.type === 'ticket' ? 'ticket' : 'product'
    const id = Number(line.id)
    const quantity = Math.trunc(Number(line.quantity))
    const variant = typeof line.variant === 'string' ? line.variant.slice(0, 60) : ''

    if (!Number.isInteger(id) || id <= 0) continue
    if (!Number.isFinite(quantity) || quantity <= 0) continue

    // One line per item+variant. Two lines for the same thing would let a
    // quantity cap be walked around by adding the item twice.
    const key = `${type}:${id}:${variant}`
    if (seen.has(key)) continue
    seen.add(key)

    out.push({
      type,
      id,
      quantity: Math.min(MAX_LINE_QUANTITY, quantity),
      ...(variant ? { variant } : {}),
    })
  }
  return out
}

/** Reads the cart from localStorage. Returns [] on anything unexpected. */
export function readCart(): CartLine[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(CART_STORAGE_KEY)
    if (!raw) return []
    return normaliseLines(JSON.parse(raw))
  } catch {
    // Safari private mode throws on localStorage. An unreadable cart is an
    // empty cart, never a crashed page.
    return []
  }
}

/** Writes the cart and tells the rest of the page. Returns false if blocked. */
export function writeCart(lines: CartLine[]): boolean {
  if (typeof window === 'undefined') return false
  try {
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(normaliseLines(lines)))
    window.dispatchEvent(new CustomEvent(CART_CHANGED_EVENT))
    return true
  } catch {
    return false
  }
}

/** Total number of items, for the nav badge. */
export function countItems(lines: CartLine[]): number {
  return lines.reduce((sum, line) => sum + line.quantity, 0)
}
