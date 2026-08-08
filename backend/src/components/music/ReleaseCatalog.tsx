'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Filters, type TypeFilter } from '@/components/music/Filters'
import { ReleaseCard } from '@/components/music/ReleaseCard'
import { ReleaseDialog } from '@/components/music/ReleaseDialog'
import { Dialog, useDialogTitleId } from '@/components/site/Dialog'
import { Reveal } from '@/components/site/Reveal'
import { SectionHead } from '@/components/site/SectionHead'
import type { ReleaseFull } from '@/lib/data'
import { formatYear } from '@/lib/format'

/* ==========================================================================
   The catalogue.

   The whole published list arrives once from the server and every filter is a
   pass over that array — no refetch, no navigation, no loading state, because
   there is nothing to load. The grid keeps the order the client set in the
   admin; filtering narrows it and never re-sorts it.

   Deep linking is the contract with the home page: its cards are links to
   /music?r=<slug>, so arriving with that param must open the release. The URL
   is then kept in step with window.history.replaceState — never router.push,
   which would push a history entry per sleeve and re-run the server render.
   ========================================================================== */

export type ReleaseCatalogProps = {
  releases: ReleaseFull[]
  /** Client copy, from the `home` row. Never a literal. */
  heading: string
  intro: string
  headingId: string
  /** A ?r= slug the server has already checked against the catalogue. */
  initialSlug: string | null
}

export function ReleaseCatalog({
  releases,
  heading,
  intro,
  headingId,
  initialSlug,
}: ReleaseCatalogProps) {
  const [type, setType] = useState<TypeFilter>('all')
  const [artist, setArtist] = useState('all')
  const [year, setYear] = useState('all')
  const [openSlug, setOpenSlug] = useState<string | null>(initialSlug)

  const titleId = useDialogTitleId('release')

  /* ---- option lists, derived from the releases themselves --------------- */

  // Primary artist only: that is the name printed on the card, so filtering by
  // it can never return a sleeve that looks like it belongs to someone else.
  // Guests and players are credits, and they live in the detail view.
  const artistOptions = useMemo(() => {
    const found = new Map<string, string>()
    for (const release of releases) {
      if (release.artist) found.set(release.artist.slug, release.artist.name)
    }
    return [...found]
      .map(([slug, name]) => ({ slug, name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [releases])

  const yearOptions = useMemo(() => {
    const found = new Set<string>()
    for (const release of releases) {
      const value = formatYear(release.releaseDate)
      if (value) found.add(value)
    }
    // Newest first: a label's most recent year is the one people look for.
    return [...found].sort((a, b) => b.localeCompare(a))
  }, [releases])

  const filtered = useMemo(
    () =>
      releases.filter(
        (release) =>
          (type === 'all' || release.type === type) &&
          (artist === 'all' || release.artist?.slug === artist) &&
          (year === 'all' || formatYear(release.releaseDate) === year),
      ),
    [releases, type, artist, year],
  )

  const reset = useCallback(() => {
    setType('all')
    setArtist('all')
    setYear('all')
  }, [])

  /* ---- the detail dialog ----------------------------------------------- */

  // Resolved against the full catalogue, not the filtered view, so a deep link
  // opens its release whatever the filters happen to be.
  const openRelease = useMemo(
    () =>
      openSlug ? (releases.find((release) => release.slug === openSlug) ?? null) : null,
    [openSlug, releases],
  )

  const open = useCallback((release: ReleaseFull) => setOpenSlug(release.slug), [])
  const close = useCallback(() => setOpenSlug(null), [])

  // Keep ?r= in step with what is open. replaceState so opening six sleeves
  // does not bury the page the visitor came from under six history entries, and
  // so closing one is not a back-button trap. history.state is carried through
  // rather than nulled, because the router keeps its own bookkeeping in there.
  // This also runs on arrival, which quietly strips a ?r= that matches nothing.
  useEffect(() => {
    const url = new URL(window.location.href)
    if (openSlug) url.searchParams.set('r', openSlug)
    else url.searchParams.delete('r')

    const next = `${url.pathname}${url.search}${url.hash}`
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`
    if (next !== current) window.history.replaceState(window.history.state, '', next)
  }, [openSlug])

  return (
    <>
      <SectionHead
        channel="01"
        label="Catalogue"
        heading={heading}
        intro={intro}
        id={headingId}
        headingLevel={1}
      />

      <Filters
        type={type}
        artist={artist}
        year={year}
        artistOptions={artistOptions}
        yearOptions={yearOptions}
        count={filtered.length}
        onType={setType}
        onArtist={setArtist}
        onYear={setYear}
        onReset={reset}
      />

      {filtered.length === 0 ? (
        <div className="empty mus-none">
          <p className="empty__title">No releases match those filters</p>
          <p className="empty__text">
            Change the type, artist or year, or clear the filters to see the whole
            catalogue.
          </p>
          <button type="button" className="btn mus-none__reset" onClick={reset}>
            Clear filters
          </button>
        </div>
      ) : (
        <ul className="mus-grid">
          {filtered.map((release, i) => (
            // Staggered by column, not by absolute position: a nine-sleeve
            // catalogue should not delay its last row by two thirds of a second.
            <Reveal as="li" key={release.id} index={i % 3} className="mus-grid__item">
              <ReleaseCard
                release={release}
                sizes="(max-width: 560px) 92vw, (max-width: 1000px) 46vw, 31vw"
                onOpen={open}
              />
            </Reveal>
          ))}
        </ul>
      )}

      <Dialog open={openRelease !== null} onClose={close} titleId={titleId}>
        {openRelease ? <ReleaseDialog release={openRelease} titleId={titleId} /> : null}
      </Dialog>
    </>
  )
}
