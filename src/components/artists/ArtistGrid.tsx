'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ArtistDialog } from '@/components/artists/ArtistDialog'
import { Reveal } from '@/components/site/Reveal'
import { SmartImage } from '@/components/site/SmartImage'
import type { ArtistFull } from '@/lib/data'

/* ==========================================================================
   The grid. Photographs, uniformly cropped to 4:5, held back to a duotone so
   a wall of portraits the label did not shoot still reads as one wall — and
   resolving to full colour under the pointer and under the keyboard.

   Each tile is a real <button type="button">. That is not a detail: a button
   is reachable by Tab, fires on both Enter and Space, and is announced as a
   button, all of which a <div onClick> has to fake and usually fakes badly.
   The visible name is decorative (it is hidden until hover/focus), so the
   accessible name comes from a .vh span that is always present.

   The panel is mounted from the first paint and toggled by `open`, rather than
   mounted on demand. It renders nothing while closed, and it means the Dialog
   primitive has already resolved its portal before focus moves into it.
   ========================================================================== */

export function ArtistGrid({ artists }: { artists: ArtistFull[] }) {
  // Index and openness are separate, so prev/next can move the panel on without
  // ever closing it, and so the panel keeps an artist to render while shut.
  const [panel, setPanel] = useState<{ index: number; open: boolean }>({
    index: 0,
    open: false,
  })

  const tiles = useRef<(HTMLButtonElement | null)[]>([])
  const restoreTo = useRef<number | null>(null)
  const total = artists.length
  const shown = artists[panel.index] ?? null

  const close = useCallback(() => {
    restoreTo.current = panel.index
    setPanel((p) => ({ ...p, open: false }))
  }, [panel.index])

  // The Dialog hands focus back to whichever tile opened it. If prev/next has
  // moved us along since, that is the wrong tile. React flushes a commit's
  // unmount effects before its mount effects, so this runs after the Dialog has
  // released focus — no timers, no frame racing.
  useEffect(() => {
    if (panel.open) return
    const index = restoreTo.current
    if (index === null) return
    restoreTo.current = null
    tiles.current[index]?.focus()
  }, [panel.open])

  const step = useCallback(
    (delta: number) => {
      setPanel((p) => ({ ...p, index: (p.index + delta + total) % total }))
    },
    [total],
  )

  const prev = artists[(panel.index - 1 + total) % total] ?? null
  const next = artists[(panel.index + 1) % total] ?? null

  return (
    <>
      <ul className="roster">
        {artists.map((artist, i) => (
          <Reveal as="li" key={artist.id} index={i} className="roster__cell">
            <button
              type="button"
              className="roster__tile"
              aria-haspopup="dialog"
              ref={(node) => {
                tiles.current[i] = node
              }}
              onClick={() => setPanel({ index: i, open: true })}
            >
              {/* Everything visible in the tile is decoration: the photograph
                  repeats what the button is already called, and the name label
                  is only there for pointer and keyboard users. Hiding the lot
                  keeps the announced name exactly one artist long. */}
              <span className="roster__frame" aria-hidden="true">
                <SmartImage
                  image={artist.photo}
                  alt=""
                  sizes="(max-width: 719px) 46vw, (max-width: 1039px) 31vw, 300px"
                  className="roster__art"
                  emptyLabel="No photo yet"
                  priority={i < 4}
                />
                <span className="roster__tint" />
                <span className="label roster__name">{artist.name}</span>
              </span>

              <span className="vh">{artist.name} — open details</span>
            </button>
          </Reveal>
        ))}
      </ul>

      {shown ? (
        <ArtistDialog
          artist={shown}
          open={panel.open}
          onClose={close}
          index={panel.index + 1}
          total={total}
          // One artist on the roster has nowhere to step to, and a disabled
          // control that had focus is a control that loses it.
          onPrev={total > 1 ? () => step(-1) : undefined}
          onNext={total > 1 ? () => step(1) : undefined}
          prevName={total > 1 ? (prev?.name ?? '') : ''}
          nextName={total > 1 ? (next?.name ?? '') : ''}
        />
      ) : null}
    </>
  )
}
