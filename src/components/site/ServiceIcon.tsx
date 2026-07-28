import type { ServiceIcon as ServiceIconName } from '@/db/schema'

/* ==========================================================================
   Hairline vector work, not skeuomorphic chrome.

   Every icon is drawn on the same 24-unit grid at 1px, so a row of them reads
   as one engraved panel rather than a set of downloaded glyphs. The client
   picks which icon from a closed list; they never pick what it looks like.
   ========================================================================== */

const PATHS: Record<ServiceIconName, React.ReactNode> = {
  // condenser mic in a shockmount
  mic: (
    <>
      <rect x="8.5" y="2.5" width="7" height="12" rx="3.5" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3.5M8 21.5h8" />
    </>
  ),
  // three channel faders at different positions
  fader: (
    <>
      <path d="M5 3v18M12 3v18M19 3v18" />
      <path d="M2.5 8h5M9.5 14h5M16.5 6h5" />
    </>
  ),
  // a waveform, asymmetric like real program material
  waveform: <path d="M1.5 12h2l1.5-5 2 9 2-12 2 15 2-9 1.5 4 2-6 1.5 4h4" />,
  // rotary control with a pointer and detent marks
  knob: (
    <>
      <circle cx="12" cy="12" r="7.5" />
      <path d="M12 12V5.5" />
      <path d="M4 4.5 5.6 6M20 4.5 18.4 6M2.5 12H4M20 12h1.5" />
    </>
  ),
  // two tape reels and the path between them
  tape: (
    <>
      <circle cx="7" cy="10" r="4.5" />
      <circle cx="17" cy="10" r="4.5" />
      <circle cx="7" cy="10" r="1" />
      <circle cx="17" cy="10" r="1" />
      <path d="M7 14.5v3h10v-3" />
    </>
  ),
  // record and centre label
  disc: (
    <>
      <circle cx="12" cy="12" r="9.5" />
      <circle cx="12" cy="12" r="3" />
      <circle cx="12" cy="12" r="6.5" strokeDasharray="1 3" />
    </>
  ),
  // nearfield monitor on its side, port below
  monitor: (
    <>
      <rect x="4.5" y="2.5" width="15" height="19" />
      <circle cx="12" cy="9" r="4" />
      <circle cx="12" cy="17.5" r="1.5" />
    </>
  ),
  // patchbay: a grid of jacks with one cable in
  patchbay: (
    <>
      <rect x="2.5" y="6.5" width="19" height="11" />
      <path d="M6 10.5h.01M10 10.5h.01M14 10.5h.01M18 10.5h.01M6 14h.01M10 14h.01M14 14h.01M18 14h.01" />
      <path d="M10 10.5c0 4 8 2 8 6" />
    </>
  ),
}

export function ServiceIcon({
  name,
  className,
}: {
  name: ServiceIconName
  className?: string
}) {
  const path = PATHS[name] ?? PATHS.waveform
  return (
    <svg
      className={['svc-icon', className].filter(Boolean).join(' ')}
      viewBox="0 0 24 24"
      width="24"
      height="24"
      stroke="currentColor"
      strokeWidth="1"
      aria-hidden="true"
      focusable="false"
    >
      {path}
    </svg>
  )
}
