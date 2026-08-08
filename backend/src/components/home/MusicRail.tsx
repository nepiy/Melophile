import { ReleaseCard } from '@/components/music/ReleaseCard'
import type { ReleaseFull } from '@/lib/data'

/*
  Motion storyboard
  left mask → sleeve settles into view → slow rail travel → sleeve fades at right mask

  This is deliberately a long, linear transport: the two identical sets meet
  without a visible reset. Hover, keyboard focus, and reduced-motion all stop it.
*/
const MUSIC_RAIL = {
  cycle: '36s',
} as const

export function MusicRail({ releases }: { releases: ReleaseFull[] }) {
  return (
    <div
      className="home-music-motion"
      style={{ '--home-music-cycle': MUSIC_RAIL.cycle } as React.CSSProperties}
    >
      <div className="home-music-motion__track">
        <ul className="home-music-motion__set">
          {releases.map((release) => (
            <li key={release.id} className="home-music-motion__item">
              <ReleaseCard
                release={release}
                sizes="(max-width: 640px) 78vw, (max-width: 1024px) 42vw, 260px"
              />
            </li>
          ))}
        </ul>
        <ul className="home-music-motion__set" aria-hidden="true">
          {releases.map((release) => (
            <li key={`repeat-${release.id}`} className="home-music-motion__item">
              <ReleaseCard
                decorative
                release={release}
                sizes="(max-width: 640px) 78vw, (max-width: 1024px) 42vw, 260px"
              />
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
