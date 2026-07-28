/* ==========================================================================
   Procedural placeholder artwork.

   The client replaces all of this from the admin, but a catalogue page with
   nine grey boxes does not let anyone judge the design — and shipping stock
   photography would be worse. So the seed generates real sleeves in the site's
   own palette: hairline geometric compositions, one per catalogue number,
   deterministic so the same release always gets the same art.

   Every image is rasterised to WebP with sharp before it is stored, so seeded
   art is indistinguishable from an upload — same table, same pipeline, same
   next/image treatment, and `isPlaceholder` flags it in the admin only.
   ========================================================================== */

import sharp from 'sharp'

/* The artwork sits ON the page, so it needs its own contrast range rather than
   the page's. Its base is a step darker than --room and its rules a step
   brighter than --score: at thumbnail size, hairlines drawn at the page's own
   1.37:1 disappear entirely. */
const ROOM = '#1d160c'
const RACK = '#241a0e'
const SCORE = '#5c4a26'
const DUST = '#ab9a76'
const TAPE = '#f5e9cc'
const LAMP = '#f0c14b'

const SLEEVE = 1400
const PORTRAIT_W = 1120
const PORTRAIT_H = 1400

/* ------------------------------ determinism ------------------------------ */

function hashString(input: string): number {
  let h = 2166136261
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Rng = () => number
const pick = <T>(rng: Rng, items: readonly T[]): T =>
  items[Math.floor(rng() * items.length)] as T
const between = (rng: Rng, a: number, b: number) => a + rng() * (b - a)

/* ------------------------------- sleeves -------------------------------- */

/** Concentric grooves, centre pushed off the plate. */
function grooves(rng: Rng): string {
  const cx = between(rng, 0.34, 0.72) * SLEEVE
  const cy = between(rng, 0.3, 0.62) * SLEEVE
  const rings = Math.floor(between(rng, 13, 22))
  const gap = between(rng, 34, 58)
  const litRing = Math.floor(between(rng, 3, rings - 2))

  const circles = Array.from({ length: rings }, (_, i) => {
    const r = (i + 1) * gap
    const lit = i === litRing
    return `<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${r.toFixed(0)}" fill="none" stroke="${
      lit ? LAMP : SCORE
    }" stroke-width="${lit ? 4 : 2}"/>`
  }).join('')

  const ruleY = between(rng, 0.72, 0.86) * SLEEVE
  return `${circles}<path d="M0 ${ruleY.toFixed(0)}H${SLEEVE}" stroke="${SCORE}" stroke-width="2"/>`
}

/** A spectrum of vertical bars — a spectrum analyser frozen mid-frame. */
function spectrum(rng: Rng): string {
  const count = Math.floor(between(rng, 18, 30))
  const margin = SLEEVE * 0.12
  const usable = SLEEVE - margin * 2
  const slot = usable / count
  const barW = slot * between(rng, 0.42, 0.66)
  const base = SLEEVE * between(rng, 0.78, 0.86)
  const litFrom = Math.floor(between(rng, 0, count - 4))
  const litTo = litFrom + Math.floor(between(rng, 2, 5))

  const bars = Array.from({ length: count }, (_, i) => {
    const shape = Math.sin((i / count) * Math.PI) ** 0.7
    const h = (0.14 + shape * between(rng, 0.4, 0.86) * rng() ** 0.4) * SLEEVE * 0.66
    const x = margin + i * slot + (slot - barW) / 2
    const lit = i >= litFrom && i <= litTo
    return `<rect x="${x.toFixed(1)}" y="${(base - h).toFixed(1)}" width="${barW.toFixed(
      1,
    )}" height="${h.toFixed(1)}" fill="${lit ? LAMP : SCORE}" ${
      lit ? 'opacity="0.9"' : ''
    }/>`
  }).join('')

  return `${bars}<path d="M${margin} ${base}H${SLEEVE - margin}" stroke="${DUST}" stroke-width="2" opacity="0.5"/>`
}

/** One large form over a hairline grid. */
function form(rng: Rng): string {
  const divisions = Math.floor(between(rng, 5, 9))
  const step = SLEEVE / divisions
  const grid = Array.from({ length: divisions - 1 }, (_, i) => {
    const at = ((i + 1) * step).toFixed(0)
    return `<path d="M${at} 0V${SLEEVE}" stroke="${SCORE}" stroke-width="1.5"/><path d="M0 ${at}H${SLEEVE}" stroke="${SCORE}" stroke-width="1.5"/>`
  }).join('')

  const size = between(rng, 0.4, 0.62) * SLEEVE
  const x = between(rng, 0.12, 0.44) * SLEEVE
  const y = between(rng, 0.14, 0.4) * SLEEVE
  const filled = rng() > 0.5
  const stroke = `stroke="${LAMP}" stroke-width="5" fill="${filled ? LAMP : 'none'}" ${
    filled ? 'opacity="0.2"' : ''
  }`

  const kind = pick(rng, ['circle', 'square', 'triangle'] as const)
  let shape = ''
  if (kind === 'circle') {
    shape = `<circle cx="${(x + size / 2).toFixed(0)}" cy="${(y + size / 2).toFixed(
      0,
    )}" r="${(size / 2).toFixed(0)}" ${stroke}/>`
  } else if (kind === 'square') {
    shape = `<rect x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="${size.toFixed(
      0,
    )}" height="${size.toFixed(0)}" ${stroke}/>`
  } else {
    shape = `<path d="M${(x + size / 2).toFixed(0)} ${y.toFixed(0)}L${(x + size).toFixed(
      0,
    )} ${(y + size).toFixed(0)}H${x.toFixed(0)}Z" ${stroke}/>`
  }

  return `${grid}${shape}`
}

/** A waveform across the plate, with tick markings under it. */
function waveform(rng: Rng): string {
  const mid = SLEEVE * between(rng, 0.42, 0.56)
  const points = 150
  const amp = SLEEVE * between(rng, 0.1, 0.2)
  const f1 = between(rng, 1.4, 3.2)
  const f2 = between(rng, 4.5, 9)
  const f3 = between(rng, 11, 19)

  let path = ''
  for (let i = 0; i <= points; i++) {
    const t = i / points
    const x = t * SLEEVE
    const shape = Math.sin(t * Math.PI) ** 0.5
    const v =
      Math.sin(t * Math.PI * 2 * f1) * 0.6 +
      Math.sin(t * Math.PI * 2 * f2 + 1.1) * 0.28 +
      Math.sin(t * Math.PI * 2 * f3 + 2.3) * 0.12
    const y = mid - v * amp * shape
    path += `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`
  }

  const ticks = Array.from({ length: 40 }, (_, i) => {
    const x = ((i + 0.5) / 40) * SLEEVE
    const major = i % 5 === 0
    const h = major ? 40 : 20
    return `<path d="M${x.toFixed(1)} ${SLEEVE * 0.88}v${h}" stroke="${
      major ? DUST : SCORE
    }" stroke-width="2" ${major ? '' : 'opacity="0.8"'}/>`
  }).join('')

  return `<path d="M0 ${mid}H${SLEEVE}" stroke="${SCORE}" stroke-width="2"/><path d="${path}" fill="none" stroke="${LAMP}" stroke-width="4" stroke-linejoin="round"/>${ticks}`
}

/** Radial hairlines from a point off the plate. */
function spokes(rng: Rng): string {
  const cx = between(rng, -0.2, 0.4) * SLEEVE
  const cy = between(rng, 0.9, 1.3) * SLEEVE
  const count = Math.floor(between(rng, 26, 44))
  const spread = between(rng, 55, 95)
  const start = between(rng, -80, -20)
  const litIndex = Math.floor(between(rng, 2, count - 2))

  const lines = Array.from({ length: count }, (_, i) => {
    const deg = start + (i / (count - 1)) * spread
    const rad = (deg * Math.PI) / 180
    const len = SLEEVE * 2
    const x2 = cx + Math.cos(rad) * len
    const y2 = cy + Math.sin(rad) * len
    const lit = i === litIndex
    return `<path d="M${cx.toFixed(0)} ${cy.toFixed(0)}L${x2.toFixed(0)} ${y2.toFixed(
      0,
    )}" stroke="${lit ? LAMP : SCORE}" stroke-width="${lit ? 6 : 2}"/>`
  }).join('')

  const arcR = between(rng, 0.5, 0.8) * SLEEVE
  return `${lines}<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${arcR.toFixed(
    0,
  )}" fill="none" stroke="${DUST}" stroke-width="2" opacity="0.42"/>`
}

/** A type plate: the catalogue number as the composition. */
function plate(rng: Rng, catalog: string): string {
  const barY = between(rng, 0.2, 0.34) * SLEEVE
  const barH = between(rng, 0.06, 0.13) * SLEEVE
  const inset = SLEEVE * 0.1
  const rule2 = between(rng, 0.6, 0.74) * SLEEVE

  return `
    <rect x="${inset}" y="${barY.toFixed(0)}" width="${(SLEEVE - inset * 2).toFixed(
      0,
    )}" height="${barH.toFixed(0)}" fill="${LAMP}" opacity="0.85"/>
    <path d="M${inset} ${rule2.toFixed(0)}H${(SLEEVE - inset).toFixed(0)}" stroke="${SCORE}" stroke-width="3"/>
    <text x="${inset}" y="${(rule2 - 30).toFixed(0)}" font-family="monospace" font-size="${(
      SLEEVE * 0.115
    ).toFixed(0)}" font-weight="600" letter-spacing="${(SLEEVE * 0.012).toFixed(
      1,
    )}" fill="${TAPE}">${catalog}</text>
    <rect x="${inset}" y="${(rule2 + 60).toFixed(0)}" width="${(SLEEVE * 0.22).toFixed(
      0,
    )}" height="${(SLEEVE * 0.22).toFixed(0)}" fill="none" stroke="${SCORE}" stroke-width="3"/>
  `
}

const SLEEVE_TEMPLATES = [grooves, spectrum, form, waveform, spokes] as const

/** Builds the SVG for one sleeve. Deterministic in `catalog`. */
export function sleeveSvg(catalog: string): string {
  const rng = mulberry32(hashString(catalog))

  // Cycle the composition off the catalogue number rather than off the RNG.
  // Random selection clustered — MLPHL-003 and -009 both drew the waveform —
  // and a label's sleeves should visibly rotate through a house style.
  const serial = Number(/(\d+)\s*$/.exec(catalog)?.[1] ?? 0)
  const which = serial % (SLEEVE_TEMPLATES.length + 1)

  const inner =
    which === SLEEVE_TEMPLATES.length
      ? plate(rng, catalog)
      : (SLEEVE_TEMPLATES[which] as (r: Rng) => string)(rng)

  const bg = rng() > 0.45 ? RACK : ROOM

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SLEEVE}" height="${SLEEVE}" viewBox="0 0 ${SLEEVE} ${SLEEVE}">
  <rect width="${SLEEVE}" height="${SLEEVE}" fill="${bg}"/>
  ${inner}
  <rect x="14" y="14" width="${SLEEVE - 28}" height="${SLEEVE - 28}" fill="none" stroke="${SCORE}" stroke-width="2"/>
  <text x="46" y="${SLEEVE - 44}" font-family="monospace" font-size="34" letter-spacing="6" fill="${DUST}">${catalog}</text>
</svg>`
}

/* ------------------------------- portraits ------------------------------- */

/** A duotone field with topographic hairlines and the artist's initials. */
export function portraitSvg(name: string): string {
  const rng = mulberry32(hashString(name))
  const initials = name
    .split(/\s+/)
    .filter((w) => /[a-z]/i.test(w[0] ?? ''))
    .slice(0, 2)
    .map((w) => (w[0] ?? '').toUpperCase())
    .join('')

  const glowX = between(rng, 0.2, 0.8) * PORTRAIT_W
  const glowY = between(rng, 0.18, 0.5) * PORTRAIT_H
  const glowR = between(rng, 0.5, 0.85) * PORTRAIT_W

  const lines = Array.from({ length: 22 }, (_, i) => {
    const baseY = (i / 21) * PORTRAIT_H * 1.1 - PORTRAIT_H * 0.05
    const amp = between(rng, 18, 74)
    const freq = between(rng, 1.1, 2.8)
    const phase = between(rng, 0, Math.PI * 2)
    let d = ''
    for (let s = 0; s <= 40; s++) {
      const t = s / 40
      const x = t * PORTRAIT_W
      const y = baseY + Math.sin(t * Math.PI * freq + phase) * amp
      d += `${s === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`
    }
    return `<path d="${d}" fill="none" stroke="${SCORE}" stroke-width="2" opacity="${(
      0.5 +
      (i % 3) * 0.2
    ).toFixed(2)}"/>`
  }).join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${PORTRAIT_W}" height="${PORTRAIT_H}" viewBox="0 0 ${PORTRAIT_W} ${PORTRAIT_H}">
  <defs>
    <radialGradient id="g" cx="${(glowX / PORTRAIT_W).toFixed(3)}" cy="${(
      glowY / PORTRAIT_H
    ).toFixed(3)}" r="${(glowR / PORTRAIT_W).toFixed(3)}">
      <stop offset="0" stop-color="${LAMP}" stop-opacity="0.34"/>
      <stop offset="1" stop-color="${LAMP}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${PORTRAIT_W}" height="${PORTRAIT_H}" fill="${ROOM}"/>
  ${lines}
  <rect width="${PORTRAIT_W}" height="${PORTRAIT_H}" fill="url(#g)"/>
  <text x="${PORTRAIT_W / 2}" y="${PORTRAIT_H * 0.6}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="${(
    PORTRAIT_W * 0.46
  ).toFixed(0)}" fill="${TAPE}" opacity="0.07" letter-spacing="${(
    PORTRAIT_W * 0.01
  ).toFixed(0)}">${initials}</text>
  <rect x="12" y="12" width="${PORTRAIT_W - 24}" height="${PORTRAIT_H - 24}" fill="none" stroke="${SCORE}" stroke-width="2"/>
</svg>`
}

/* ------------------------------ rasterising ------------------------------ */

export type RasterResult = { data: Buffer; width: number; height: number }

/** SVG in, WebP out — the same format the upload pipeline produces. */
export async function rasterise(svg: string): Promise<RasterResult> {
  const out = await sharp(Buffer.from(svg))
    .webp({ quality: 84, effort: 4 })
    .toBuffer({ resolveWithObject: true })
  return { data: out.data, width: out.info.width, height: out.info.height }
}
