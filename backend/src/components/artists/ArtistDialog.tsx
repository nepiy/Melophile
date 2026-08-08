'use client'

import Link from 'next/link'
import { Dialog, useDialogTitleId } from '@/components/site/Dialog'
import { SmartImage } from '@/components/site/SmartImage'
import type { ArtistFull } from '@/lib/data'
import { formatYear, releaseTypeLabel } from '@/lib/format'
import { RichText, safeUrl } from '@/lib/markdown'

/* ==========================================================================
   The panel behind the click. Everything the grid refuses to show lives here:
   the photograph at size, the name, the role in the mono, the description as
   the client wrote it, their links, and the catalogue they appear on.

   The Dialog primitive already owns the hard parts — role, aria-modal, focus
   trap, focus return, Escape, scroll lock, and the full-screen sheet under
   720px — so none of that is repeated here.

   Prev/next is safe to add because nothing about it can strand focus: both
   controls wrap, so neither is ever disabled while focused, the panel is never
   remounted between artists, and the live region below announces the change to
   a screen reader without moving focus off the control being used.
   ========================================================================== */

export type ArtistDialogProps = {
  artist: ArtistFull
  open: boolean
  onClose: () => void
  /** 1-based, for the mono counter. */
  index: number
  total: number
  /** Omitted when there is only one artist to show. */
  onPrev?: () => void
  onNext?: () => void
  prevName?: string
  nextName?: string
}

/** A link with no label still needs something to click. */
function linkLabel(label: string, href: string): string {
  const trimmed = label.trim()
  if (trimmed) return trimmed
  try {
    return new URL(href).hostname.replace(/^www\./, '')
  } catch {
    return href
  }
}

const pad = (n: number) => String(n).padStart(2, '0')

export function ArtistDialog({
  artist,
  open,
  onClose,
  index,
  total,
  onPrev,
  onNext,
  prevName = '',
  nextName = '',
}: ArtistDialogProps) {
  const titleId = useDialogTitleId('artist')

  // Every client URL goes through safeUrl, and anything it refuses is dropped
  // rather than rendered as a dead link.
  const links = artist.links
    .map((item) => ({ label: item.label, href: safeUrl(item.url) }))
    .filter((item): item is { label: string; href: string } => item.href !== null)

  const canStep = Boolean(onPrev && onNext)

  return (
    <Dialog open={open} onClose={onClose} titleId={titleId}>
      <div className="ad">
        {/* No alt override: the description the client typed at upload is the
            right one, and falling back to the artist's name would only repeat
            the heading sitting next to it. */}
        <SmartImage
          image={artist.photo}
          sizes="(max-width: 779px) 100vw, 340px"
          className="ad__photo"
          emptyLabel="No photo yet"
        />

        <div className="ad__head">
          <h2 id={titleId} className="ad__name">
            {artist.name}
          </h2>
          {artist.role ? <p className="mono ad__role">{artist.role}</p> : null}
        </div>

        <div className="ad__body">
          <RichText value={artist.shortDescription} className="ad__prose" />

          {links.length > 0 ? (
            <div className="ad__block">
              <p className="label ad__block-label">Elsewhere</p>
              <ul className="ad__links">
                {links.map((item) => (
                  <li key={item.href}>
                    <a
                      className="link mono"
                      href={item.href}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {linkLabel(item.label, item.href)}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {artist.appearsOn.length > 0 ? (
            <div className="ad__block">
              <p className="label ad__block-label">Appears on</p>
              <ul className="ad__rels">
                {artist.appearsOn.map((release) => {
                  const year = formatYear(release.releaseDate)
                  return (
                    <li key={release.id}>
                      <Link
                        className="ad__rel"
                        href={`/music?r=${encodeURIComponent(release.slug)}`}
                      >
                        <SmartImage
                          image={release.cover}
                          alt=""
                          sizes="56px"
                          className="ad__rel-art"
                          emptyLabel="No artwork yet"
                        />
                        <span className="ad__rel-text">
                          {release.catalogNumber ? (
                            <span className="mono ad__rel-cat">
                              {release.catalogNumber}
                            </span>
                          ) : null}
                          <span className="ad__rel-title">{release.title}</span>
                          <span className="mono ad__rel-meta">
                            <span>{releaseTypeLabel(release.type)}</span>
                            {year ? (
                              <>
                                <span className="ad__rel-dot" aria-hidden="true">
                                  ·
                                </span>
                                <span>{year}</span>
                              </>
                            ) : null}
                          </span>
                        </span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          ) : null}
        </div>
      </div>

      {canStep ? (
        <div className="ad__nav">
          <button
            type="button"
            className="btn btn--ghost ad__nav-prev"
            onClick={onPrev}
            aria-label={`Previous artist: ${prevName}`}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <path d="M6.5 1 2 5l4.5 4" stroke="currentColor" strokeWidth="1" />
            </svg>
            <span>Previous</span>
          </button>

          <p className="mono ad__nav-count">
            <span className="vh">Artist </span>
            {pad(index)} / {pad(total)}
          </p>

          <button
            type="button"
            className="btn btn--ghost ad__nav-next"
            onClick={onNext}
            aria-label={`Next artist: ${nextName}`}
          >
            <span>Next</span>
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <path d="M3.5 1 8 5l-4.5 4" stroke="currentColor" strokeWidth="1" />
            </svg>
          </button>
        </div>
      ) : null}

      {/* Stepping does not move focus, so the change has to be spoken. The
          region is created with the panel, so it announces updates only. */}
      <p className="vh" aria-live="polite">
        {artist.name}, {index} of {total}.
      </p>
    </Dialog>
  )
}
