'use client'

import Link from 'next/link'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { MAX_LINE_QUANTITY, readCart, writeCart } from '@/lib/cart-types'
import { pluralise } from '@/lib/format'

/* ==========================================================================
   The control that spends money on a ticket. Same contract as the store's
   AddToCart, and deliberately the same shape so the two behave identically.

   WHAT THE BASKET HOLDS: { type: 'ticket', id, quantity }. No price, ever. The
   server re-prices every line at checkout against the live event row, so a
   price written here would be a price a customer could edit in devtools — and
   a price that silently disagreed with the server the moment the label changed
   it mid-session.

   Everything imported here comes from '@/lib/cart-types', the client-safe half
   of the cart. '@/lib/cart' reads the database to price a basket, so importing
   it from a 'use client' file drags better-sqlite3 into the browser bundle and
   the build fails on 'fs'.
   ========================================================================== */

export type TicketPickerProps = {
  /** The event row id — the only thing about this purchase that is stored. */
  eventId: number
  title: string
  /** Null when the event is uncapped. Otherwise the cap on this line. */
  ticketsLeft: number | null
}

export function TicketPicker({ eventId, title, ticketsLeft }: TicketPickerProps) {
  const uid = useId()
  const qtyId = `tp-qty-${uid}`

  const [quantity, setQuantity] = useState(1)
  const [added, setAdded] = useState(false)
  const [everAdded, setEverAdded] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  // Whichever runs out first: the line limit, or the room.
  const max = Math.max(1, Math.min(MAX_LINE_QUANTITY, ticketsLeft ?? MAX_LINE_QUANTITY))
  const clamp = useCallback((value: number) => Math.min(max, Math.max(1, value)), [max])

  const add = useCallback(() => {
    const lines = readCart()
    const index = lines.findIndex((line) => line.type === 'ticket' && line.id === eventId)
    const existing = index >= 0 ? lines[index] : undefined

    // One line per event. A second line for the same date would let the cap be
    // walked around by pressing this twice.
    if (existing) {
      lines[index] = {
        ...existing,
        quantity: Math.min(max, existing.quantity + quantity),
      }
    } else {
      lines.push({ type: 'ticket', id: eventId, quantity })
    }

    // writeCart broadcasts CART_CHANGED_EVENT itself, so the nav badge updates
    // without this component knowing the badge exists.
    if (!writeCart(lines)) {
      setAdded(false)
      setError('Your browser is blocking storage, so the basket could not be saved.')
      setStatus('The basket could not be saved. Your browser is blocking storage.')
      return
    }

    setError('')
    setAdded(true)
    setEverAdded(true)
    setStatus(
      `Added ${quantity} ${pluralise(quantity, 'ticket')} for ${title} to your basket.`,
    )
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setAdded(false), 2000)
  }, [eventId, max, quantity, title])

  return (
    <div className="ev-tp">
      <div className="ev-tp__row">
        <div className="ev-tp__field">
          <label className="label" htmlFor={qtyId}>
            Tickets
          </label>
          {/* A real number input between two buttons: the value can be typed,
              and a change is announced without any help from us. */}
          <div className="ev-tp__qty">
            <button
              type="button"
              className="ev-tp__step"
              onClick={() => setQuantity((value) => clamp(value - 1))}
              disabled={quantity <= 1}
              aria-label="One fewer"
            >
              <span aria-hidden="true">−</span>
            </button>
            <input
              id={qtyId}
              className="ev-tp__num"
              type="number"
              inputMode="numeric"
              min={1}
              max={max}
              step={1}
              value={quantity}
              readOnly={max === 1}
              onChange={(event) => {
                const next = Number.parseInt(event.target.value, 10)
                setQuantity(Number.isFinite(next) ? clamp(next) : 1)
              }}
              onBlur={(event) => {
                if (event.target.value === '') setQuantity(1)
              }}
            />
            <button
              type="button"
              className="ev-tp__step"
              onClick={() => setQuantity((value) => clamp(value + 1))}
              disabled={quantity >= max}
              aria-label="One more"
            >
              <span aria-hidden="true">+</span>
            </button>
          </div>
        </div>

        <button type="button" className="btn btn--solid ev-tp__go" onClick={add}>
          {added ? 'Added' : 'Add to basket'}
        </button>
      </div>

      {/* Only once there is something to go and look at. */}
      {everAdded && !error ? (
        <Link href="/cart" className="btn btn--ghost ev-tp__cart">
          Go to basket
        </Link>
      ) : null}

      {error ? <p className="mono ev-tp__error">{error}</p> : null}

      {/* Polite, so the confirmation lands after the press rather than over it.
          The button label alone changes nothing a screen reader would report. */}
      <p className="vh" role="status" aria-live="polite">
        {status}
      </p>
    </div>
  )
}
