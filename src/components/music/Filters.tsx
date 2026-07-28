'use client'

import { useId, type ChangeEvent } from 'react'
import type { ReleaseType } from '@/db/schema'
import { pluralise, releaseTypeLabel } from '@/lib/format'

/* ==========================================================================
   The catalogue's control surface.

   A channel strip: legends on the left in tracked-out mono caps, the readout
   hard right. Every control is mono and hairline-bordered, and the live one is
   amber — the same lamp the nav underline and the channel numbers use.

   It holds no state. /music owns the three values and this renders them, so
   the filtered list and the readout can never disagree.

   Filter vocabulary ("All", "Artist", "Year", the reset) is our chrome, not the
   client's copy, so these are literals. The type names come from
   releaseTypeLabel() so they read the same here as they do on every card.
   ========================================================================== */

export type TypeFilter = 'all' | ReleaseType

const TYPE_FILTERS: readonly TypeFilter[] = ['all', 'album', 'ep', 'single']

export type FiltersProps = {
  type: TypeFilter
  artist: string
  year: string
  /** Derived from the catalogue itself — never a second hard-coded list. */
  artistOptions: { slug: string; name: string }[]
  yearOptions: string[]
  /** How many releases the current combination matches. */
  count: number
  onType: (value: TypeFilter) => void
  onArtist: (value: string) => void
  onYear: (value: string) => void
  onReset: () => void
}

/** '9 releases', '3 albums', '1 EP' — the count names what it counted. */
function countReadout(count: number, type: TypeFilter): string {
  if (type === 'all') return `${count} ${pluralise(count, 'release')}`
  if (type === 'ep') return `${count} ${pluralise(count, 'EP')}`
  return `${count} ${pluralise(count, type)}`
}

export function Filters({
  type,
  artist,
  year,
  artistOptions,
  yearOptions,
  count,
  onType,
  onArtist,
  onYear,
  onReset,
}: FiltersProps) {
  const uid = useId()
  const typeLabelId = `mus-type-${uid}`
  const artistId = `mus-artist-${uid}`
  const yearId = `mus-year-${uid}`

  const active = type !== 'all' || artist !== 'all' || year !== 'all'

  return (
    <div className="mus-flt">
      <div className="mus-flt__group">
        <span className="label mus-flt__legend" id={typeLabelId}>
          Type
        </span>
        {/* Single-select, so each cell reports its own pressed state rather
            than pretending to be a set of independent toggles. */}
        <div className="mus-flt__set" role="group" aria-labelledby={typeLabelId}>
          {TYPE_FILTERS.map((value) => (
            <button
              key={value}
              type="button"
              className="mus-flt__btn"
              aria-pressed={type === value}
              onClick={() => onType(value)}
            >
              {value === 'all' ? 'All' : releaseTypeLabel(value)}
            </button>
          ))}
        </div>
      </div>

      {artistOptions.length > 1 ? (
        <div className="mus-flt__group">
          <label className="label mus-flt__legend" htmlFor={artistId}>
            Artist
          </label>
          <span className="mus-flt__select-wrap" data-active={artist !== 'all'}>
            <select
              id={artistId}
              className="mono mus-flt__select"
              value={artist}
              onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                onArtist(event.target.value)
              }
            >
              <option value="all">All artists</option>
              {artistOptions.map((option) => (
                <option key={option.slug} value={option.slug}>
                  {option.name}
                </option>
              ))}
            </select>
            <svg className="mus-flt__chev" viewBox="0 0 10 6" aria-hidden="true">
              <path d="M1 1 5 5 9 1" stroke="currentColor" strokeWidth="1" />
            </svg>
          </span>
        </div>
      ) : null}

      {yearOptions.length > 1 ? (
        <div className="mus-flt__group">
          <label className="label mus-flt__legend" htmlFor={yearId}>
            Year
          </label>
          <span className="mus-flt__select-wrap" data-active={year !== 'all'}>
            <select
              id={yearId}
              className="mono mus-flt__select"
              value={year}
              onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                onYear(event.target.value)
              }
            >
              <option value="all">All years</option>
              {yearOptions.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            <svg className="mus-flt__chev" viewBox="0 0 10 6" aria-hidden="true">
              <path d="M1 1 5 5 9 1" stroke="currentColor" strokeWidth="1" />
            </svg>
          </span>
        </div>
      ) : null}

      <div className="mus-flt__end">
        {active ? (
          <button type="button" className="btn btn--ghost btn--sm" onClick={onReset}>
            Clear filters
          </button>
        ) : null}

        {/* The readout. Polite, so changing a filter is announced once the
            list has settled rather than interrupting the keypress. */}
        <p className="mono mus-flt__count" aria-live="polite">
          {countReadout(count, type)}
        </p>
      </div>
    </div>
  )
}
