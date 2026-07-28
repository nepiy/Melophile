import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { AdminImage } from '@/components/admin/fields'
import {
  artistOptions,
  getReleaseForEdit,
  suggestCatalogNumber,
  type AdminRelease,
} from '@/lib/admin-queries'
import { formatDateShort, todayIso, totalDuration } from '@/lib/format'
import { requireAdmin } from '@/lib/session'
import { ReleaseForm, type ReleaseFormValues } from './ReleaseForm'

import '@/styles/admin-releases.css'

/* ==========================================================================
   One release. `new` creates.

   A server component: it reads the row uncached, shapes it for the form and
   works out the things the client should not have to — the suggested
   catalogue number, the total runtime, whether there is a public page to look
   at. The form itself is the client boundary.
   ========================================================================== */

export const dynamic = 'force-dynamic'

type PageProps = { params: Promise<{ id: string }> }

function noIndex(title: string): Metadata {
  return { title, robots: { index: false, follow: false } }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params
  if (id === 'new') return noIndex('New release')

  const release = /^\d+$/.test(id) ? await getReleaseForEdit(Number(id)) : null
  return noIndex(release ? release.title : 'Release')
}

function toAdminImage(release: AdminRelease | null): AdminImage | null {
  const cover = release?.cover
  if (!cover) return null
  return {
    id: cover.id,
    path: cover.path,
    width: cover.width,
    height: cover.height,
    alt: cover.alt,
    isPlaceholder: cover.isPlaceholder,
  }
}

export default async function ReleaseEditorPage({ params }: PageProps) {
  await requireAdmin()

  const { id } = await params
  const isNew = id === 'new'
  if (!isNew && !/^\d+$/.test(id)) notFound()

  const [release, options] = await Promise.all([
    isNew ? null : getReleaseForEdit(Number(id)),
    artistOptions(),
  ])

  if (!isNew && !release) notFound()

  // Suggestions, both editable: the next free number in the run, and today.
  const suggestedCatalog = isNew ? await suggestCatalogNumber() : ''

  const values: ReleaseFormValues = {
    id: release?.id ?? null,
    title: release?.title ?? '',
    slug: release?.slug ?? '',
    artistId: release?.artistId ? String(release.artistId) : '',
    type: release?.type ?? 'single',
    releaseDate: release?.releaseDate ?? todayIso(),
    catalogNumber: release?.catalogNumber ?? suggestedCatalog,
    description: release?.description ?? '',
    credits: release?.credits ?? '',
    status: release?.status ?? 'draft',
    featured: release?.featured ?? false,
    cover: toAdminImage(release),
    tracks: (release?.tracklist ?? []).map((track) => ({
      n: String(track.n),
      title: track.title,
      duration: track.duration,
    })),
    links: (release?.streamingLinks ?? []).map((link) => ({
      platform: link.platform,
      url: link.url,
    })),
    features: (release?.features ?? []).map((feature) => ({
      artist: feature.name,
      role: feature.role,
    })),
  }

  const runtime = totalDuration((release?.tracklist ?? []).map((track) => track.duration))

  return (
    <>
      <header className="ad-head">
        <div className="ad-head__strip" aria-hidden="true">
          <span className="mono ad-head__chan">{isNew ? 'NEW' : '02'}</span>
          <span className="ad-head__rule" />
          <span className="label">Release</span>
        </div>
        <div className="ad-head__title">
          <h1 className="ad-head__h">{release ? release.title : 'New release'}</h1>
          {release ? (
            <p className="mono rel-head__meta">
              {release.catalogNumber || 'No catalogue number'} ·{' '}
              {formatDateShort(release.releaseDate)} ·{' '}
              {release.status === 'published' ? 'Published' : 'Draft'}
            </p>
          ) : null}
          <p className="ad-head__intro">
            {isNew
              ? 'Fill in what you have. The catalogue number and the date are suggestions — change either. Save it as a draft and finish it later, or publish it now and it is on the site.'
              : 'Every change here is live on the site the moment you save it. Set it back to draft to take it down without deleting it.'}
          </p>
        </div>
        <div className="ad-head__aside">
          <Link href="/admin/releases" className="btn btn--sm btn--ghost">
            All releases
          </Link>
        </div>
      </header>

      <ReleaseForm
        release={values}
        artistOptions={options}
        runtime={runtime}
        viewUrl={
          release && release.status === 'published'
            ? `/music?r=${encodeURIComponent(release.slug)}`
            : null
        }
      />
    </>
  )
}
