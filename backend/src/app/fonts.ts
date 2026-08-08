import { Archivo, IBM_Plex_Mono, Newsreader } from 'next/font/google'

/* ==========================================================================
   Three roles, three objects in a control room.

   Only the display face preloads. The wordmark is the one thing on this site
   that must never flash in a system face; body copy swapping in 80ms later is
   invisible, and preloading all three would spend the budget on the wrong file.
   ========================================================================== */

/** Display — the engraved brand plate on the console.
 *  A grotesque drawn for signage and legal print: flat terminals, near-zero
 *  stroke contrast, squarish bowls. The wdth axis lets the wordmark sit
 *  expanded while section heads sit normal, from one download. */
export const display = Archivo({
  subsets: ['latin'],
  axes: ['wdth'],
  display: 'swap',
  preload: true,
  variable: '--font-display',
  fallback: ['Helvetica Neue', 'Arial', 'sans-serif'],
})

/** Body — the manual, and the liner notes.
 *  A serif on near-black is the fastest way to stop looking like a dark SaaS
 *  template. The opsz axis is why it can carry both 17px meta and 19px prose. */
export const body = Newsreader({
  subsets: ['latin'],
  axes: ['opsz'],
  display: 'swap',
  preload: false,
  variable: '--font-body',
  fallback: ['Georgia', 'Times New Roman', 'serif'],
})

/** Utility — the silkscreened channel strip.
 *  IBM's typewriter and terminal lineage: literally equipment typography.
 *  Carries catalogue numbers, dates, durations, timecode, meter readouts —
 *  and all of the site's chrome. */
export const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  display: 'swap',
  preload: false,
  variable: '--font-mono',
  fallback: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
})

export const fontClassNames = `${display.variable} ${body.variable} ${mono.variable}`
