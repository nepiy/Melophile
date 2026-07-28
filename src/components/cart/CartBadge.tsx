'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import {
  CART_CHANGED_EVENT,
  CART_STORAGE_KEY,
  countItems,
  readCart,
} from '@/lib/cart-types'

/* ==========================================================================
   The basket count for the nav.

   Three things this has to get right, and all three are about the basket
   living in localStorage rather than on the server:

     1. IT RENDERS NOTHING UNTIL MOUNTED. The server has no localStorage, so
        the server's answer is always "no basket". Rendering a count on the
        first client pass would be a hydration mismatch — React would warn and
        then throw the server's markup away. `count === null` is the pre-mount
        state and it is deliberate, not a loading spinner.
     2. It listens for CART_CHANGED_EVENT, which every write dispatches, so
        pressing "Add to basket" three sections down updates this immediately
        with no shared state and no reload.
     3. It listens for 'storage' too. That event only fires in OTHER tabs, so
        it is the only way a second tab stays in step with the first.

   It does not import '@/lib/cart' — that module reads the database. Everything
   here comes from '@/lib/cart-types', which is the client-safe half.
   ========================================================================== */

export type CartBadgeProps = {
  /** The nav's word for it. Passed in so the label stays the client's copy. */
  label?: string
  className?: string
}

export function CartBadge({ label = 'Basket', className }: CartBadgeProps) {
  // null means "not mounted yet" — see rule 1 above.
  const [count, setCount] = useState<number | null>(null)

  useEffect(() => {
    const sync = () => setCount(countItems(readCart()))
    sync()

    // Fired by writeCart() in this tab.
    const onChanged = () => sync()

    // Fired by other tabs only. key is null when storage was cleared wholesale.
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === CART_STORAGE_KEY) sync()
    }

    window.addEventListener(CART_CHANGED_EVENT, onChanged)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(CART_CHANGED_EVENT, onChanged)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  if (count === null) return null

  return (
    <Link
      href="/cart"
      className={['cbg', className].filter(Boolean).join(' ')}
      data-filled={count > 0 ? 'true' : 'false'}
    >
      <span className="label cbg__word">{label}</span>
      <span className="mono cbg__n" aria-hidden="true">
        {count}
      </span>
      <span className="vh">
        {count === 0 ? ', empty' : `, ${count} ${count === 1 ? 'item' : 'items'}`}
      </span>
    </Link>
  )
}
