import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { AdminImage } from '@/components/admin/fields'
import { getArtistForEdit, type AdminArtist } from '@/lib/admin-queries'
import { requireAdmin } from '@/lib/session'
import { ArtistForm, type ArtistFormValues } from './ArtistForm'

import '@/styles/admin-roster.css'

/* ==========================================================================
   One artist. `new` creates.

   A server component: it reads the row uncached, shapes it for the form and
   works out the one thing the client should not have to — the "Appears on"
   list, which is derived from the catalogue rather than stored. The form
   itself is the client boundary.
   ========================================================================== */

export const dynamic = 'force-dynamic'

type PageProps = { params: Promise<{ id: string }> }

function noIndex(title: string): Metadata {
  return { title, robots: { index: false, follow: false } }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params
  if (id === 'new') return noIndex('New artist')

  const artist = /^\d+$/.test(id) ? await getArtistForEdit(Number(id)) : null
  return noIndex(artist ? artist.name : 'Artist')
}

function toAdminImage(artist: AdminArtist | null): AdminImage | null {
  const photo = artist?.photo
  if (!photo) return null
  return {
    id: photo.id,
    path: photo.path,
    width: photo.width,
    height: photo.height,
    alt: photo.alt,
    isPlaceholder: photo.isPlaceholder,
  }
}

export default async function ArtistEditorPage({ params }: PageProps) {
  await requireAdmin()

  const { id } = await params
  const isNew = id === 'new'
  if (!isNew && !/^\d+$/.test(id)) notFound()

  const artist = isNew ? null : await getArtistForEdit(Number(id))
  if (!isNew && !artist) notFound()

  const values: ArtistFormValues = {
    id: artist?.id ?? null,
    name: artist?.name ?? '',
    slug: artist?.slug ?? '',
    role: artist?.role ?? '',
    shortDescription: artist?.shortDescription ?? '',
    status: artist?.status ?? 'draft',
    photo: toAdminImage(artist),
    links: (artist?.links ?? []).map((link) => ({
      label: link.label,
      url: link.url,
    })),
  }

  const appearsOn = (artist?.appearsOn ?? []).map((release) => ({
    id: release.id,
    title: release.title,
    catalogNumber: release.catalogNumber,
    releaseDate: release.releaseDate,
  }))

  return (
    <>
      <header className="ad-head">
        <div className="ad-head__strip" aria-hidden="true">
          <span className="mono ad-head__chan">{isNew ? 'NEW' : '03'}</span>
          <span className="ad-head__rule" />
          <span className="label">Artist</span>
        </div>
        <div className="ad-head__title">
          <h1 className="ad-head__h">{artist ? artist.name : 'New artist'}</h1>
          {artist ? (
            <p className="mono ros-head__meta">
              {artist.role || 'No role or genre set'} ·{' '}
              {artist.status === 'published' ? 'Published' : 'Draft'}
            </p>
          ) : null}
          <p className="ad-head__intro">
            {isNew
              ? 'A name is all it takes to start. Save it as a draft and add the photo and the description later, or publish it now and it is on the grid.'
              : 'Every change here is live on the site the moment you save it. Set it back to draft to take them off the grid without deleting anything.'}
          </p>
        </div>
        <div className="ad-head__aside">
          <Link href="/admin/artists" className="btn btn--sm btn--ghost">
            All artists
          </Link>
        </div>
      </header>

      <ArtistForm
        artist={values}
        appearsOn={appearsOn}
        viewUrl={artist && artist.status === 'published' ? '/artists' : null}
      />
    </>
  )
}
