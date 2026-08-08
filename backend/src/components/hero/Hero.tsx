'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ChainStrip, CrushFilters } from './ChainStrip'
import { Scope, type ScopeHandle } from './Scope'
import { VuMeter } from './VuMeter'
import { createHeroAudio, type HeroAudio } from './audio'
import {
  PEAK_HOLD_MS,
  PEAK_THRESHOLD,
  TIMELINE,
  bloomAt,
  breakAt,
  chainAt,
  clamp,
  crushAt,
  detectTier,
  displacementAt,
  driftAt,
  envelopeAt,
  ghostCountFor,
  integrateNeedle,
  needleAngle,
  overshootAt,
  splitAt,
  stageAt,
  sweepAt,
  timecodeAt,
  type EffectTier,
} from './timeline'

/* ==========================================================================
   MELOPHILE RECORDS — the wordmark that tunes itself in.

   It arrives as an untuned, chromatically split signal, passes visibly through
   a real delay line and a left-to-right filter sweep that resolves the glyphs
   one at a time, takes a two-frame bit-crush, then snaps to lock on a single
   hard transient while the VU needle kicks against the stop.

   The needle, the scope and the IN→EQ→COMP→OUT strip all read the same
   envelope as the letterforms, which is why they are a readout of the
   animation rather than decoration beside it.

   Timings: ./timeline.ts — that file is the only place to tune them.
   ========================================================================== */

const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect

const MAX_GHOSTS = 4
const GAIN_MARKS = ['-20', '-10', '-7', '-5', '-3', '0', '+3']

export type HeroProps = {
  line1: string
  line2: string
  tagline: string
  scrollCue: string
  /** Short code for the readout strip, e.g. 'LMTLS'. */
  readoutCode: string
}

/** Splits a line into per-glyph spans carrying a static normalised position. */
function SplitLine({ text }: { text: string }) {
  const chars = [...text]
  const last = Math.max(1, chars.length - 1)
  return (
    <span className="mark__line">
      {chars.map((ch, i) => (
        <span
          key={`${ch}-${i}`}
          className="mark__char"
          style={{ '--i': i / last } as React.CSSProperties}
        >
          {ch === ' ' ? ' ' : ch}
        </span>
      ))}
    </span>
  )
}

function MarkText({
  line1,
  line2,
  split,
}: {
  line1: string
  line2: string
  split: boolean
}) {
  if (!split) {
    return (
      <>
        <span className="mark__line">{line1}</span>
        <span className="mark__line">{line2}</span>
      </>
    )
  }
  return (
    <>
      <SplitLine text={line1} />
      <SplitLine text={line2} />
    </>
  )
}

export function Hero({ line1, line2, tagline, scrollCue, readoutCode }: HeroProps) {
  const rootRef = useRef<HTMLElement | null>(null)
  const markRef = useRef<HTMLDivElement | null>(null)
  const scopeRef = useRef<ScopeHandle | null>(null)
  const timecodeRef = useRef<HTMLSpanElement | null>(null)
  const ghostRefs = useRef<(HTMLDivElement | null)[]>([])
  const audioRef = useRef<HeroAudio | null>(null)

  const [tier, setTier] = useState<EffectTier>('still')
  const [audioOn, setAudioOn] = useState(false)
  const [canAudio, setCanAudio] = useState(false)
  const [replayKey, setReplayKey] = useState(0)

  // Cursor proximity target, written by pointermove and lerped in the loop so
  // pointer events never drive layout or style directly.
  const handTarget = useRef(0)

  useEffect(() => {
    setCanAudio(createHeroAudio() !== null)
    return () => {
      audioRef.current?.dispose()
      audioRef.current = null
    }
  }, [])

  const replay = useCallback(() => {
    setReplayKey((k) => k + 1)
    audioRef.current?.runSequence(TIMELINE.sweepStart, TIMELINE.sweepEnd, TIMELINE.lock)
  }, [])

  const toggleAudio = useCallback(async () => {
    if (!audioRef.current) audioRef.current = createHeroAudio()
    const audio = audioRef.current
    if (!audio) {
      setCanAudio(false)
      return
    }
    if (audio.isOn()) {
      audio.disable()
      setAudioOn(false)
      return
    }
    const ok = await audio.enable()
    setAudioOn(ok)
    if (!ok) setCanAudio(false)
  }, [])

  /* ------------------------------------------------------------------ *
   * The clock. One rAF loop, writing custom properties on one element.
   * ------------------------------------------------------------------ */
  useIsomorphicLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return

    const detected = detectTier()
    setTier(detected)

    const style = root.style
    const ghostCount = ghostCountFor(detected)

    // Ghost base opacity is 0.62^n and never changes, so it is written once
    // here rather than every frame.
    ghostRefs.current.forEach((el, n) => {
      if (!el) return
      const base = n < ghostCount ? TIMELINE.delayFeedback ** (n + 1) : 0
      el.style.setProperty('--ghost-base', base.toFixed(4))
    })

    /* ---- reduced motion: the locked final state, one fade, no clock ---- */
    if (detected === 'still') {
      root.dataset.mode = 'still'
      root.dataset.locked = 'true'
      root.dataset.swept = 'true'
      root.dataset.crush = '0'
      style.setProperty('--sweep', '1.25')
      style.setProperty('--split', '0')
      style.setProperty('--env', '0.34')
      style.setProperty('--chain', '4')
      style.setProperty('--needle-deg', needleAngle(0.7).toFixed(2))
      style.setProperty('--mark-scale', '1')
      style.setProperty('--flash', '0')
      style.setProperty('--bloom', '0')
      if (timecodeRef.current) timecodeRef.current.textContent = '00:00:00:00'
      // One static trace, so the instrumentation still reads as instrumentation.
      requestAnimationFrame(() => scopeRef.current?.draw(0.34, 0, null))
      return
    }

    root.dataset.mode = 'run'

    let raf = 0
    let running = false
    let start = performance.now()
    let last = start
    let pausedAt = 0
    let needle = 0
    let peakUntil = 0
    let hand = 0

    const history: { t: number; x: number }[] = []
    const samples = new Uint8Array(1024)

    /** Reads the delay line: the mark's offset as it was `ago` ms in the past. */
    const tapAt = (ago: number, nowElapsed: number): number => {
      const target = nowElapsed - ago
      if (target <= 0 || history.length === 0) return 0
      for (let i = history.length - 1; i >= 0; i--) {
        const sample = history[i]
        if (sample && sample.t <= target) return sample.x
      }
      return history[0]?.x ?? 0
    }

    const setAttr = (
      key: 'stage' | 'crush' | 'locked' | 'swept' | 'peak',
      value: string,
    ) => {
      if (root.dataset[key] !== value) root.dataset[key] = value
    }

    const frame = (now: number) => {
      const elapsed = now - start
      const dt = Math.min(80, now - last)
      last = now

      hand += (handTarget.current - hand) * Math.min(1, dt / 140)

      const env = envelopeAt(elapsed)
      const disp = displacementAt(elapsed)
      // Cursor proximity is the hand on the knob: it raises effect intensity
      // without ever changing the choreography.
      const split = clamp(splitAt(elapsed) * (1 + hand * 0.55) + hand * 0.06, 0, 1.4)

      history.push({ t: elapsed, x: disp.x })
      while (history.length > 0 && elapsed - (history[0]?.t ?? 0) > 700) history.shift()

      needle = integrateNeedle(needle, env, dt)
      if (env > PEAK_THRESHOLD) peakUntil = now + PEAK_HOLD_MS

      const drift = driftAt(elapsed)
      const crush = tier === 'full' ? crushAt(elapsed) : 0

      const gate =
        elapsed < TIMELINE.delayStart
          ? 0
          : elapsed < TIMELINE.lock
            ? 1
            : Math.max(0, 1 - (elapsed - TIMELINE.lock) / 160)

      style.setProperty('--env', env.toFixed(4))
      style.setProperty('--split', split.toFixed(4))
      style.setProperty('--sweep', sweepAt(elapsed).toFixed(4))
      style.setProperty('--mark-x', disp.x.toFixed(3))
      style.setProperty('--mark-y', disp.y.toFixed(3))
      style.setProperty('--mark-scale', overshootAt(elapsed).toFixed(5))
      style.setProperty('--break-x', breakAt(elapsed).toFixed(3))
      style.setProperty('--flash', flashValue(elapsed))
      style.setProperty('--bloom', bloomAt(elapsed).toFixed(4))
      style.setProperty('--chain', chainAt(elapsed).toFixed(3))
      style.setProperty('--needle-deg', needleAngle(needle).toFixed(2))
      style.setProperty('--hand', hand.toFixed(4))
      style.setProperty('--drift-x', drift.x.toFixed(4))
      style.setProperty('--drift-r', drift.r.toFixed(4))
      style.setProperty('--ghost-gate', gate.toFixed(4))

      for (let n = 0; n < ghostCount; n++) {
        const el = ghostRefs.current[n]
        if (el) {
          el.style.setProperty(
            '--gx',
            tapAt((n + 1) * TIMELINE.delayTap, elapsed).toFixed(3),
          )
        }
      }

      // Reflected onto the element so the DOM says which stage it is in — worth
      // having when you are tuning timings with devtools open.
      setAttr('stage', stageAt(elapsed))
      setAttr('crush', String(crush))
      setAttr('locked', elapsed >= TIMELINE.lock ? 'true' : 'false')
      setAttr('swept', elapsed >= TIMELINE.sweepEnd ? 'true' : 'false')
      setAttr('peak', now < peakUntil ? 'true' : 'false')

      const code = timecodeAt(elapsed)
      const tc = timecodeRef.current
      if (tc && tc.textContent !== code) tc.textContent = code

      const live = audioRef.current?.readTimeDomain(samples) ? samples : null
      scopeRef.current?.draw(env, hand, live)

      raf = requestAnimationFrame(frame)
    }

    const resume = () => {
      if (running) return
      running = true
      const now = performance.now()
      // Carry the elapsed time across the pause so an idle hero stays idle.
      if (pausedAt) start += now - pausedAt
      pausedAt = 0
      last = now
      raf = requestAnimationFrame(frame)
    }

    const pause = () => {
      if (!running) return
      running = false
      pausedAt = performance.now()
      cancelAnimationFrame(raf)
    }

    /* Off-screen or backgrounded, the loop stops. A permanent idle animation
       that keeps drawing behind three other sections is a battery bug. */
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.some((e) => e.isIntersecting)
        if (visible && !document.hidden) resume()
        else pause()
      },
      { threshold: 0 },
    )
    observer.observe(root)

    const onVisibility = () => {
      if (document.hidden) pause()
      else if (root.getBoundingClientRect().bottom > 0) resume()
    }
    document.addEventListener('visibilitychange', onVisibility)

    /* Cursor as a hand on a knob. Fine pointers only. */
    let onPointerMove: ((e: PointerEvent) => void) | null = null
    if (detected === 'full') {
      onPointerMove = (event: PointerEvent) => {
        const mark = markRef.current
        if (!mark) return
        const box = mark.getBoundingClientRect()
        const cx = box.left + box.width / 2
        const cy = box.top + box.height / 2
        const reach = Math.max(box.width * 0.9, 520)
        const distance = Math.hypot(event.clientX - cx, event.clientY - cy)
        handTarget.current = clamp(1 - distance / reach)
      }
      window.addEventListener('pointermove', onPointerMove, { passive: true })
    }

    resume()

    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      if (onPointerMove) window.removeEventListener('pointermove', onPointerMove)
      handTarget.current = 0
    }
    // replayKey restarts the whole sequence from zero.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replayKey])

  const ariaLabel = `${line1} ${line2}`.replace(/\s+/g, ' ').trim()

  return (
    <section
      ref={rootRef}
      className="hero"
      data-mode="pre"
      aria-labelledby="wordmark"
      /* If JS never runs, this stays "pre" and CSS reveals the locked
         wordmark after 2.2s rather than leaving it invisible. */
    >
      <CrushFilters />

      <div className="hero__inner">
        <div className="hero__gear hero__gear--top">
          <ChainStrip />
          <VuMeter />
        </div>

        <div className="hero__stage">
          <div className="hero__bloom" aria-hidden="true" />

          <div className="mark" ref={markRef}>
            {Array.from({ length: MAX_GHOSTS }, (_, n) => (
              <div
                key={`ghost-${n}`}
                ref={(el) => {
                  ghostRefs.current[n] = el
                }}
                className="mark__layer mark__ghost"
                style={{ '--n': n } as React.CSSProperties}
                aria-hidden="true"
              >
                <MarkText line1={line1} line2={line2} split={false} />
              </div>
            ))}

            <div className="mark__layer mark__chan mark__chan--b" aria-hidden="true">
              <MarkText line1={line1} line2={line2} split />
            </div>
            <div className="mark__layer mark__chan mark__chan--g" aria-hidden="true">
              <MarkText line1={line1} line2={line2} split />
            </div>
            <div className="mark__layer mark__chan mark__chan--r" aria-hidden="true">
              <MarkText line1={line1} line2={line2} split />
            </div>

            <div className="mark__layer mark__break" aria-hidden="true">
              <MarkText line1={line1} line2={line2} split />
            </div>

            {/* The real, selectable text. aria-label so assistive tech hears the
              name rather than sixteen separate letters. */}
            <h1 id="wordmark" className="mark__solid" aria-label={ariaLabel}>
              <MarkText line1={line1} line2={line2} split />
            </h1>
          </div>

          <div className="hero__flash" aria-hidden="true" />

          <div className="hero__scope-row">
            <Scope ref={scopeRef} tier={tier} />

            <div className="hero__gain mono" aria-hidden="true">
              {GAIN_MARKS.map((mark) => (
                <span key={mark}>{mark}</span>
              ))}
            </div>

            <p className="hero__readout mono">
              <span className="hero__cat">{readoutCode}</span>
              <span aria-hidden="true">▸</span>
              <span className="hero__tc" ref={timecodeRef}>
                00:00:00:00
              </span>
            </p>
          </div>

          {tagline ? <p className="hero__tagline">{tagline}</p> : null}
        </div>

        <div className="hero__gear hero__gear--bottom">
          <div className="hero__controls">
            <span className="hero__rec label">
              <span className="hero__rec-dot" aria-hidden="true" />
              REC
            </span>

            {canAudio ? (
              <button
                type="button"
                className="hero__ctrl"
                aria-pressed={audioOn}
                onClick={toggleAudio}
              >
                <span className="hero__ctrl-lamp" aria-hidden="true" />
                {audioOn ? 'Sound on' : 'Sound off'}
              </button>
            ) : null}

            {tier !== 'still' ? (
              <button type="button" className="hero__ctrl" onClick={replay}>
                Replay
              </button>
            ) : null}
          </div>

          <a className="hero__cue" href="#music">
            {scrollCue}
            <span className="hero__cue-line" aria-hidden="true" />
          </a>
        </div>
      </div>
    </section>
  )
}

/** Kept out of the loop body so the flash value is a single expression. */
function flashValue(elapsed: number): string {
  if (elapsed < TIMELINE.lock) return '0'
  const p = Math.min(1, (elapsed - TIMELINE.lock) / 150)
  return (0.06 * (1 - p) ** 2).toFixed(5)
}
