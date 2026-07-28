'use server'

import { priceCart, type CartLine, type PricedCart } from '@/lib/cart'

/* ==========================================================================
   The one door between the basket in the browser and the money on the server.

   localStorage holds ids, sizes and counts. It never holds a price. The cart
   page still has to show totals, so it asks for them — and this is how it
   asks, because importing priceCart() directly from a 'use client' component
   would drag the database, and therefore better-sqlite3 and `fs`, into the
   browser bundle and the build would fail.

   Nothing else belongs in this file. It is a wrapper, not a place for logic:
   every rule about what a line costs lives in src/lib/cart.ts and runs once,
   here, on the server, where a customer cannot edit it.

   The argument is untrusted — it comes from a browser and could be anything.
   priceCart() runs normaliseLines() over it before it reaches a query.
   ========================================================================== */

export async function priceCartAction(lines: CartLine[]): Promise<PricedCart> {
  return priceCart(lines)
}
