import { SmartImage } from '@/components/site/SmartImage'
import type { ReleaseFull } from '@/lib/data'
import {
  formatDateLong,
  pluralise,
  releaseTypeLabel,
  streamingLabel,
  totalDuration,
} from '@/lib/format'
import { RichText, safeUrl } from '@/lib/markdown'

/* ==========================================================================
   One release, in full. Rendered inside <Dialog>, which already owns the
   focus trap, the focus return, Escape, the scroll lock and the mobile sheet —
   so this file is only the content.

   Part of the /music client bundle by way of ReleaseCatalog; it holds no state
   of its own, which is why it needs no 'use client' of its own.

   Every field is optional in the admin, so every block here is conditional. A
   release with no tracklist shows no TRACKLIST heading with nothing under it.
   ========================================================================== */

export function ReleaseDialog({
  release,
  titleId,
}: {
  release: ReleaseFull
  /** Owned by the dialog host so aria-labelledby points at our heading. */
  titleId: string
}) {
  const tracks = release.tracklist.filter((track) => track.title.trim())
  const runtime = totalDuration(tracks.map((track) => track.duration))
  const features = release.features.filter((feature) => feature.artist.name.trim())

  // Every client-entered URL goes through safeUrl. Anything we will not follow
  // is dropped rather than rendered as a dead or dangerous link.
  const links = release.streamingLinks.flatMap((link) => {
    const href = safeUrl(link.url)
    return href ? [{ platform: link.platform, href }] : []
  })

  const artistName = release.artist?.name ?? 'Various artists'

  return (
    <div className="mus-rd">
      <div className="mus-rd__art">
        <SmartImage
          image={release.cover}
          alt={release.cover?.alt || `${release.title} by ${artistName} — sleeve artwork`}
          sizes="(max-width: 880px) 92vw, 420px"
          emptyLabel="No artwork yet"
        />
      </div>

      <div className="mus-rd__body">
        {release.catalogNumber ? (
          <p className="mono mus-rd__cat">{release.catalogNumber}</p>
        ) : null}

        <h2 id={titleId} className="mus-rd__title">
          {release.title}
        </h2>

        <p className="mus-rd__by">{artistName}</p>

        <p className="mono mus-rd__meta">
          <span>{releaseTypeLabel(release.type)}</span>
          <span className="mus-rd__sep" aria-hidden="true">
            ·
          </span>
          <span>{formatDateLong(release.releaseDate)}</span>
        </p>

        {release.description.trim() ? (
          <div className="mus-rd__sec">
            <RichText value={release.description} />
          </div>
        ) : null}

        {features.length > 0 ? (
          <div className="mus-rd__sec">
            <p className="label">With</p>
            <ul className="mus-rd__feat">
              {features.map((feature) => (
                <li key={feature.artist.id}>
                  {feature.artist.name}
                  {feature.role.trim() ? (
                    <span className="mus-rd__feat-role"> — {feature.role}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {tracks.length > 0 ? (
          <div className="mus-rd__sec">
            <div className="mus-rd__sec-head">
              <p className="label">Tracklist</p>
              <p className="mono mus-rd__runtime">
                {tracks.length} {pluralise(tracks.length, 'track')}
                {runtime ? ` · ${runtime}` : ''}
              </p>
            </div>

            <ol className="mus-rd__trk">
              {tracks.map((track, i) => (
                <li key={`${track.n}-${track.title}`}>
                  <span className="mono mus-rd__trk-n">
                    {String(track.n || i + 1).padStart(2, '0')}
                  </span>
                  <span className="mus-rd__trk-title">{track.title}</span>
                  {track.duration.trim() ? (
                    <span className="mono mus-rd__trk-dur">{track.duration}</span>
                  ) : null}
                </li>
              ))}
            </ol>
          </div>
        ) : null}

        {release.credits.trim() ? (
          <div className="mus-rd__sec">
            <p className="label">Credits</p>
            <RichText value={release.credits} className="mus-rd__credits" />
          </div>
        ) : null}

        {links.length > 0 ? (
          <div className="mus-rd__sec">
            <p className="label">Listen</p>
            <ul className="mus-rd__links">
              {links.map((link) => (
                <li key={`${link.platform}-${link.href}`}>
                  <a
                    className="btn btn--sm"
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {streamingLabel(link.platform)}
                    <span className="vh">(opens in a new tab)</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  )
}
