/* ==========================================================================
   A VU meter whose needle is driven by the animation's own envelope.

   This is the piece that stops the hero reading as generic. The needle is not
   looping an idle animation — the hero's single rAF loop writes --needle-deg
   after integrating the envelope through real VU ballistics (300ms to 99% of a
   step), which is why it slams past the mark at the transient and rebounds.

   Hairline vector work, no skeuomorphic chrome: one weight of stroke, a real
   dB scale, and an over-level segment in signal red.
   ========================================================================== */

/** Real VU face spacing: the scale crowds toward 0dB, it is not linear. */
const MARKS: { db: string; at: number; major?: boolean }[] = [
  { db: '-20', at: 0, major: true },
  { db: '-10', at: 0.34 },
  { db: '-7', at: 0.47 },
  { db: '-5', at: 0.58 },
  { db: '-3', at: 0.7 },
  { db: '0', at: 0.84, major: true },
  { db: '+3', at: 1, major: true },
]

const PIVOT_X = 60
const PIVOT_Y = 70
const R_OUTER = 54
const ANGLE_MIN = -46
const ANGLE_MAX = 46

function pointAt(at: number, radius: number) {
  const deg = ANGLE_MIN + (ANGLE_MAX - ANGLE_MIN) * at
  const rad = (deg * Math.PI) / 180
  return {
    x: PIVOT_X + Math.sin(rad) * radius,
    y: PIVOT_Y - Math.cos(rad) * radius,
  }
}

function arcPath(from: number, to: number, radius: number): string {
  const a = pointAt(from, radius)
  const b = pointAt(to, radius)
  return `M${a.x.toFixed(2)} ${a.y.toFixed(2)} A${radius} ${radius} 0 0 1 ${b.x.toFixed(
    2,
  )} ${b.y.toFixed(2)}`
}

export function VuMeter() {
  return (
    <div className="vu">
      <svg viewBox="0 0 120 78" className="vu__face" aria-hidden="true" focusable="false">
        {/* scale arc, then the over-level segment on top of it */}
        <path d={arcPath(0, 1, R_OUTER)} className="vu__arc" />
        <path d={arcPath(0.84, 1, R_OUTER)} className="vu__arc vu__arc--over" />

        {MARKS.map((mark) => {
          const outer = pointAt(mark.at, R_OUTER)
          const inner = pointAt(mark.at, R_OUTER - (mark.major ? 9 : 5))
          const text = pointAt(mark.at, R_OUTER - 15)
          return (
            <g key={mark.db}>
              <path
                d={`M${outer.x.toFixed(2)} ${outer.y.toFixed(2)}L${inner.x.toFixed(
                  2,
                )} ${inner.y.toFixed(2)}`}
                className={mark.major ? 'vu__tick vu__tick--major' : 'vu__tick'}
              />
              {mark.major ? (
                <text
                  x={text.x.toFixed(2)}
                  y={text.y.toFixed(2)}
                  className="vu__db"
                  textAnchor="middle"
                  dominantBaseline="middle"
                >
                  {mark.db}
                </text>
              ) : null}
            </g>
          )
        })}

        {/* The needle. Rotation comes from --needle-deg, written once per frame. */}
        <g className="vu__needle">
          <path d={`M${PIVOT_X} ${PIVOT_Y}L${PIVOT_X} ${PIVOT_Y - R_OUTER + 2}`} />
        </g>
        <circle cx={PIVOT_X} cy={PIVOT_Y} r="2.5" className="vu__pivot" />

        <text x={PIVOT_X} y="74" className="vu__unit" textAnchor="middle">
          VU
        </text>
      </svg>

      {/* Over-level LED. Lights above -3dB and holds, like the real thing. */}
      <span className="vu__peak">
        <span className="vu__peak-lamp" aria-hidden="true" />
        <span className="label vu__peak-label">PEAK</span>
      </span>
    </div>
  )
}
