import type { Metadata } from 'next'
import Link from 'next/link'
import { DangerButton, OrderButtons } from '@/components/admin/fields'
import { SmartImage } from '@/components/site/SmartImage'
import { PRODUCT_KINDS, type ProductKind } from '@/db'
import { deleteProduct, moveProduct, setProductStatus } from '@/lib/actions/store'
import {
  getStorePageForEdit,
  listProducts,
  productCounts,
} from '@/lib/admin-store-queries'
import { formatMoney, pluralise, productKindLabel } from '@/lib/format'
import { requireAdmin } from '@/lib/session'

import '@/styles/admin-store.css'

/* ==========================================================================
   The store, as the client operates it.

   One row per item — merch, music and beats in one list, drafts included, in
   the order the storefront shows them. Everything that can be done without
   opening an item is on the row: move it, publish it, delete it.

   The kind filter is a query string, not JS, so a filtered list can be
   bookmarked and the back button does what it looks like it does. The counts
   next to each tab are live, which is the only honest way to show a filter
   that can be empty while the store is not.
   ========================================================================== */

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Store',
  robots: { index: false, follow: false },
}

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const TABS: { value: ProductKind | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'merch', label: 'Merch' },
  { value: 'music', label: 'Music' },
  { value: 'beat', label: 'Beats' },
]

const KIND_VALUES: readonly string[] = PRODUCT_KINDS

function readKind(raw: string | string[] | undefined): ProductKind | null {
  const value = Array.isArray(raw) ? raw[0] : raw
  if (!value || !KIND_VALUES.includes(value)) return null
  return value as ProductKind
}

/** Null is unlimited, 0 is sold out, and a number is a number. */
function stockLabel(stock: number | null): string {
  if (stock === null) return 'Unlimited'
  if (stock <= 0) return 'Sold out'
  return `${stock} in stock`
}

export default async function AdminStorePage({ searchParams }: PageProps) {
  await requireAdmin()

  const active = readKind((await searchParams).kind)
  const [counts, items, page] = await Promise.all([
    productCounts(),
    listProducts(active ?? undefined),
    getStorePageForEdit(),
  ])

  // Prices read in whatever the client set on the store page copy, not in a
  // pound sign hard-coded into the admin.
  const symbol = page?.currencySymbol || '£'

  const placeholders = items.filter((item) => item.image?.isPlaceholder).length

  // An empty list means two different things. A filter with nothing under it is
  // not an empty store, and saying "nothing in the store yet" while there are
  // eleven items on another tab would be a lie the screen tells about itself.
  const emptyFilter = counts.all.total > 0 ? active : null

  return (
    <>
      <header className="ad-head">
        <div className="ad-head__strip" aria-hidden="true">
          <span className="mono ad-head__chan">11</span>
          <span className="ad-head__rule" />
          <span className="label">Store</span>
        </div>
        <div className="ad-head__title">
          <h1 className="ad-head__h">Store</h1>
          <p className="ad-head__intro">
            Everything you sell, drafts included, in the order the store shows it. A new
            item starts at the top of its own section — use the arrows to move it. Drafts
            are invisible on the site until you publish them.
          </p>
        </div>
        <div className="ad-head__aside">
          <div className="sto-new">
            <span className="label sto-new__label">New</span>
            <span className="sto-new__links">
              {PRODUCT_KINDS.map((kind) => (
                <Link
                  key={kind}
                  href={`/admin/store/new?kind=${kind}`}
                  className="btn btn--sm"
                >
                  {/* The visible word is the kind; the accessible name says
                      what the button does, because a lone "Merch" tells a
                      screen reader nothing about creating anything. */}
                  <span className="vh">New </span>
                  {kind === 'beat' ? 'Beat' : productKindLabel(kind)}
                </Link>
              ))}
            </span>
          </div>
          <Link href="/admin/store/settings" className="btn btn--sm btn--ghost">
            Store page copy
          </Link>
        </div>
      </header>

      <nav className="sto-tabs" aria-label="Filter the store by kind">
        {TABS.map((tab) => {
          const current = tab.value === 'all' ? active === null : active === tab.value
          const count = counts[tab.value]

          return (
            <Link
              key={tab.value}
              href={
                tab.value === 'all' ? '/admin/store' : `/admin/store?kind=${tab.value}`
              }
              className="sto-tab"
              aria-current={current ? 'page' : undefined}
            >
              {tab.label}
              <span className="sto-tab__n">{count.total}</span>
            </Link>
          )
        })}
      </nav>

      <section className="ad-panel" aria-labelledby="store-heading">
        <div className="ad-panel__head">
          <span className="label" id="store-heading">
            {active ? productKindLabel(active) : 'Everything'}
          </span>
          <span className="mono sto-count">
            {items.length} {pluralise(items.length, 'item')} ·{' '}
            {active ? counts[active].published : counts.all.published} published
            {placeholders > 0 ? ` · ${placeholders} on placeholder art` : ''}
          </span>
        </div>

        <div className="ad-panel__body">
          {items.length === 0 ? (
            <div className="empty">
              <p className="empty__title">
                {emptyFilter
                  ? `No ${productKindLabel(emptyFilter).toLowerCase()} yet`
                  : 'Nothing in the store yet'}
              </p>
              <p className="empty__text">
                {emptyFilter
                  ? `The other tabs hold ${counts.all.total} ${pluralise(
                      counts.all.total,
                      'item',
                    )}. Choose All to see everything.`
                  : 'Add the first item and it appears as soon as you publish it.'}
              </p>
            </div>
          ) : (
            <ul className="ad-table">
              {items.map((item) => {
                const nextStatus = item.status === 'published' ? 'draft' : 'published'

                return (
                  <li className="ad-row sto-row" key={item.id}>
                    <SmartImage
                      image={item.image}
                      alt=""
                      sizes="48px"
                      className="ad-row__thumb sto-row__art"
                      emptyLabel=""
                    />

                    <div className="sto-row__main">
                      <span className="mono sto-row__kind">
                        {productKindLabel(item.kind)}
                      </span>
                      <Link
                        href={`/admin/store/${item.id}`}
                        className="ad-row__title sto-row__link"
                      >
                        {item.title}
                      </Link>
                      <span className="sto-row__sub">
                        {item.subtitle || 'No one-liner yet'}
                      </span>
                    </div>

                    <span className="mono ad-row__meta sto-row__meta">
                      <span className="sto-row__price">
                        {formatMoney(item.priceCents, symbol)}
                      </span>
                      <span>{stockLabel(item.stock)}</span>
                    </span>

                    <span className="sto-row__flags">
                      <span
                        className={`ad-badge ad-badge--${
                          item.status === 'published' ? 'published' : 'draft'
                        }`}
                      >
                        {item.status === 'published' ? 'Published' : 'Draft'}
                      </span>
                      {item.featured ? <span className="ad-badge">Pinned</span> : null}
                      {item.image?.isPlaceholder ? (
                        <span className="ad-flag label">Placeholder art</span>
                      ) : null}
                      {!item.image ? (
                        <span className="mono sto-row__note">No picture yet</span>
                      ) : null}
                    </span>

                    <span className="ad-row__tools">
                      <OrderButtons
                        upAction={moveProduct.bind(null, item.id, 'up')}
                        downAction={moveProduct.bind(null, item.id, 'down')}
                      />

                      <form action={setProductStatus.bind(null, item.id, nextStatus)}>
                        <button type="submit" className="btn btn--sm btn--ghost">
                          {item.status === 'published' ? 'Unpublish' : 'Publish'}
                          <span className="vh"> {item.title}</span>
                        </button>
                      </form>

                      <Link href={`/admin/store/${item.id}`} className="btn btn--sm">
                        Edit
                        <span className="vh"> {item.title}</span>
                      </Link>

                      <form action={deleteProduct.bind(null, item.id)}>
                        <DangerButton confirmLabel="Delete it">
                          Delete
                          <span className="vh"> {item.title}</span>
                        </DangerButton>
                      </form>
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </section>
    </>
  )
}
