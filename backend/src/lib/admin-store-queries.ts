import { asc, desc, eq, or } from 'drizzle-orm'
import {
  db,
  products,
  PRODUCT_KINDS,
  releases,
  storePage,
  type ImageRow,
  type ProductKind,
  type ProductRow,
  type StorePageRow,
} from '@/db'

/* ==========================================================================
   Admin reads for the store.

   Same contract as src/lib/admin-queries.ts, and for the same reason:

     store-data.ts  cached with unstable_cache and filtered to
                    status='published'. Right for the storefront, wrong for an
                    editor — the client would not see their own drafts, and a
                    saved row would stay stale for as long as the cache holds.

     this file      no cache, no status filter. Every store admin page also
                    sets `export const dynamic = 'force-dynamic'`, so the
                    editor always shows what is in the database right now.
   ========================================================================== */

export type AdminProduct = ProductRow & { image: ImageRow | null }

/* ------------------------------- ordering -------------------------------- */

/**
 * ORDER IS PER KIND, NOT ACROSS THE WHOLE TABLE.
 *
 * The storefront renders merch, music and beats as three separate runs, each
 * sorted by `order`, so the only thing the arrows can usefully change is a
 * row's position among its own kind. Grouping the unfiltered list the same way
 * means an arrow always moves a row exactly one line on the screen, on every
 * tab — the alternative is a button that visibly skips three rows because two
 * beats happen to sit between two shirts.
 */
const KIND_RANK = new Map<ProductKind, number>(
  PRODUCT_KINDS.map((kind, index) => [kind, index]),
)

function byKindThenOrder(a: AdminProduct, b: AdminProduct): number {
  const rank = (KIND_RANK.get(a.kind) ?? 99) - (KIND_RANK.get(b.kind) ?? 99)
  if (rank !== 0) return rank
  if (a.order !== b.order) return a.order - b.order
  return a.id - b.id
}

/* -------------------------------- products ------------------------------- */

/** Every product, drafts included. Pass a kind to filter. */
export async function listProducts(kind?: ProductKind): Promise<AdminProduct[]> {
  const rows = await db.query.products.findMany({
    where: kind ? eq(products.kind, kind) : undefined,
    orderBy: [asc(products.order), asc(products.id)],
    with: { image: true },
  })

  return rows.map((row) => ({ ...row, image: row.image ?? null })).sort(byKindThenOrder)
}

export async function getProductForEdit(id: number): Promise<AdminProduct | null> {
  const row = await db.query.products.findFirst({
    where: eq(products.id, id),
    with: { image: true },
  })
  return row ? { ...row, image: row.image ?? null } : null
}

/**
 * True if another product already uses this slug.
 *
 * `products_slug_unique` is on the table, and hitting it raises a SQLite error
 * the client would meet as a 500. Asking first turns that into a sentence next
 * to the field.
 */
export async function slugTakenByOtherProduct(
  slug: string,
  exceptId: number | null,
): Promise<boolean> {
  const rows = await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.slug, slug))
    .all()

  return rows.some((row) => row.id !== exceptId)
}

/* --------------------------------- counts -------------------------------- */

export type KindCount = { total: number; published: number; draft: number }
export type ProductCounts = Record<ProductKind | 'all', KindCount>

/** Drives the live numbers on the kind tabs. One pass, one query. */
export async function productCounts(): Promise<ProductCounts> {
  const rows = await db
    .select({ kind: products.kind, status: products.status })
    .from(products)
    .all()

  const blank = (): KindCount => ({ total: 0, published: 0, draft: 0 })
  const counts: ProductCounts = {
    all: blank(),
    merch: blank(),
    music: blank(),
    beat: blank(),
  }

  for (const row of rows) {
    const bucket = counts[row.kind]
    // A kind the schema no longer lists cannot be counted into a column that
    // does not exist. Skipping it is better than throwing on a list page.
    if (!bucket) continue

    bucket.total += 1
    counts.all.total += 1

    if (row.status === 'published') {
      bucket.published += 1
      counts.all.published += 1
    } else {
      bucket.draft += 1
      counts.all.draft += 1
    }
  }

  return counts
}

/* ------------------------------ store page ------------------------------- */

/** The singleton. Null on a database that was migrated but never seeded. */
export async function getStorePageForEdit(): Promise<StorePageRow | null> {
  return (await db.select().from(storePage).where(eq(storePage.id, 1)).get()) ?? null
}

/* ---------------------------- release options ---------------------------- */

/**
 * For the "part of the catalogue" select on a music product.
 *
 * Published releases, plus whichever release this product already points at —
 * without that second clause, unpublishing a release would silently rewrite
 * every store item linked to it the next time one of them was saved, because
 * the <select> would no longer contain the value it was showing.
 */
export async function storeReleaseOptions(
  includeId: number | null = null,
): Promise<{ value: string; label: string }[]> {
  const rows = await db
    .select({
      id: releases.id,
      title: releases.title,
      catalogNumber: releases.catalogNumber,
      status: releases.status,
    })
    .from(releases)
    .where(
      includeId === null
        ? eq(releases.status, 'published')
        : or(eq(releases.status, 'published'), eq(releases.id, includeId)),
    )
    .orderBy(desc(releases.releaseDate), asc(releases.title))
    .all()

  return rows.map((row) => {
    const number = row.catalogNumber.trim()
    const name = number ? `${row.title} · ${number}` : row.title
    return {
      value: String(row.id),
      label: row.status === 'draft' ? `${name} (draft)` : name,
    }
  })
}

/* --------------------------------- order --------------------------------- */

/**
 * Moves a product up or down among the products of its own kind.
 *
 * Sequential integers are rewritten across that kind first, because seeded or
 * hand-edited rows can share an order value — and swapping two identical
 * numbers looks like the button is broken. Modelled on reorder() in
 * src/lib/admin-queries.ts; separate because that one takes a fixed set of
 * tables and this one is scoped to a kind rather than a whole table.
 */
export async function reorderProduct(
  id: number,
  direction: 'up' | 'down',
): Promise<void> {
  const target = await db
    .select({ kind: products.kind })
    .from(products)
    .where(eq(products.id, id))
    .get()

  if (!target) return

  const rows = await db
    .select({ id: products.id, order: products.order })
    .from(products)
    .where(eq(products.kind, target.kind))
    .orderBy(asc(products.order), asc(products.id))
    .all()

  const index = rows.findIndex((row) => row.id === id)
  if (index === -1) return

  const swapWith = direction === 'up' ? index - 1 : index + 1
  if (swapWith < 0 || swapWith >= rows.length) return

  const next = [...rows]
  const a = next[index]
  const b = next[swapWith]
  if (!a || !b) return
  next[index] = b
  next[swapWith] = a

  for (const [position, row] of next.entries()) {
    await db.update(products).set({ order: position }).where(eq(products.id, row.id))
  }
}

/** The top of a kind's run, which is where a new product goes. */
export async function topOrderForKind(kind: ProductKind): Promise<number> {
  const rows = await db
    .select({ order: products.order })
    .from(products)
    .where(eq(products.kind, kind))
    .all()

  return rows.length === 0 ? 0 : Math.min(...rows.map((row) => row.order)) - 1
}
