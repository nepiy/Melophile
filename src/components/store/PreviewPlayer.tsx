'use client'

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import type { PreviewKind } from '@/db'
import { safeUrl } from '@/lib/markdown'

/* ==========================================================================
   Listen before you buy.

   Two shapes behind one component. An audio clip gets a player built out of
   the same parts as the rest of the site — a hairline, an amber cap, mono
   figures — because the browser's default control bar is the one piece of
   chrome we do not draw. A video gets an iframe, and only after a click:
   embedding a third party on load means their scripts and their cookies on a
   page the visitor may never have wanted to watch.

   ONE PREVIEW AT A TIME. Every player shouts `preview:play` with its own id
   when it starts, and stops itself when it hears an id that is not its own.
   No shared state, no context, no provider — two products on one page can be
   rendered by two different trees and still never talk over each other.

   The seeded catalogue has no preview URLs, so `previewKind` says 'audio' on
   rows with nothing to play. That is why the guard below tests the URL and not
   just the kind: a player with no source is worse than no player at all.
   ========================================================================== */

const PREVIEW_EVENT = 'preview:play'

/** Seconds → '3:24'. Never the browser's locale, never NaN on screen. */
function clock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00'
  const total = Math.floor(seconds)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/**
 * safeUrl() also passes mailto: and tel:, which are fine in prose and useless
 * in a media element. Media is http(s) or a path under /uploads, or nothing.
 */
function mediaUrl(raw: string): string | null {
  const url = safeUrl(raw)
  if (!url) return null
  return /^(https?:\/\/|\/)/.test(url) ? url : null
}

export type PreviewPlayerProps = {
  /** The product id. The token that decides which player keeps playing. */
  id: number
  kind: PreviewKind
  url: string
  title: string
}

export function PreviewPlayer({ id, kind, url, title }: PreviewPlayerProps) {
  const href = kind === 'none' ? null : mediaUrl(url)
  if (!href) return null
  if (kind === 'video') return <VideoPreview id={id} url={href} title={title} />
  return <AudioPreview id={id} url={href} title={title} />
}

/* ------------------------------- audio --------------------------------- */

function AudioPreview({ id, url, title }: { id: number; url: string; title: string }) {
  const ref = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [duration, setDuration] = useState(0)

  useEffect(() => {
    const onOther = (event: Event) => {
      if ((event as CustomEvent<number>).detail === id) return
      ref.current?.pause()
    }
    window.addEventListener(PREVIEW_EVENT, onOther)
    return () => window.removeEventListener(PREVIEW_EVENT, onOther)
  }, [id])

  const toggle = useCallback(() => {
    const el = ref.current
    if (!el) return
    if (el.paused) {
      // Announced before we start, so the player that is already running has
      // stopped by the time this one makes a sound.
      window.dispatchEvent(new CustomEvent(PREVIEW_EVENT, { detail: id }))
      void el.play().catch(() => setPlaying(false))
    } else {
      el.pause()
    }
  }, [id])

  const seekable = duration > 0
  const played = seekable ? Math.min(100, (elapsed / duration) * 100) : 0

  return (
    <div className="st-pv">
      <div className="st-pv__row">
        <button
          type="button"
          className="st-pv__play"
          onClick={toggle}
          aria-pressed={playing}
          aria-label={
            playing ? `Pause the ${title} preview` : `Play the ${title} preview`
          }
        >
          <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
            {playing ? (
              <path d="M3 1h2v10H3zM7 1h2v10H7z" fill="currentColor" />
            ) : (
              <path d="M2 1 11 6 2 11Z" fill="currentColor" />
            )}
          </svg>
        </button>

        <input
          type="range"
          className="st-pv__bar"
          min={0}
          max={seekable ? duration : 0}
          step={0.01}
          value={elapsed}
          disabled={!seekable}
          aria-label={`Seek within the ${title} preview`}
          aria-valuetext={`${clock(elapsed)} of ${clock(duration)}`}
          style={{ '--played': `${played}%` } as CSSProperties}
          onChange={(event) => {
            const next = Number(event.target.value)
            setElapsed(next)
            if (ref.current) ref.current.currentTime = next
          }}
        />

        <p className="mono st-pv__time">
          {clock(elapsed)}
          <span className="st-pv__slash" aria-hidden="true">
            /
          </span>
          {clock(duration)}
        </p>
      </div>

      {/* No `controls`: the row above is the control surface. */}
      <audio
        ref={ref}
        src={url}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(event) => setElapsed(event.currentTarget.currentTime)}
        onLoadedMetadata={(event) => {
          const value = event.currentTarget.duration
          setDuration(Number.isFinite(value) ? value : 0)
        }}
      />
    </div>
  )
}

/* ------------------------------- video --------------------------------- */

function VideoPreview({ id, url, title }: { id: number; url: string; title: string }) {
  const [live, setLive] = useState(false)

  useEffect(() => {
    const onOther = (event: Event) => {
      if ((event as CustomEvent<number>).detail === id) return
      // Unmounting the frame is how an embed we do not control gets stopped.
      setLive(false)
    }
    window.addEventListener(PREVIEW_EVENT, onOther)
    return () => window.removeEventListener(PREVIEW_EVENT, onOther)
  }, [id])

  if (!live) {
    return (
      <div className="st-pv">
        <button
          type="button"
          className="st-pv__poster"
          onClick={() => {
            window.dispatchEvent(new CustomEvent(PREVIEW_EVENT, { detail: id }))
            setLive(true)
          }}
        >
          <span className="st-pv__play" aria-hidden="true">
            <svg viewBox="0 0 12 12" width="12" height="12">
              <path d="M2 1 11 6 2 11Z" fill="currentColor" />
            </svg>
          </span>
          <span className="label st-pv__poster-label">Play the preview</span>
        </button>
      </div>
    )
  }

  return (
    <div className="st-pv">
      <div className="st-pv__frame">
        <iframe
          src={url}
          title={`${title} — preview`}
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          allow="accelerometer; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
        />
      </div>
    </div>
  )
}
