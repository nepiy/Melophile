import Link from 'next/link'
import { SmartImage } from '@/components/site/SmartImage'
import type { ArtistFull } from '@/lib/data'

/* The same transport as the music rail, with portrait cards that lead to the
   full roster. The repeated set is visual only, so every artist has one link. */
const ARTIST_RAIL = {
  cycle: '42s',
} as const

function ArtistCard({ artist, decorative = false }: { artist: ArtistFull; decorative?: boolean }) {
  const body = (
    <>
      <SmartImage
        image={artist.photo}
        alt={decorative ? '' : artist.photo?.alt || `${artist.name} — artist portrait`}
        sizes="(max-width: 640px) 62vw, (max-width: 1024px) 34vw, 220px"
        className="home-artist-card__art"
        emptyLabel="No photo yet"
      />
      <div className="home-artist-card__meta">
        <h3 className="home-artist-card__name">{artist.name}</h3>
        {artist.role ? <p className="home-artist-card__role mono">{artist.role}</p> : null}
      </div>
    </>
  )

  if (decorative) {
    return (
      <div className="home-artist-card" aria-hidden="true">
        {body}
      </div>
    )
  }

  return (
    <Link href="/artists" className="home-artist-card">
      {body}
      <span className="vh">Meet {artist.name}</span>
    </Link>
  )
}

export function ArtistRail({ artists }: { artists: ArtistFull[] }) {
  return (
    <div
      className="home-artist-motion"
      style={{ '--home-artist-cycle': ARTIST_RAIL.cycle } as React.CSSProperties}
    >
      <div className="home-artist-motion__track">
        <ul className="home-artist-motion__set">
          {artists.map((artist) => (
            <li key={artist.id} className="home-artist-motion__item">
              <ArtistCard artist={artist} />
            </li>
          ))}
        </ul>
        <ul className="home-artist-motion__set" aria-hidden="true">
          {artists.map((artist) => (
            <li key={`repeat-${artist.id}`} className="home-artist-motion__item">
              <ArtistCard artist={artist} decorative />
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
