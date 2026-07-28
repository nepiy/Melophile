'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { ProductGrid, type StoreCard } from '@/components/store/ProductCard'
import type { CartLine } from '@/lib/cart'
import { beatLicenseLabel, musicFormatLabel, pluralise } from '@/lib/format'

/* ==========================================================================
   The store's client island: the control that spends money, and the control
   that narrows a listing. Two components, one module, because the storefront
   ships a fixed set of client bundles and neither of these is big enough to
   deserve its own.

   THE RULE THE CART FILE EXISTS TO ENFORCE, RESTATED HERE BECAUSE THIS IS THE
   ONLY CODE THAT WRITES TO IT: the basket in localStorage holds ids, sizes and
   counts. It never holds a price. The server re-prices every line at checkout,
   so a price written here would be a price a customer could edit in devtools.

   CART_STORAGE_KEY and MAX_LINE_QUANTITY still come from '@/lib/cart' — but
   as props from the server page, not as an import. That module also owns
   priceCart(), which reads the database, so importing it here would drag
   better-sqlite3 into the browser bundle and the page would not build. The
   type is imported (and erased); the values arrive down the tree.
   ========================================================================== */

/* --------------------------------------------------------------------------
   Storage

   Safari in private mode throws on localStorage.getItem, quota can be full,
   and the stored value can be anything a previous version wrote. None of that
   is allowed to take the product page down, so every access is guarded and a
   failure to write is reported to the customer rather than swallowed.
   -------------------------------------------------------------------------- */

function readCart(key: string): CartLine[] {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as CartLine[]) : []
  } catch {
    return []
  }
}

function writeCart(key: string, lines: CartLine[]): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(lines))
    return true
  } catch {
    return false
  }
}

/* --------------------------------------------------------------------------
   Add to basket
   -------------------------------------------------------------------------- */

export type AddToCartProps = {
  /** The product row id. The only thing about the price that is stored. */
  id: number
  title: string
  /** Null means unlimited. 0 means gone. */
  stock: number | null
  /** Merch sizes. Empty for music and beats. */
  sizes: { label: string; soldOut: boolean }[]
  /** An exclusive licence is one sale, so the quantity is fixed at one. */
  exclusive: boolean
  soldOut: boolean
  /** CART_STORAGE_KEY, handed down by the server page. */
  storageKey: string
  /** MAX_LINE_QUANTITY, likewise. */
  maxQuantity: number
}

export function AddToCart({
  id,
  title,
  stock,
  sizes,
  exclusive,
  soldOut,
  storageKey,
  maxQuantity,
}: AddToCartProps) {
  const uid = useId()
  const sizeId = `atc-size-${uid}`
  const qtyId = `atc-qty-${uid}`

  const [size, setSize] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [added, setAdded] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  // The cap is whichever runs out first: the line limit, the shelf, or the
  // fact that an exclusive can only ever be sold once.
  const max = exclusive ? 1 : Math.max(1, Math.min(maxQuantity, stock ?? maxQuantity))

  const needsSize = sizes.length > 0
  const chosen = needsSize ? sizes.find((option) => option.label === size) : undefined
  const blocked = needsSize && (chosen === undefined || chosen.soldOut)

  const clamp = useCallback((value: number) => Math.min(max, Math.max(1, value)), [max])

  const add = useCallback(() => {
    if (soldOut || blocked) return

    const variant = needsSize ? size : ''
    const lines = readCart(storageKey)
    const index = lines.findIndex(
      (line) =>
        line.type === 'product' && line.id === id && (line.variant ?? '') === variant,
    )
    const existing = index >= 0 ? lines[index] : undefined

    // One line per item and size. A second line for the same thing would let
    // the quantity cap be walked around by adding it twice.
    if (existing) {
      lines[index] = {
        ...existing,
        quantity: Math.min(max, existing.quantity + quantity),
      }
    } else {
      lines.push({
        type: 'product',
        id,
        quantity,
        ...(variant ? { variant } : {}),
      })
    }

    if (!writeCart(storageKey, lines)) {
      setAdded(false)
      setError('Your browser is blocking storage, so the basket could not be saved.')
      setStatus('The basket could not be saved. Your browser is blocking storage.')
      return
    }

    // The cart badge in the nav is another component in another tree with no
    // shared state. This event is the contract between them.
    window.dispatchEvent(new CustomEvent('cart:changed'))

    setError('')
    setAdded(true)
    setStatus(
      `Added ${quantity} × ${title}${variant ? `, size ${variant}` : ''} to your basket.`,
    )
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setAdded(false), 2000)
  }, [blocked, id, max, needsSize, quantity, size, soldOut, storageKey, title])

  if (soldOut) {
    return (
      <div className="st-atc">
        <button type="button" className="btn st-atc__go" disabled>
          {exclusive ? 'Sold' : 'Sold out'}
        </button>
        <p className="st-atc__note mono">
          {exclusive
            ? 'An exclusive licence is sold once, and this one has been. The lease is still available.'
            : 'This one has gone. Ask us about a repress from the contact page.'}
        </p>
      </div>
    )
  }

  return (
    <div className="st-atc">
      {needsSize ? (
        <div className="st-atc__field">
          <label className="label" htmlFor={sizeId}>
            Size
          </label>
          <span className="st-atc__select-wrap" data-active={size !== ''}>
            <select
              id={sizeId}
              className="mono st-atc__select"
              value={size}
              required
              onChange={(event) => setSize(event.target.value)}
            >
              <option value="">Choose a size</option>
              {sizes.map((option) => (
                <option key={option.label} value={option.label} disabled={option.soldOut}>
                  {option.soldOut ? `${option.label} — sold out` : option.label}
                </option>
              ))}
            </select>
            <svg className="st-atc__chev" viewBox="0 0 10 6" aria-hidden="true">
              <path d="M1 1 5 5 9 1" stroke="currentColor" strokeWidth="1" />
            </svg>
          </span>
        </div>
      ) : null}

      <div className="st-atc__row">
        <div className="st-atc__field">
          <label className="label" htmlFor={qtyId}>
            Quantity
          </label>
          <div className="st-atc__qty">
            <button
              type="button"
              className="st-atc__step"
              onClick={() => setQuantity((value) => clamp(value - 1))}
              disabled={quantity <= 1}
              aria-label="One fewer"
            >
              <span aria-hidden="true">−</span>
            </button>
            <input
              id={qtyId}
              className="st-atc__num"
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
              className="st-atc__step"
              onClick={() => setQuantity((value) => clamp(value + 1))}
              disabled={quantity >= max}
              aria-label="One more"
            >
              <span aria-hidden="true">+</span>
            </button>
          </div>
        </div>

        <button
          type="button"
          className="btn btn--solid st-atc__go"
          onClick={add}
          disabled={blocked}
        >
          {added ? 'Added' : 'Add to basket'}
        </button>
      </div>

      {blocked ? <p className="st-atc__note mono">Pick a size to continue.</p> : null}

      {exclusive ? (
        <p className="st-atc__note mono">
          An exclusive licence is sold once. Buy it and the beat comes off the store.
        </p>
      ) : null}

      {!exclusive && stock !== null && stock > 0 && stock <= 5 ? (
        <p className="st-atc__note mono">Only {stock} left.</p>
      ) : null}

      {error ? <p className="st-atc__error mono">{error}</p> : null}

      {/* Polite, so the confirmation lands after the press rather than over it.
          The button label alone changes nothing a screen reader would report. */}
      <p className="vh" role="status" aria-live="polite">
        {status}
      </p>
    </div>
  )
}

/* --------------------------------------------------------------------------
   The listing, and its one filter

   The whole published section arrives from the server once and the filter is a
   pass over that array — no refetch, no navigation, no loading state, the same
   contract /music's catalogue keeps. Options are derived from the products
   themselves and carry their own counts, so a filter can never offer a dead
   end, and the strip disappears entirely when there is only one thing to pick.
   -------------------------------------------------------------------------- */

const FORMAT_ORDER = ['album', 'ep', 'mixtape', 'single'] as const
const LICENSE_ORDER = ['lease', 'exclusive'] as const

export type StoreListingProps = {
  cards: StoreCard[]
  /** Which column the strip filters on. Merch passes 'none' and gets no strip. */
  facet: 'none' | 'format' | 'license'
  symbol: string
  imageSizes?: string
}

export function StoreListing({ cards, facet, symbol, imageSizes }: StoreListingProps) {
  const [value, setValue] = useState('all')
  const uid = useId()
  const legendId = `st-flt-${uid}`

  const valueOf = useCallback(
    (card: StoreCard) =>
      facet === 'format'
        ? card.musicFormat
        : facet === 'license'
          ? card.licenseType
          : null,
    [facet],
  )

  const options = useMemo(() => {
    if (facet === 'none') return []
    const vocabulary = facet === 'format' ? FORMAT_ORDER : LICENSE_ORDER
    const label = (raw: string) =>
      facet === 'format' ? musicFormatLabel(raw) : beatLicenseLabel(raw)

    const found = vocabulary
      .map((raw) => ({
        value: raw as string,
        label: label(raw),
        count: cards.filter((card) => valueOf(card) === raw).length,
      }))
      .filter((option) => option.count > 0)

    // One option is not a choice, so the whole strip stays off the page.
    if (found.length < 2) return []
    return [{ value: 'all', label: 'All', count: cards.length }, ...found]
  }, [cards, facet, valueOf])

  const filtered = useMemo(
    () => (value === 'all' ? cards : cards.filter((card) => valueOf(card) === value)),
    [cards, value, valueOf],
  )

  return (
    <>
      {options.length > 0 ? (
        <div className="st-flt">
          <div className="st-flt__group">
            <span className="label st-flt__legend" id={legendId}>
              {facet === 'format' ? 'Format' : 'Licence'}
            </span>
            {/* Single-select, so each cell reports its own pressed state rather
                than pretending to be an independent toggle. */}
            <div className="st-flt__set" role="group" aria-labelledby={legendId}>
              {options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className="st-flt__btn"
                  aria-pressed={value === option.value}
                  onClick={() => setValue(option.value)}
                >
                  {option.label}
                  <span className="st-flt__n">{option.count}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="st-flt__end">
            {value !== 'all' ? (
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => setValue('all')}
              >
                Clear filter
              </button>
            ) : null}
            <p className="mono st-flt__count" aria-live="polite">
              {filtered.length} {pluralise(filtered.length, 'item')}
            </p>
          </div>
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <div className="empty st-none">
          <p className="empty__title">Nothing matches that filter</p>
          <p className="empty__text">
            Clear it to see everything in this part of the store.
          </p>
          <button
            type="button"
            className="btn st-none__reset"
            onClick={() => setValue('all')}
          >
            Clear filter
          </button>
        </div>
      ) : (
        <ProductGrid cards={filtered} symbol={symbol} imageSizes={imageSizes} />
      )}
    </>
  )
}
