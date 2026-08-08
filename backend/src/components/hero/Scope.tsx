'use client'

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type ForwardedRef,
} from 'react'
import type { EffectTier } from './timeline'

/* ==========================================================================
   The oscilloscope trace under the letterforms.

   It does not own a rAF loop. The hero has exactly one clock, and it calls
   draw() on this component each frame — otherwise the trace and the type would
   be two animations that merely happen to be adjacent.

   Muted (the default), the trace is drawn from the envelope. Unmuted, it is
   genuine time-domain data from an AnalyserNode.
   ========================================================================== */

export type ScopeHandle = {
  /** level 0..1 from the envelope, hand 0..1 from cursor proximity. */
  draw(level: number, hand: number, samples: Uint8Array | null): void
}

type ScopeProps = { tier: EffectTier }

function ScopeImpl({ tier }: ScopeProps, ref: ForwardedRef<ScopeHandle>) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const size = useRef({ w: 0, h: 0, dpr: 1 })
  const phase = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      // Half resolution on reduced tier: the trace is 1px amber on near-black,
      // so the visual cost of this is close to nil and the saving is real.
      const dpr = Math.min(window.devicePixelRatio || 1, tier === 'full' ? 2 : 1)
      const w = Math.max(1, Math.round(rect.width))
      const h = Math.max(1, Math.round(rect.height))
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      size.current = { w, h, dpr }
    }

    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [tier])

  useImperativeHandle(
    ref,
    () => ({
      draw(level, hand, samples) {
        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        const { w, h, dpr } = size.current
        if (w === 0 || h === 0) return

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        ctx.clearRect(0, 0, w, h)

        const mid = h / 2
        const amp = Math.min(h / 2 - 1, (h / 2 - 1) * (0.28 + level * 0.72 + hand * 0.3))

        // Graticule: the centre line only. Anything more competes with the type.
        ctx.strokeStyle = 'rgba(42, 35, 32, 0.9)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(0, Math.round(mid) + 0.5)
        ctx.lineTo(w, Math.round(mid) + 0.5)
        ctx.stroke()

        phase.current += 0.045 + level * 0.05

        ctx.strokeStyle = 'rgba(217, 142, 43, 0.85)'
        ctx.lineWidth = 1
        ctx.beginPath()

        const step = tier === 'full' ? 1 : 2

        if (samples && samples.length > 0) {
          // Real frequency data. Scaled by the same envelope so a quiet moment
          // in the audio and a quiet moment in the animation agree.
          for (let x = 0; x <= w; x += step) {
            const i = Math.min(samples.length - 1, Math.floor((x / w) * samples.length))
            const v = ((samples[i] ?? 128) - 128) / 128
            const y = mid - v * amp * 1.6
            if (x === 0) ctx.moveTo(x, y)
            else ctx.lineTo(x, y)
          }
        } else {
          // Synthesised: three incommensurable sines so it never visibly loops.
          const k = (Math.PI * 2) / Math.max(80, w / 2.2)
          for (let x = 0; x <= w; x += step) {
            const p = x * k + phase.current
            const v =
              Math.sin(p) * 0.58 +
              Math.sin(p * 2.31 + 1.1) * 0.26 +
              Math.sin(p * 0.47 + 2.4) * 0.16
            const y = mid - v * amp
            if (x === 0) ctx.moveTo(x, y)
            else ctx.lineTo(x, y)
          }
        }

        ctx.stroke()
      },
    }),
    [tier],
  )

  return (
    <canvas
      ref={canvasRef}
      className="scope"
      /* The trace carries no information a sighted user needs and none a
         screen reader could use — the wordmark itself is the content. */
      aria-hidden="true"
    />
  )
}

export const Scope = forwardRef<ScopeHandle, ScopeProps>(ScopeImpl)
