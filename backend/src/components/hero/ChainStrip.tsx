/* ==========================================================================
   IN → EQ → COMP → OUT.

   The one piece of the hero that is instrumentation rather than content, and
   therefore the one user-visible string on the site that is NOT editable in the
   admin — consistent with "nothing about animation is editable".

   Each stage's lamp lights as the signal reaches it, driven by --chain (0..4)
   from the same clock as the letterforms. The link between two stages fills by
   scaleX, so it is a transform and costs no layout.
   ========================================================================== */

const STAGES = ['IN', 'EQ', 'COMP', 'OUT'] as const

export function ChainStrip() {
  return (
    <div className="chain" aria-hidden="true">
      {STAGES.map((stage, i) => (
        <div
          key={stage}
          className="chain__stage"
          style={{ '--n': i } as React.CSSProperties}
        >
          <span className="chain__lamp" />
          <span className="label chain__name">{stage}</span>
          {i < STAGES.length - 1 ? <span className="chain__link" /> : null}
        </div>
      ))}
    </div>
  )
}

/* ==========================================================================
   The bit-crush filters.

   Three discrete steps, not an interpolated radius: quantisation should step.
   feMorphology chunks the glyph edges, then a discrete alpha transfer hardens
   the antialiasing into hard steps — the visual equivalent of dropping bit
   depth. Rendered once, hidden, referenced by url(#lr-crushN).
   ========================================================================== */

export function CrushFilters() {
  return (
    <svg className="crush-defs" aria-hidden="true" focusable="false" width="0" height="0">
      <defs>
        {[
          // Radii are in user units, so they have to be sized against a wordmark
          // 100–170px tall. At r < 1 the burst is invisible at this scale.
          { id: 'lr-crush1', r: 1.4, table: '0 0.35 1' },
          { id: 'lr-crush2', r: 3, table: '0 0 0.6 1' },
          { id: 'lr-crush3', r: 4.6, table: '0 0 1' },
        ].map((f) => (
          <filter
            key={f.id}
            id={f.id}
            x="-12%"
            y="-25%"
            width="124%"
            height="150%"
            colorInterpolationFilters="sRGB"
          >
            <feMorphology operator="dilate" radius={f.r} />
            <feComponentTransfer>
              <feFuncA type="discrete" tableValues={f.table} />
            </feComponentTransfer>
          </filter>
        ))}
      </defs>
    </svg>
  )
}
