'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { productHref } from '@/components/store/ProductCard'
import { priceCartAction } from '@/lib/actions/cart-price'
import type { PricedCart, PricedLine } from '@/lib/cart'
import {
  CART_CHANGED_EVENT,
  CART_STORAGE_KEY,
  MAX_LINE_QUANTITY,
  normaliseLines,
  readCart,
  writeCart,
  type CartLine,
} from '@/lib/cart-types'
import { formatMoney } from '@/lib/format'

/* ==========================================================================
   The basket.

   THE RULE, AND THE REASON THIS COMPONENT IS SHAPED THE WAY IT IS: no price is
   ever computed in the browser. Not the line total, not the subtotal, not even
   for display. localStorage holds `{type, id, quantity, variant}` and nothing
   else; every amount on this page arrives from priceCartAction(), which runs
   priceCart() on the server against the live database.

   So the loop is: read localStorage → ask the server what it costs → render
   what the server said. Change a quantity and the loop runs again. There is
   deliberately no arithmetic anywhere in this file — a `unitPrice * quantity`
   here would be a number a customer could make say anything by editing the
   basket in devtools, and it would silently disagree with the server the
   moment a price changed mid-session.

   '@/lib/cart' is imported for TYPES ONLY. The type import is erased at
   compile time; the value import would pull better-sqlite3 into the bundle and
   the build would fail with "Can't resolve 'fs'".
   ========================================================================== */

export type CartViewProps = {
  /** storePage.shippingNote — the client's words about postage. */
  shippingNote: string
  /** True when Stripe sent them back here after abandoning the payment page. */
  cancelled?: boolean
}

/** Identity of a basket line: the item, and which size of it. */
function keyOf(line: { type: string; id: number; variant?: string | null }): string {
  return `${line.type}:${line.id}:${line.variant ?? ''}`
}

/** Cheap structural compare, so a storage event we caused does not re-price. */
function sameCart(a: CartLine[], b: CartLine[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/** Back to where it was bought. Tickets live under /events, everything else in the store. */
function lineHref(line: PricedLine): string {
  if (line.type === 'product' && line.kind !== 'ticket') {
    return productHref({ kind: line.kind, slug: line.slug })
  }
  return `/events/${line.slug}`
}

export function CartView({ shippingNote, cancelled = false }: CartViewProps) {
  // null until the first read. localStorage does not exist on the server, so
  // rendering anything basket-shaped before mount is a hydration mismatch.
  const [lines, setLines] = useState<CartLine[] | null>(null)
  const [cart, setCart] = useState<PricedCart | null>(null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const [section, setSection] = useState('all')

  /* ---- read the basket, and keep reading it ---- */

  useEffect(() => {
    const sync = () => {
      const next = readCart()
      // Same contents means the same reference, which means the pricing effect
      // below does not run again. Without this, our own writeCart() would
      // bounce off the event listener and price the basket twice per click.
      setLines((prev) => (prev && sameCart(prev, next) ? prev : next))
    }
    sync()

    const onChanged = () => sync()
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

  /* ---- ask the server what it costs ---- */

  useEffect(() => {
    if (lines === null) return

    // An empty basket needs no prices, so it does not ask for any.
    if (lines.length === 0) {
      setCart(null)
      setBusy(false)
      setFailed(false)
      return
    }

    let live = true
    setBusy(true)
    setFailed(false)

    priceCartAction(lines)
      .then((priced) => {
        if (!live) return
        setCart(priced)
        setBusy(false)
      })
      .catch(() => {
        if (!live) return
        // No prices is not "£0" — it is no prices. The totals stay hidden and
        // checkout stays shut rather than showing a number we cannot stand up.
        setFailed(true)
        setBusy(false)
      })

    return () => {
      live = false
    }
  }, [lines])

  /* ---- writes ---- */

  const commit = useCallback((next: CartLine[]) => {
    const clean = normaliseLines(next)
    // writeCart normalises again and dispatches CART_CHANGED_EVENT, which the
    // nav badge listens to. If storage is blocked it returns false, and the
    // page says so rather than pretending the change landed.
    setBlocked(!writeCart(clean))
    setLines(clean)
  }, [])

  const setQuantity = useCallback(
    (key: string, quantity: number) => {
      const clamped = Math.max(1, Math.min(MAX_LINE_QUANTITY, quantity))
      commit(
        (lines ?? []).map((line) =>
          keyOf(line) === key ? { ...line, quantity: clamped } : line,
        ),
      )
    },
    [commit, lines],
  )

  const remove = useCallback(
    (key: string) => {
      commit((lines ?? []).filter((line) => keyOf(line) !== key))
    },
    [commit, lines],
  )

  /* ---- pre-mount: render the same nothing the server rendered ---- */

  if (lines === null) {
    return (
      <div className="bsk__wait mono" role="status" aria-live="polite">
        Reading your basket…
      </div>
    )
  }

  /* ---- empty ---- */

  if (lines.length === 0) {
    return (
      <div className="empty bsk__empty">
        {cancelled ? (
          <p className="mono bsk__empty-note">
            Payment was cancelled. Nothing was charged.
          </p>
        ) : null}
        <p className="empty__title">Your basket is empty</p>
        <p className="empty__text">Everything in the store is one click from here.</p>
        <Link href="/store" className="btn bsk__empty-go">
          Go to the store
        </Link>
      </div>
    )
  }

  const symbol = cart?.symbol ?? '£'
  const priced = new Map((cart?.lines ?? []).map((line) => [keyOf(line), line]))
  const issues = cart?.issues ?? []
  const stuck = issues.length > 0 || failed
  const groupFor = (line: CartLine) => priced.get(keyOf(line))?.kind ?? 'other'
  const groups = Array.from(new Set(lines.map(groupFor)))
  const groupLabel: Record<string, string> = {
    beat: 'Beats',
    music: 'Music',
    merch: 'Merch',
    ticket: 'Tickets',
    other: 'Other',
  }
  const visibleLines =
    section === 'all' ? lines : lines.filter((line) => groupFor(line) === section)

  return (
    <div className="bsk">
      {cancelled ? (
        <p className="bsk__notice mono">
          Payment was cancelled. Your basket is untouched.
        </p>
      ) : null}

      {/* Blocking problems. Not a per-line warning — nothing can be bought
          until one of these is dealt with, so it sits above everything. */}
      {issues.length > 0 ? (
        <div className="bsk__alert" role="alert">
          <p className="label bsk__alert-label">Needs a change</p>
          <ul className="bsk__alert-list">
            {issues.map((issue) => (
              <li key={issue} className="bsk__alert-text">
                {issue}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {failed ? (
        <div className="bsk__alert" role="alert">
          <p className="label bsk__alert-label">No prices</p>
          <p className="bsk__alert-text">
            We could not reach the price list. Reload the page to try again — your basket
            is still here.
          </p>
        </div>
      ) : null}

      {blocked ? (
        <div className="bsk__alert" role="alert">
          <p className="label bsk__alert-label">Not saved</p>
          <p className="bsk__alert-text">
            Your browser is blocking storage, so that change was not kept.
          </p>
        </div>
      ) : null}

      <nav className="bsk__sections" aria-label="Basket sections">
        <button
          type="button"
          className="label bsk__section"
          aria-current={section === 'all' ? 'page' : undefined}
          onClick={() => setSection('all')}
        >
          All <span>{lines.length}</span>
        </button>
        {groups.map((group) => (
          <button
            key={group}
            type="button"
            className="label bsk__section"
            aria-current={section === group ? 'page' : undefined}
            onClick={() => setSection(group)}
          >
            {groupLabel[group] ?? group}{' '}
            <span>{lines.filter((line) => groupFor(line) === group).length}</span>
          </button>
        ))}
      </nav>

      <ul className="bsk__lines">
        {visibleLines.map((line) => {
          const key = keyOf(line)
          const row = priced.get(key)

          // In the basket but no longer priceable — unpublished or deleted
          // since it went in. It still gets a row, because a line you cannot
          // see is a line you cannot remove, and the blocking issue above
          // tells them to remove it.
          if (!row) {
            return (
              <li key={key} className="bsk__line bsk__line--gone">
                <span className="bsk__thumb bsk__thumb--empty" aria-hidden="true" />
                <div className="bsk__body">
                  <p className="bsk__title">This item is no longer for sale</p>
                  <p className="bsk__sub">Remove it and the rest can go through.</p>
                </div>
                <div className="bsk__ctrl">
                  <button
                    type="button"
                    className="bsk__remove mono"
                    onClick={() => remove(key)}
                  >
                    Remove
                    <span className="vh"> the item that is no longer for sale</span>
                  </button>
                </div>
              </li>
            )
          }

          const soldOut = row.quantity <= 0

          // The stepper shows what they asked for, so a press lands instantly
          // instead of snapping back while the server is re-pricing. The money
          // beside it is the server's — and when the two disagree because
          // stock ran short, row.issue is the sentence that says why.
          const asked = line.quantity

          return (
            <li key={key} className="bsk__line">
              {row.imagePath ? (
                <span className="bsk__thumb">
                  <Image
                    src={row.imagePath}
                    alt={row.imageAlt || ''}
                    fill
                    sizes="(max-width: 760px) 64px, 88px"
                    className="bsk__img"
                  />
                </span>
              ) : (
                <span className="bsk__thumb bsk__thumb--empty" aria-hidden="true" />
              )}

              <div className="bsk__body">
                <p className="bsk__title">
                  <Link href={lineHref(row)} className="bsk__link">
                    {row.title}
                  </Link>
                </p>
                {row.variant ? (
                  <p className="mono bsk__variant">Size {row.variant}</p>
                ) : null}
                {row.subtitle ? <p className="bsk__sub">{row.subtitle}</p> : null}
                <p className="mono bsk__unit">
                  {/* Straight from the server. Never unit × quantity. */}
                  {formatMoney(row.unitPriceCents, symbol)} each
                </p>
              </div>

              <div className="bsk__ctrl">
                {soldOut ? (
                  <span className="mono bsk__gone">Sold out</span>
                ) : (
                  <div className="bsk__qty">
                    <button
                      type="button"
                      className="bsk__step"
                      onClick={() => setQuantity(key, asked - 1)}
                      disabled={asked <= 1}
                      aria-label={`One fewer ${row.title}`}
                    >
                      <span aria-hidden="true">−</span>
                    </button>
                    <input
                      className="bsk__num"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={MAX_LINE_QUANTITY}
                      step={1}
                      value={asked}
                      aria-label={`Quantity of ${row.title}`}
                      onChange={(event) => {
                        const next = Number.parseInt(event.target.value, 10)
                        if (Number.isFinite(next)) setQuantity(key, next)
                      }}
                    />
                    <button
                      type="button"
                      className="bsk__step"
                      onClick={() => setQuantity(key, asked + 1)}
                      disabled={asked >= MAX_LINE_QUANTITY}
                      aria-label={`One more ${row.title}`}
                    >
                      <span aria-hidden="true">+</span>
                    </button>
                  </div>
                )}

                <p className="mono bsk__total">
                  <span className="vh">Line total </span>
                  {formatMoney(row.lineTotalCents, symbol)}
                </p>

                <button
                  type="button"
                  className="bsk__remove mono"
                  onClick={() => remove(key)}
                >
                  Remove
                  <span className="vh"> {row.title}</span>
                </button>
              </div>

              {/* A warning about this line only. The line still buys. */}
              {row.issue ? <p className="bsk__issue">{row.issue}</p> : null}
            </li>
          )
        })}
      </ul>

      <div className="bsk__foot">
        <div className="bsk__sums">
          <p className="mono bsk__busy" role="status" aria-live="polite">
            {busy ? 'Updating…' : ''}
          </p>

          {cart ? (
            <dl className="bsk__rows" aria-busy={busy}>
              <div className="bsk__row">
                <dt className="label bsk__k">Subtotal</dt>
                <dd className="mono bsk__v">{formatMoney(cart.subtotalCents, symbol)}</dd>
              </div>

              <div className="bsk__row">
                <dt className="label bsk__k">Postage</dt>
                <dd className="mono bsk__v">
                  {cart.hasPhysical ? (
                    formatMoney(cart.shippingCents, symbol)
                  ) : (
                    <span className="bsk__v-note">
                      No postage — everything here is a download
                    </span>
                  )}
                </dd>
              </div>

              <div className="bsk__row bsk__row--total">
                <dt className="label bsk__k">Total</dt>
                <dd className="mono bsk__v bsk__v--total">
                  {formatMoney(cart.totalCents, symbol)}
                </dd>
              </div>
            </dl>
          ) : null}

          {shippingNote ? <p className="bsk__note">{shippingNote}</p> : null}
        </div>

        <div className="bsk__go">
          {/* Blocked means blocked: a link cannot be disabled, so when the
              basket cannot be bought there is no link to press. */}
          {stuck ? (
            <button type="button" className="btn btn--solid" disabled>
              Checkout
            </button>
          ) : (
            <Link href="/checkout" className="btn btn--solid">
              Checkout
            </Link>
          )}
          <Link href="/store" className="btn btn--ghost">
            Keep looking
          </Link>
        </div>
      </div>
    </div>
  )
}
