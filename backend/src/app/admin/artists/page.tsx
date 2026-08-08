import type { Metadata } from 'next'
import Link from 'next/link'
import { DangerButton, OrderButtons } from '@/components/admin/fields'
import { SmartImage } from '@/components/site/SmartImage'
import { listArtists } from '@/lib/admin-queries'
import { deleteArtist, moveArtist, setArtistStatus } from '@/lib/actions/roster'
import { pluralise } from '@/lib/format'
import { requireAdmin } from '@/lib/session'

import '@/styles/admin-roster.css'

/* ==========================================================================
   The roster, as the client operates it.

   One row per artist, drafts included, in the order the public grid uses.
   The count of releases is read back out of the catalogue rather than stored,
   so it is always the truth — it moves when a release is edited, never here.
   ========================================================================== */

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Artists',
  robots: { index: false, follow: false },
}

export default async function AdminArtistsPage() {
  await requireAdmin()

  const artists = await listArtists()
  const published = artists.filter((artist) => artist.status === 'published').length
  const placeholders = artists.filter((artist) => artist.photo?.isPlaceholder).length

  return (
    <>
      <header className="ad-head">
        <div className="ad-head__strip" aria-hidden="true">
          <span className="mono ad-head__chan">03</span>
          <span className="ad-head__rule" />
          <span className="label">Roster</span>
        </div>
        <div className="ad-head__title">
          <h1 className="ad-head__h">Artists</h1>
          <p className="ad-head__intro">
            Everyone the label works with, drafts included, in the order the grid shows
            them. A new one joins the end — use the arrows to move it. The public grid
            shows photographs and nothing else, so the photo does most of the work here.
          </p>
        </div>
        <div className="ad-head__aside">
          <Link href="/admin/artists/new" className="btn ad-btn--primary">
            New artist
          </Link>
        </div>
      </header>

      <section className="ad-panel" aria-labelledby="artists-heading">
        <div className="ad-panel__head">
          <span className="label" id="artists-heading">
            Roster
          </span>
          <span className="mono ros-count">
            {artists.length} {pluralise(artists.length, 'artist')} · {published} published
            {placeholders > 0 ? ` · ${placeholders} on placeholder photos` : ''}
          </span>
        </div>

        <div className="ad-panel__body">
          {artists.length === 0 ? (
            <div className="empty">
              <p className="empty__title">No artists yet</p>
              <p className="empty__text">
                Add the first collaborator, with a photo and a short description.
              </p>
            </div>
          ) : (
            <ul className="ad-table">
              {artists.map((artist) => {
                const nextStatus = artist.status === 'published' ? 'draft' : 'published'
                const appearances = artist.appearsOn.length

                return (
                  <li className="ad-row ros-row" key={artist.id}>
                    <SmartImage
                      image={artist.photo}
                      alt=""
                      sizes="48px"
                      className="ad-row__thumb ros-row__photo"
                      emptyLabel=""
                    />

                    <div className="ros-row__main">
                      <Link
                        href={`/admin/artists/${artist.id}`}
                        className="ad-row__title ros-row__link"
                      >
                        {artist.name}
                      </Link>
                      <span className="ros-row__role">
                        {artist.role || 'No role or genre set'}
                      </span>
                    </div>

                    <span className="mono ad-row__meta ros-row__meta">
                      <span>
                        {appearances === 0
                          ? 'On no releases'
                          : `On ${appearances} ${pluralise(appearances, 'release')}`}
                      </span>
                    </span>

                    <span className="ros-row__flags">
                      <span
                        className={`ad-badge ad-badge--${
                          artist.status === 'published' ? 'published' : 'draft'
                        }`}
                      >
                        {artist.status === 'published' ? 'Published' : 'Draft'}
                      </span>
                      {artist.photo?.isPlaceholder ? (
                        <span className="ad-flag label">Placeholder photo</span>
                      ) : null}
                      {!artist.photo ? (
                        <span className="mono ros-row__note">No photo yet</span>
                      ) : null}
                    </span>

                    <span className="ad-row__tools">
                      <OrderButtons
                        upAction={moveArtist.bind(null, artist.id, 'up')}
                        downAction={moveArtist.bind(null, artist.id, 'down')}
                      />

                      <form action={setArtistStatus.bind(null, artist.id, nextStatus)}>
                        <button type="submit" className="btn btn--sm btn--ghost">
                          {artist.status === 'published' ? 'Unpublish' : 'Publish'}
                          <span className="vh"> {artist.name}</span>
                        </button>
                      </form>

                      <Link href={`/admin/artists/${artist.id}`} className="btn btn--sm">
                        Edit
                        <span className="vh"> {artist.name}</span>
                      </Link>

                      <form action={deleteArtist.bind(null, artist.id)}>
                        <DangerButton confirmLabel="Delete them">
                          Delete
                          <span className="vh"> {artist.name}</span>
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
