import type { Metadata } from 'next'
import Link from 'next/link'
import { DangerButton, OrderButtons } from '@/components/admin/fields'
import { SmartImage } from '@/components/site/SmartImage'
import { listReleases } from '@/lib/admin-queries'
import { deleteRelease, moveRelease, setReleaseStatus } from '@/lib/actions/releases'
import { formatDateShort, pluralise, releaseTypeLabel } from '@/lib/format'
import { requireAdmin } from '@/lib/session'

import '@/styles/admin-releases.css'

/* ==========================================================================
   The catalogue, as the client operates it.

   One row per release, drafts included, in the order the public catalogue
   uses. Everything that can be done without opening a release is on the row:
   move it, publish it, delete it. Everything else is one click away.
   ========================================================================== */

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Releases',
  robots: { index: false, follow: false },
}

export default async function AdminReleasesPage() {
  await requireAdmin()

  const releases = await listReleases()
  const published = releases.filter((release) => release.status === 'published').length
  const placeholders = releases.filter((release) => release.cover?.isPlaceholder).length

  return (
    <>
      <header className="ad-head">
        <div className="ad-head__strip" aria-hidden="true">
          <span className="mono ad-head__chan">02</span>
          <span className="ad-head__rule" />
          <span className="label">Catalogue</span>
        </div>
        <div className="ad-head__title">
          <h1 className="ad-head__h">Releases</h1>
          <p className="ad-head__intro">
            Every release, drafts included, in the order the catalogue shows them. A new
            one starts at the top — use the arrows to move it. Drafts are invisible on the
            site until you publish them.
          </p>
        </div>
        <div className="ad-head__aside">
          <Link href="/admin/releases/new" className="btn ad-btn--primary">
            New release
          </Link>
        </div>
      </header>

      <section className="ad-panel" aria-labelledby="releases-heading">
        <div className="ad-panel__head">
          <span className="label" id="releases-heading">
            Catalogue
          </span>
          <span className="mono rel-count">
            {releases.length} {pluralise(releases.length, 'release')} · {published}{' '}
            published
            {placeholders > 0 ? ` · ${placeholders} on placeholder art` : ''}
          </span>
        </div>

        <div className="ad-panel__body">
          {releases.length === 0 ? (
            <div className="empty">
              <p className="empty__title">No releases yet</p>
              <p className="empty__text">
                Add the first one and it appears on the site as soon as you publish it.
              </p>
            </div>
          ) : (
            <ul className="ad-table">
              {releases.map((release) => {
                const nextStatus = release.status === 'published' ? 'draft' : 'published'

                return (
                  <li className="ad-row rel-row" key={release.id}>
                    <SmartImage
                      image={release.cover}
                      alt=""
                      sizes="48px"
                      className="ad-row__thumb rel-row__art"
                      emptyLabel=""
                    />

                    <div className="rel-row__main">
                      <span className="mono rel-row__cat">
                        {release.catalogNumber || 'No catalogue number'}
                      </span>
                      <Link
                        href={`/admin/releases/${release.id}`}
                        className="ad-row__title rel-row__link"
                      >
                        {release.title}
                      </Link>
                      <span className="rel-row__by">
                        {release.artist ? release.artist.name : 'No artist set'}
                      </span>
                    </div>

                    <span className="mono ad-row__meta rel-row__meta">
                      <span>{releaseTypeLabel(release.type)}</span>
                      <span>{formatDateShort(release.releaseDate)}</span>
                    </span>

                    <span className="rel-row__flags">
                      <span
                        className={`ad-badge ad-badge--${
                          release.status === 'published' ? 'published' : 'draft'
                        }`}
                      >
                        {release.status === 'published' ? 'Published' : 'Draft'}
                      </span>
                      {release.featured ? <span className="ad-badge">Pinned</span> : null}
                      {release.cover?.isPlaceholder ? (
                        <span className="ad-flag label">Placeholder art</span>
                      ) : null}
                      {!release.cover ? (
                        <span className="mono rel-row__note">No sleeve yet</span>
                      ) : null}
                    </span>

                    <span className="ad-row__tools">
                      <OrderButtons
                        upAction={moveRelease.bind(null, release.id, 'up')}
                        downAction={moveRelease.bind(null, release.id, 'down')}
                      />

                      <form action={setReleaseStatus.bind(null, release.id, nextStatus)}>
                        <button type="submit" className="btn btn--sm btn--ghost">
                          {release.status === 'published' ? 'Unpublish' : 'Publish'}
                          <span className="vh"> {release.title}</span>
                        </button>
                      </form>

                      <Link
                        href={`/admin/releases/${release.id}`}
                        className="btn btn--sm"
                      >
                        Edit
                        <span className="vh"> {release.title}</span>
                      </Link>

                      <form action={deleteRelease.bind(null, release.id)}>
                        <DangerButton confirmLabel="Delete it">
                          Delete
                          <span className="vh"> {release.title}</span>
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
