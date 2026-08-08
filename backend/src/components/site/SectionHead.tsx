import type { ReactNode } from 'react'

/**
 * Every section on the site is a rack unit: a two-digit channel number and a
 * tracked-out mono label on the left, the heading and content on the right,
 * a hairline above. Used by the home sections and by every inner page so the
 * whole site shares one skeleton.
 */
export function SectionHead({
  channel,
  label,
  heading,
  intro,
  id,
  aside,
  headingLevel = 2,
}: {
  /** Two-digit channel number, e.g. '02'. */
  channel: string
  /** Mono strip label, e.g. 'MUSIC'. */
  label: string
  heading: string
  intro?: string
  id?: string
  /** Right-aligned meta — counts, filters, a link. */
  aside?: ReactNode
  headingLevel?: 1 | 2
}) {
  const Heading = headingLevel === 1 ? 'h1' : 'h2'

  return (
    <div className="sec__head">
      <div className="sec__strip" aria-hidden="true">
        <span className="sec__chan mono">{channel}</span>
        <span className="sec__strip-rule" />
        <span className="label sec__strip-label">{label}</span>
      </div>

      <div className="sec__title">
        <Heading id={id} className="sec__heading">
          {heading}
        </Heading>
        {intro ? <p className="sec__intro">{intro}</p> : null}
      </div>

      {aside ? <div className="sec__aside">{aside}</div> : null}
    </div>
  )
}
