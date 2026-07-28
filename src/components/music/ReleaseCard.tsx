import Link from 'next/link'
import { SmartImage } from '@/components/site/SmartImage'
import type { ReleaseFull } from '@/lib/data'
import { formatYear, releaseTypeLabel } from '@/lib/format'

/* ==========================================================================
   One sleeve. Shared by the home page and /music so the two can never drift.

   Artwork carries the weight, so the frame is unstyled apart from a hairline
   and the meta below it is deliberately small.

   Two modes, because the same card does two jobs:
     link   — home page. Goes to /music?r=<slug>, which opens that release's
              detail dialog on arrival. Deep-linkable and shareable.
     button — /music. Opens the dialog in place without a navigation.
   ========================================================================== */

export type ReleaseCardProps = {
  release: ReleaseFull
  sizes: string
  priority?: boolean
  /** Provide to make the card a button that opens the detail dialog in place. */
  onOpen?: (release: ReleaseFull) => void
}

function CardBody({ release }: { release: ReleaseFull }) {
  return (
    <>
      <SmartImage
        image={release.cover}
        alt={
          release.cover?.alt ||
          `${release.title} by ${release.artist?.name ?? 'Melophile Records'} — sleeve artwork`
        }
        sizes="(max-width: 640px) 92vw, (max-width: 1024px) 46vw, 30vw"
        className="rel__art"
      />

      <div className="rel__meta">
        {release.catalogNumber ? (
          <span className="rel__cat mono">{release.catalogNumber}</span>
        ) : null}
        <h3 className="rel__title">{release.title}</h3>
        <p className="rel__by">
          {release.artist?.name ?? 'Various artists'}
          <span className="rel__dot" aria-hidden="true">
            ·
          </span>
          <span className="rel__type mono">{releaseTypeLabel(release.type)}</span>
          <span className="rel__dot" aria-hidden="true">
            ·
          </span>
          <span className="rel__year mono">{formatYear(release.releaseDate)}</span>
        </p>
      </div>
    </>
  )
}

export function ReleaseCard({ release, onOpen }: ReleaseCardProps) {
  if (onOpen) {
    return (
      <button type="button" className="rel" onClick={() => onOpen(release)}>
        <CardBody release={release} />
        <span className="vh">
          Open details for {release.title} by {release.artist?.name ?? 'various artists'}
        </span>
      </button>
    )
  }

  return (
    <Link href={`/music?r=${encodeURIComponent(release.slug)}`} className="rel">
      <CardBody release={release} />
    </Link>
  )
}
