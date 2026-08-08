/* ==========================================================================
   The hero choreography. Every millisecond of it lives in this file.

   ── TUNING ───────────────────────────────────────────────────────────────
   Change TIMELINE below and the whole sequence moves with it. Nothing else
   in the codebase hard-codes a hero duration. The four stages are:

     INPUT      the signal arrives untuned — chromatic split, scanline break
     PROCESS    it passes through gear — delay line, filter sweep, bit-crush
     LOCK       one hard transient. relay closes. one frame of overshoot.
     IDLE       alive but calm — drift, scope trace, needle breathing

   ── WHY THERE IS NO GSAP HERE ────────────────────────────────────────────
   The brief suggests a timeline library, and normally that is right. Here the
   VU needle, the scope amplitude and the IN→EQ→COMP→OUT strip all have to be
   driven by the animation's *own envelope* — which forces one JS-owned
   envelope function on requestAnimationFrame whether or not a library exists.
   Once that clock exists, a timeline library is a wrapper around `switch (t)`.
   So the choreography is a pure function of elapsed milliseconds, and the
   whole hero is one rAF loop writing custom properties on one element.
   ========================================================================== */

export const TIMELINE = {
  /** Untuned arrival ends here. */
  inputEnd: 620,

  /** Delay line runs across the whole processing stage. */
  delayStart: 620,
  delayEnd: 2280,
  /** Spacing between ghost taps, in ms. Ghost n samples the mark n×this ago. */
  delayTap: 90,
  /** Feedback per tap. 0.62^n — a real decaying repeat, not a static smear. */
  delayFeedback: 0.62,

  /** The filter sweep: a knob turning left to right across the letterforms. */
  sweepStart: 760,
  sweepEnd: 2100,

  /** Momentary distortion. Steps, never eases. */
  crushStart: 2050,
  crushEnd: 2170,

  /** The transient. */
  lock: 2280,
  overshootEnd: 2450,
  settleEnd: 2600,

  /** Total before the sequence hands over to idle. 3.10s — inside 2.5–3.5s. */
  duration: 3100,
} as const

export type Stage = 'input' | 'process' | 'lock' | 'idle'

/** How many effects run. Derived once at mount; never re-derived per frame. */
export type EffectTier = 'full' | 'reduced' | 'still'

/* --------------------------------- maths --------------------------------- */

export const clamp = (v: number, min = 0, max = 1) => Math.min(max, Math.max(min, v))

/** Normalised progress across [a, b], clamped. */
export const span = (ms: number, a: number, b: number) => clamp((ms - a) / (b - a))

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t

const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t))
const easeInOutSine = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2

/**
 * Deterministic pseudo-noise. Sum of incommensurable sines rather than
 * Math.random, so a replay looks the same twice and the server and client never
 * disagree. Returns roughly -1..1.
 */
export function noise(t: number, seed = 0): number {
  return (
    Math.sin(t * 0.0131 + seed) * 0.5 +
    Math.sin(t * 0.0298 + seed * 1.7 + 1.3) * 0.32 +
    Math.sin(t * 0.0071 + seed * 0.4 + 2.7) * 0.18
  )
}

/* -------------------------------- stages -------------------------------- */

export function stageAt(ms: number): Stage {
  if (ms < TIMELINE.inputEnd) return 'input'
  if (ms < TIMELINE.lock) return 'process'
  if (ms < TIMELINE.settleEnd) return 'lock'
  return 'idle'
}

/**
 * The signal level. This one number drives the VU needle, the scope amplitude
 * and the chain strip, which is the whole reason the instrumentation reads as a
 * readout rather than as decoration.
 */
export function envelopeAt(ms: number): number {
  if (ms < TIMELINE.inputEnd) {
    // Loud and unstable: an untuned input pinning and falling back.
    return clamp(0.52 + Math.abs(noise(ms * 2.1)) * 0.4, 0, 1)
  }

  if (ms < TIMELINE.lock) {
    const p = span(ms, TIMELINE.inputEnd, TIMELINE.lock)
    const base = lerp(0.44, 0.63, p)
    return clamp(base + noise(ms * 1.4, 3) * 0.1, 0, 1)
  }

  if (ms < TIMELINE.settleEnd) {
    // The transient, then ballistic decay toward the idle floor.
    const p = span(ms, TIMELINE.lock, TIMELINE.settleEnd)
    return clamp(lerp(1, 0.34, easeOutExpo(p)), 0, 1)
  }

  // Idle: slow, plausible program material. Never enough to pull focus.
  const t = ms - TIMELINE.settleEnd
  return clamp(0.3 + noise(t * 0.45, 7) * 0.12, 0.08, 0.62)
}

/**
 * Chromatic separation, 0..1. Full at arrival, walked down through processing,
 * exactly zero at lock — which is when the three screen-blended channels
 * recombine to --tape and the cold fringing disappears from the palette.
 */
export function splitAt(ms: number): number {
  if (ms < TIMELINE.inputEnd) {
    return clamp(0.82 + noise(ms * 3.3, 11) * 0.18, 0.4, 1)
  }
  if (ms < TIMELINE.lock) {
    const p = span(ms, TIMELINE.inputEnd, TIMELINE.lock)
    return clamp(lerp(0.8, 0, easeInOutSine(p)) + noise(ms * 2.2, 5) * 0.05 * (1 - p))
  }
  return 0
}

/**
 * The filter sweep position. Runs from before the first glyph (-0.2) to past
 * the last (1.25). Each glyph carries a static --i and computes its own blur
 * from this single value in CSS, so one property write resolves 17 letters.
 */
export function sweepAt(ms: number): number {
  if (ms < TIMELINE.sweepStart) return -0.2
  if (ms >= TIMELINE.sweepEnd) return 1.25
  return lerp(-0.2, 1.25, easeInOutSine(span(ms, TIMELINE.sweepStart, TIMELINE.sweepEnd)))
}

/** Whole-mark displacement while the signal is untuned. Transform only. */
export function displacementAt(ms: number): { x: number; y: number } {
  if (ms < TIMELINE.inputEnd) {
    const fall = 1 - span(ms, 0, TIMELINE.inputEnd) * 0.45
    return {
      x: noise(ms * 4.1, 2) * 26 * fall,
      y: noise(ms * 3.4, 9) * 7 * fall,
    }
  }
  if (ms < TIMELINE.lock) {
    const settle = 1 - span(ms, TIMELINE.inputEnd, TIMELINE.lock)
    return { x: noise(ms * 1.9, 4) * 5 * settle, y: noise(ms * 1.3, 6) * 1.6 * settle }
  }
  return { x: 0, y: 0 }
}

/** Torn-scanline offset for the masked break layer. Dies at the end of input. */
export function breakAt(ms: number): number {
  if (ms >= TIMELINE.inputEnd) return 0
  // Steps rather than glides: a tape head slipping, not a slide.
  const step = Math.floor(ms / 70)
  return noise(step * 31, 13) * 34
}

/** Scale multiplier. 1 everywhere except the transient's single overshoot. */
export function overshootAt(ms: number): number {
  if (ms < TIMELINE.lock || ms >= TIMELINE.overshootEnd) return 1
  const p = span(ms, TIMELINE.lock, TIMELINE.overshootEnd)
  return lerp(1.028, 1, easeOutExpo(p))
}

/** A single-frame white bloom at the transient. Opacity only. */
export function flashAt(ms: number): number {
  if (ms < TIMELINE.lock) return 0
  return lerp(0.06, 0, easeOutExpo(span(ms, TIMELINE.lock, TIMELINE.lock + 150)))
}

/** Reverb bloom: expands from the type at the transient and decays. */
export function bloomAt(ms: number): number {
  if (ms < TIMELINE.lock) return 0
  return lerp(1, 0, easeOutExpo(span(ms, TIMELINE.lock, TIMELINE.lock + 620)))
}

/** How far along IN → EQ → COMP → OUT the signal has travelled, 0..4. */
export function chainAt(ms: number): number {
  if (ms >= TIMELINE.lock) return 4
  if (ms < TIMELINE.inputEnd) return 0.9
  return lerp(1, 3.4, span(ms, TIMELINE.inputEnd, TIMELINE.lock))
}

/** Bit-crush level, 0 = off, 1..3 = stepped. Discrete because quantisation is. */
export function crushAt(ms: number): 0 | 1 | 2 | 3 {
  if (ms < TIMELINE.crushStart || ms >= TIMELINE.crushEnd) return 0
  const p = span(ms, TIMELINE.crushStart, TIMELINE.crushEnd)
  return (Math.min(2, Math.floor(p * 3)) + 1) as 1 | 2 | 3
}

/** Idle drift. ±0.6px and ±0.15° on an 11s cycle — alive, but calm. */
export function driftAt(ms: number): { x: number; r: number } {
  if (ms < TIMELINE.lock) return { x: 0, r: 0 }
  const t = (ms - TIMELINE.lock) / 1000
  const ramp = clamp(t / 1.2)
  return {
    x: Math.sin((t / 11) * Math.PI * 2) * 0.6 * ramp,
    r: Math.sin((t / 17) * Math.PI * 2 + 1.1) * 0.15 * ramp,
  }
}

/* ------------------------------ VU ballistics ------------------------------ */

/**
 * A real VU meter reaches 99% of a step in 300ms, which puts the time constant
 * near 65ms. Integrating properly is why the needle *slams and rebounds* at the
 * transient instead of tracking the envelope exactly — that rebound is the
 * mechanical moment people remember.
 */
const VU_TAU_MS = 65

export function integrateNeedle(current: number, target: number, dtMs: number): number {
  const k = 1 - Math.exp(-Math.max(0, dtMs) / VU_TAU_MS)
  return current + (target - current) * k
}

/** Needle angle in degrees across the scale. -46° is -20dB, +46° is +3dB. */
export function needleAngle(level: number): number {
  return lerp(-46, 46, clamp(level))
}

/** Peak lights above this and holds, like a real over-level LED. */
export const PEAK_THRESHOLD = 0.9
export const PEAK_HOLD_MS = 900

/* -------------------------------- timecode -------------------------------- */

/** SMPTE at 25fps, counting from the lock. Real format, real rate. */
export function timecodeAt(ms: number): string {
  const from = Math.max(0, ms - TIMELINE.lock)
  const totalFrames = Math.floor((from / 1000) * 25)
  const frames = totalFrames % 25
  const totalSeconds = Math.floor(totalFrames / 25)
  const seconds = totalSeconds % 60
  const minutes = Math.floor(totalSeconds / 60) % 60
  const hours = Math.floor(totalSeconds / 3600) % 24
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}:${pad(frames)}`
}

/* ------------------------------- effect tier ------------------------------- */

/**
 * Degrade the effect COUNT, never the frame rate. Ranked by what a person would
 * repeat when describing the animation: the sweep and the split are the
 * signature and never drop; the delay loses taps; the crush goes first.
 */
export function detectTier(): EffectTier {
  if (typeof window === 'undefined') return 'still'

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return 'still'

  const coarse = window.matchMedia('(pointer: coarse)').matches
  const narrow = window.innerWidth < 720
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory
  const cores = navigator.hardwareConcurrency ?? 8

  if (coarse || narrow || (memory !== undefined && memory <= 4) || cores <= 4) {
    return 'reduced'
  }
  return 'full'
}

export function ghostCountFor(tier: EffectTier): number {
  if (tier === 'still') return 0
  return tier === 'reduced' ? 1 : 4
}
