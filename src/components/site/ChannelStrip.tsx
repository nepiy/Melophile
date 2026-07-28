'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

/* ==========================================================================
   The left gutter: a fader whose cap position is the scroll position.

   This is the piece that makes the hero's instrumentation feel native rather
   than a one-off stunt — the same hairlines and tracked-out mono label run down
   every page. And like the hero's meters, it encodes something real: the cap is
   not decoration, it is where you are in the document.
   ========================================================================== */

const LABELS: Record<string, string> = {
  '/': 'MASTER',
  '/music': 'CATALOGUE',
  '/artists': 'ROSTER',
  '/about': 'STORY',
  '/contact': 'BOOKING',
}

export function ChannelStrip() {
  const pathname = usePathname()
  const [progress, setProgress] = useState(0)
  const frame = useRef(0)

  useEffect(() => {
    const read = () => {
      frame.current = 0
      const doc = document.documentElement
      const scrollable = doc.scrollHeight - window.innerHeight
      setProgress(
        scrollable > 8 ? Math.min(1, Math.max(0, window.scrollY / scrollable)) : 0,
      )
    }

    // Coalesced to one read per frame: a scroll handler that measures layout on
    // every event is the classic way to lose 60fps.
    const onScroll = () => {
      if (frame.current) return
      frame.current = requestAnimationFrame(read)
    }

    read()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [pathname])

  const label = LABELS[pathname] ?? 'MELOPHILE'

  return (
    <div className="strip" aria-hidden="true">
      <div className="strip__rule" />

      {/* The cap lives inside the scale so its percentage resolves against the
          same track as the ticks it is read against — not against the viewport. */}
      <div className="strip__scale">
        {/* Gain markings. Real intervals, unevenly spaced like a real fader. */}
        {[0, 0.14, 0.3, 0.46, 0.6, 0.72, 0.84, 1].map((at, i) => (
          <span
            key={at}
            className="strip__tick"
            data-major={i === 0 || i === 4 || i === 7 ? 'true' : 'false'}
            style={{ top: `${at * 100}%` }}
          />
        ))}

        <span className="strip__cap" style={{ top: `${progress * 100}%` }} />
      </div>

      <span className="strip__label label">{label}</span>
    </div>
  )
}
