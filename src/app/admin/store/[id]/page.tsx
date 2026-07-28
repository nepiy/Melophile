import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { AdminImage } from '@/components/admin/fields'
import { productHref } from '@/components/store/ProductCard'
import { PRODUCT_KINDS, type ProductKind } from '@/db'
import {
  getProductForEdit,
  getStorePageForEdit,
  storeReleaseOptions,
  type AdminProduct,
} from '@/lib/admin-store-queries'
import { formatMoney, productKindLabel } from '@/lib/format'
import { requireAdmin } from '@/lib/session'
import { ProductForm, type ProductFormValues } from './ProductForm'

import '@/styles/admin-store.css'

/* ==========================================================================
   One store item. `new` creates.

   A server component: it reads the row uncached, shapes it for the form, and
   does the one conversion the client must never do for itself.

   MONEY. priceCents and compareAtCents are integer minor units — 1250 is
   £12.50. The editor shows and accepts pounds, so the pence become a pounds
   string HERE, on the way out, and the pounds become pence in saveProduct on
   the way in. formatMoney(1250, '') is '12.50' and parseMoney('12.50') is
   1250, which is what makes load → save → reload leave the number alone.
   ========================================================================== */

export const dynamic = 'force-dynamic'

type PageProps = {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const KIND_VALUES: readonly string[] = PRODUCT_KINDS

function noIndex(title: string): Metadata {
  return { title, robots: { index: false, follow: false } }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params
  if (id === 'new') return noIndex('New store item')

  const product = /^\d+$/.test(id) ? await getProductForEdit(Number(id)) : null
  return noIndex(product ? product.title : 'Store item')
}

function toAdminImage(product: AdminProduct | null): AdminImage | null {
  const image = product?.image
  if (!image) return null
  return {
    id: image.id,
    path: image.path,
    width: image.width,
    height: image.height,
    alt: image.alt,
    isPlaceholder: image.isPlaceholder,
  }
}

/** Pence to a pounds string the client can read and retype. Blank stays blank. */
function pounds(cents: number | null): string {
  if (cents === null) return ''
  return formatMoney(cents, '')
}

function readKind(raw: string | string[] | undefined): ProductKind {
  const value = Array.isArray(raw) ? raw[0] : raw
  if (!value || !KIND_VALUES.includes(value)) return 'merch'
  return value as ProductKind
}

export default async function ProductEditorPage({ params, searchParams }: PageProps) {
  await requireAdmin()

  const { id } = await params
  const isNew = id === 'new'
  if (!isNew && !/^\d+$/.test(id)) notFound()

  const product = isNew ? null : await getProductForEdit(Number(id))
  if (!isNew && !product) notFound()

  const kind: ProductKind = product ? product.kind : readKind((await searchParams).kind)

  const [releases, page] = await Promise.all([
    storeReleaseOptions(product?.releaseId ?? null),
    getStorePageForEdit(),
  ])

  const values: ProductFormValues = {
    id: product?.id ?? null,
    kind,
    title: product?.title ?? '',
    subtitle: product?.subtitle ?? '',
    slug: product?.slug ?? '',
    description: product?.description ?? '',
    // A new item starts blank rather than at 0, so the price is typed once
    // rather than corrected from a number nobody chose.
    price: product ? pounds(product.priceCents) : '',
    compareAt: pounds(product?.compareAtCents ?? null),
    previewKind: product?.previewKind ?? 'none',
    previewUrl: product?.previewUrl ?? '',
    stock:
      product?.stock === null || product?.stock === undefined
        ? ''
        : String(product.stock),
    featured: product?.featured ?? false,
    status: product?.status ?? 'draft',
    image: toAdminImage(product),
    variants: (product?.variants ?? []).map((variant) => ({
      label: variant.label,
      sku: variant.sku,
      stock: variant.stock,
    })),
    musicFormat: product?.musicFormat ?? 'single',
    releaseId: product?.releaseId ? String(product.releaseId) : '',
    licenseType: product?.licenseType ?? 'lease',
    bpm: product?.bpm === null || product?.bpm === undefined ? '' : String(product.bpm),
    musicalKey: product?.musicalKey ?? '',
    digital: product?.digital ?? false,
    downloadUrl: product?.downloadUrl ?? '',
  }

  return (
    <>
      <header className="ad-head">
        <div className="ad-head__strip" aria-hidden="true">
          <span className="mono ad-head__chan">{isNew ? 'NEW' : '11'}</span>
          <span className="ad-head__rule" />
          <span className="label">{productKindLabel(kind)}</span>
        </div>
        <div className="ad-head__title">
          <h1 className="ad-head__h">
            {product ? product.title : `New ${kind === 'beat' ? 'beat' : kind} item`}
          </h1>
          {product ? (
            <p className="mono sto-head__meta">
              {productKindLabel(product.kind)} ·{' '}
              {formatMoney(product.priceCents, page?.currencySymbol || '£')} ·{' '}
              {product.status === 'published' ? 'Published' : 'Draft'}
            </p>
          ) : null}
          <p className="ad-head__intro">
            {isNew
              ? 'Fill in what you have. Prices are in pounds and pence — type 24.00, not 2400. Save it as a draft and finish it later, or publish it now and it is on sale.'
              : 'Every change here is live on the site the moment you save it. Set it back to draft to take it off sale without deleting it.'}
          </p>
        </div>
        <div className="ad-head__aside">
          <Link href="/admin/store" className="btn btn--sm btn--ghost">
            All items
          </Link>
        </div>
      </header>

      <ProductForm
        product={values}
        releaseOptions={releases}
        currencySymbol={page?.currencySymbol || '£'}
        viewUrl={
          product && product.status === 'published'
            ? productHref({ kind: product.kind, slug: product.slug })
            : null
        }
      />
    </>
  )
}
