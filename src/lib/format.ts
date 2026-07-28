import type { ReleaseType, SessionType } from '@/db/schema'

/* Formatting lives here so a date never renders two different ways on two
   different pages. Everything is en-GB-ish and locale-stable: dates are
   formatted from ISO parts by hand rather than via toLocaleDateString, because
   server and client locales differ and hydration mismatches follow. */

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const

function parseIsoDate(iso: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim())
  if (!match) return null
  const y = Number(match[1])
  const m = Number(match[2])
  const d = Number(match[3])
  if (!y || m < 1 || m > 12 || d < 1 || d > 31) return null
  return { y, m, d }
}

/** '2025-03-14' → '14 March 2025'. Falls back to the raw string. */
export function formatDateLong(iso: string): string {
  const p = parseIsoDate(iso)
  if (!p) return iso
  return `${p.d} ${MONTHS[p.m - 1]} ${p.y}`
}

/** '2025-03-14' → '14 Mar 2025'. For dense catalogue rows. */
export function formatDateShort(iso: string): string {
  const p = parseIsoDate(iso)
  if (!p) return iso
  return `${String(p.d).padStart(2, '0')} ${MONTHS_SHORT[p.m - 1]} ${p.y}`
}

/** '2025-03-14' → '2025'. */
export function formatYear(iso: string): string {
  const p = parseIsoDate(iso)
  return p ? String(p.y) : ''
}

/** '2025-03-14' → '2025.03.14', for the mono strips. */
export function formatDateMono(iso: string): string {
  const p = parseIsoDate(iso)
  if (!p) return iso
  return `${p.y}.${String(p.m).padStart(2, '0')}.${String(p.d).padStart(2, '0')}`
}

/** Today, in the site's canonical ISO form, in local time. */
export function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
}

export function isValidIsoDate(iso: string): boolean {
  const p = parseIsoDate(iso)
  if (!p) return false
  const d = new Date(`${iso}T00:00:00`)
  return d.getFullYear() === p.y && d.getMonth() + 1 === p.m && d.getDate() === p.d
}

const RELEASE_TYPE_LABELS: Record<ReleaseType, string> = {
  album: 'Album',
  ep: 'EP',
  mixtape: 'Mixtape',
  single: 'Single',
}

export function releaseTypeLabel(type: ReleaseType): string {
  return RELEASE_TYPE_LABELS[type] ?? type
}

const SESSION_TYPE_LABELS: Record<SessionType, string> = {
  recording: 'Recording',
  mixing: 'Mixing',
  mastering: 'Mastering',
  rehearsal: 'Rehearsal',
}

export function sessionTypeLabel(type: SessionType): string {
  return SESSION_TYPE_LABELS[type] ?? type
}

const STREAMING_LABELS: Record<string, string> = {
  spotify: 'Spotify',
  apple: 'Apple Music',
  youtube: 'YouTube',
  bandcamp: 'Bandcamp',
  soundcloud: 'SoundCloud',
}

export function streamingLabel(platform: string): string {
  return STREAMING_LABELS[platform] ?? platform
}

/** Total runtime of a tracklist: ['3:24','4:02'] → '7:26'. */
export function totalDuration(durations: string[]): string {
  let seconds = 0
  for (const d of durations) {
    const parts = d.split(':').map((n) => Number(n.trim()))
    if (parts.some((n) => Number.isNaN(n))) continue
    if (parts.length === 2) seconds += (parts[0] ?? 0) * 60 + (parts[1] ?? 0)
    else if (parts.length === 3)
      seconds += (parts[0] ?? 0) * 3600 + (parts[1] ?? 0) * 60 + (parts[2] ?? 0)
  }
  if (!seconds) return ''
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return h
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`
}

/** '14:30' → '2:30 pm'. Blank in, blank out. */
export function formatTime(hhmm: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim())
  if (!m) return hhmm
  const h = Number(m[1])
  if (h > 23) return hhmm
  const suffix = h < 12 ? 'am' : 'pm'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${m[2]} ${suffix}`
}

/**
 * 'MELOPHILE' → 'LMTLS'. Vowels dropped, five characters, which is how label
 * catalogue prefixes are actually built. Used for the hero readout so it agrees
 * with the catalogue numbers (LMTLS-007) instead of truncating to 'LIMIT'.
 */
export function labelCode(name: string): string {
  const letters = name.toUpperCase().replace(/[^A-Z]/g, '')
  if (!letters) return ''
  const consonants = letters.replace(/[AEIOU]/g, '')
  // Keep the first letter even if it is a vowel — 'OSSUARY' should not become 'SSRY'.
  const base = consonants.length >= 3 ? consonants : letters
  const first = letters[0] ?? ''
  const prefixed = base.startsWith(first) ? base : first + base
  return prefixed.slice(0, 5)
}

export function pluralise(n: number, one: string, many?: string): string {
  return n === 1 ? one : (many ?? `${one}s`)
}

/** Relative time for the admin bookings list. Absolute past only. */
export function timeAgo(from: Date, now: Date = new Date()): string {
  const secs = Math.max(0, Math.round((now.getTime() - from.getTime()) / 1000))
  if (secs < 60) return 'just now'
  const mins = Math.round(secs / 60)
  if (mins < 60) return `${mins} ${pluralise(mins, 'minute')} ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} ${pluralise(hours, 'hour')} ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days} ${pluralise(days, 'day')} ago`
  return formatDateShort(
    `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}-${String(
      from.getDate(),
    ).padStart(2, '0')}`,
  )
}

/** URL-safe slug from a title. Used by the admin when creating rows. */
export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72)
}

/* ==========================================================================
   Money.

   Prices are integer minor units everywhere — pence, not pounds. Floats drift:
   0.1 + 0.2 is not 0.3, and a catalogue that adds up in floats is a penny out
   by the end of the year. The only place a decimal point exists is here, at
   the moment of display.
   ========================================================================== */

/** 1250 → '£12.50'. Whole amounts drop the decimals: 1200 → '£12'. */
export function formatMoney(cents: number, symbol = '£'): string {
  const safe = Number.isFinite(cents) ? Math.round(cents) : 0
  const negative = safe < 0
  const abs = Math.abs(safe)
  const major = Math.floor(abs / 100)
  const minor = abs % 100
  const body =
    minor === 0
      ? `${symbol}${major.toLocaleString('en-GB')}`
      : `${symbol}${major.toLocaleString('en-GB')}.${String(minor).padStart(2, '0')}`
  return negative ? `−${body}` : body
}

/** '12.50', '12', '£12.50' → 1250. Returns null on anything unparseable. */
export function parseMoney(input: string): number | null {
  const cleaned = input.replace(/[^\d.,-]/g, '').replace(/,/g, '')
  if (!cleaned || !/^-?\d*\.?\d*$/.test(cleaned)) return null
  const value = Number(cleaned)
  if (!Number.isFinite(value)) return null
  return Math.round(value * 100)
}

const MUSIC_FORMAT_LABELS: Record<string, string> = {
  album: 'Album',
  ep: 'EP',
  mixtape: 'Mixtape',
  single: 'Single',
}

export function musicFormatLabel(format: string | null | undefined): string {
  if (!format) return ''
  return MUSIC_FORMAT_LABELS[format] ?? format
}

const BEAT_LICENSE_LABELS: Record<string, string> = {
  lease: 'Lease',
  exclusive: 'Exclusive',
}

export function beatLicenseLabel(license: string | null | undefined): string {
  if (!license) return ''
  return BEAT_LICENSE_LABELS[license] ?? license
}

const PRODUCT_KIND_LABELS: Record<string, string> = {
  merch: 'Merch',
  music: 'Music',
  beat: 'Beats',
}

export function productKindLabel(kind: string): string {
  return PRODUCT_KIND_LABELS[kind] ?? kind
}

const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: 'Awaiting payment',
  paid: 'Paid',
  fulfilled: 'Sent',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
}

export function orderStatusLabel(status: string): string {
  return ORDER_STATUS_LABELS[status] ?? status
}

/**
 * A reference a person can read down a phone: no vowels, so it cannot spell
 * anything, and no 0/O or 1/I, which are the characters people mishear.
 */
export function orderReference(prefix = 'MLPHL'): string {
  const alphabet = '23456789BCDFGHJKLMNPQRSTVWXYZ'
  let body = ''
  for (let i = 0; i < 5; i++) {
    body += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return `${prefix}-${body}`
}

/** '2026-09-14' + '20:00' → 'Mon 14 Sep 2026, 8:00 pm'. */
export function formatEventWhen(date: string, time: string): string {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
  const parsed = new Date(`${date}T${time || '00:00'}:00`)
  const day = Number.isNaN(parsed.getTime()) ? '' : `${days[parsed.getDay()]} `
  const when = formatDateShort(date)
  return time ? `${day}${when}, ${formatTime(time)}` : `${day}${when}`
}

/** True once the event's day has passed. Compared as ISO text, no timezone maths. */
export function isPastDate(date: string): boolean {
  return date < todayIso()
}
