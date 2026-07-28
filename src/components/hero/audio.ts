/* ==========================================================================
   Optional hero audio — synthesised, never a downloaded asset.

   Rules this file exists to enforce:
     · default OFF, behind an explicit toggle with aria-pressed
     · the AudioContext is not created until the user asks for it, because
       creating one unprompted is both rude and blocked by browsers
     · when it IS on, the oscilloscope reads genuine time-domain data from an
       AnalyserNode rather than the synthetic envelope
     · zero bytes of audio are shipped: it is a noise buffer, a bandpass whose
       frequency sweeps, and a sine at the transient

   Everything is quiet on purpose. This is a room tone, not a jingle.
   ========================================================================== */

export type HeroAudio = {
  enable(): Promise<boolean>
  disable(): void
  isOn(): boolean
  /** Runs the filter sweep and the lock transient, aligned to the animation. */
  runSequence(sweepStartMs: number, sweepEndMs: number, lockMs: number): void
  /** Fills `out` with time-domain samples. False if there is nothing to read. */
  readTimeDomain(out: Uint8Array): boolean
  dispose(): void
}

type Nodes = {
  ctx: AudioContext
  master: GainNode
  analyser: AnalyserNode
  noise: AudioBufferSourceNode
  band: BiquadFilterNode
  bed: GainNode
}

const MASTER_LEVEL = 0.07

function makeNoiseBuffer(ctx: AudioContext): AudioBuffer {
  const seconds = 2
  const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  // Pink-ish noise via a cheap running average. White noise through a bandpass
  // sounds like a hiss; this sounds like a room.
  let last = 0
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1
    last = (last + 0.02 * white) / 1.02
    data[i] = last * 3.2
  }
  return buffer
}

export function createHeroAudio(): HeroAudio | null {
  if (typeof window === 'undefined') return null

  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null

  let nodes: Nodes | null = null
  let on = false
  let disposed = false

  async function enable(): Promise<boolean> {
    if (disposed) return false
    try {
      if (!nodes) {
        const ctx = new Ctor()

        const master = ctx.createGain()
        master.gain.value = 0
        master.connect(ctx.destination)

        const analyser = ctx.createAnalyser()
        analyser.fftSize = 2048
        analyser.smoothingTimeConstant = 0.7
        analyser.connect(master)

        const band = ctx.createBiquadFilter()
        band.type = 'bandpass'
        band.frequency.value = 320
        band.Q.value = 1.4
        band.connect(analyser)

        const bed = ctx.createGain()
        bed.gain.value = 0.55
        bed.connect(band)

        const noise = ctx.createBufferSource()
        noise.buffer = makeNoiseBuffer(ctx)
        noise.loop = true
        noise.connect(bed)
        noise.start()

        nodes = { ctx, master, analyser, noise, band, bed }
      }

      if (nodes.ctx.state === 'suspended') await nodes.ctx.resume()

      const now = nodes.ctx.currentTime
      nodes.master.gain.cancelScheduledValues(now)
      nodes.master.gain.setValueAtTime(nodes.master.gain.value, now)
      nodes.master.gain.linearRampToValueAtTime(MASTER_LEVEL, now + 0.35)
      on = true
      return true
    } catch {
      // An audio failure must never take the animation with it.
      return false
    }
  }

  function disable(): void {
    on = false
    if (!nodes) return
    try {
      const now = nodes.ctx.currentTime
      nodes.master.gain.cancelScheduledValues(now)
      nodes.master.gain.setValueAtTime(nodes.master.gain.value, now)
      nodes.master.gain.linearRampToValueAtTime(0, now + 0.2)
    } catch {
      /* nothing to recover from */
    }
  }

  function runSequence(sweepStartMs: number, sweepEndMs: number, lockMs: number): void {
    if (!on || !nodes) return
    const { ctx, band, bed } = nodes
    const t0 = ctx.currentTime

    try {
      // The filter sweep: the same knob turn the letterforms are resolving to.
      band.frequency.cancelScheduledValues(t0)
      band.frequency.setValueAtTime(180, t0 + sweepStartMs / 1000)
      band.frequency.exponentialRampToValueAtTime(2600, t0 + sweepEndMs / 1000)
      band.frequency.exponentialRampToValueAtTime(700, t0 + (lockMs + 700) / 1000)

      // Bed ducks under the transient so the hit reads as a hit.
      bed.gain.cancelScheduledValues(t0)
      bed.gain.setValueAtTime(0.5, t0)
      bed.gain.linearRampToValueAtTime(0.62, t0 + lockMs / 1000)
      bed.gain.linearRampToValueAtTime(0.28, t0 + (lockMs + 260) / 1000)

      // The relay closing: a short low sine with a fast decay.
      const at = t0 + lockMs / 1000
      const osc = ctx.createOscillator()
      const env = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(150, at)
      osc.frequency.exponentialRampToValueAtTime(58, at + 0.16)
      env.gain.setValueAtTime(0.0001, at)
      env.gain.exponentialRampToValueAtTime(0.9, at + 0.008)
      env.gain.exponentialRampToValueAtTime(0.0001, at + 0.26)
      osc.connect(env)
      env.connect(nodes.analyser)
      osc.start(at)
      osc.stop(at + 0.3)
    } catch {
      /* scheduling failed; the visual sequence is unaffected */
    }
  }

  function readTimeDomain(out: Uint8Array): boolean {
    if (!on || !nodes) return false
    try {
      nodes.analyser.getByteTimeDomainData(out as Uint8Array<ArrayBuffer>)
      return true
    } catch {
      return false
    }
  }

  function dispose(): void {
    disposed = true
    on = false
    if (!nodes) return
    try {
      nodes.noise.stop()
      nodes.noise.disconnect()
      nodes.band.disconnect()
      nodes.analyser.disconnect()
      nodes.master.disconnect()
      void nodes.ctx.close()
    } catch {
      /* already torn down */
    }
    nodes = null
  }

  return { enable, disable, isOn: () => on, runSequence, readTimeDomain, dispose }
}
