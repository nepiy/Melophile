import type { ReactNode } from 'react'

/* ==========================================================================
   The save bar. Sticks to the bottom of a long editor so the client never
   has to scroll to the end of a form to find out how to keep their work.

   The button label never changes while saving — a label that swaps to
   "Saving…" reflows the bar under the cursor. The state is announced in the
   status region instead, which is also the only thing a screen reader needs.

   No directive: it holds no state, so it renders on the server inside a
   server component and inside a client form alike.
   ========================================================================== */

export function SaveBar({
  saving,
  saved,
  label = 'Save changes',
  savedLabel = 'Changes saved.',
  children,
}: {
  saving?: boolean
  saved?: boolean
  label?: string
  /** Defaults to "Changes saved." — the outcome the button names. */
  savedLabel?: string
  /** Extra actions: a delete, a "view on the site" link. */
  children?: ReactNode
}) {
  return (
    <div className="ad-savebar">
      <div className="ad-savebar__inner">
        <button type="submit" className="btn ad-btn--primary" disabled={saving}>
          {label}
        </button>

        <p className="ad-status mono" role="status">
          {saving ? 'Saving…' : saved ? savedLabel : ''}
        </p>

        {children ? <div className="ad-savebar__extra">{children}</div> : null}
      </div>
    </div>
  )
}
