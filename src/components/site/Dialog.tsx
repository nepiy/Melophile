'use client'

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/* ==========================================================================
   The click-to-reveal panel.

   /artists rests entirely on this interaction and /music reuses it, so the
   accessibility is the feature, not a checklist:
     · role="dialog" aria-modal="true", labelled by its own heading
     · focus moves into the panel on open and returns to the opener on close
     · Tab and Shift+Tab cycle inside; nothing behind is reachable
     · Escape closes, and so does a visible close control
     · background scroll locks, compensating for the scrollbar so nothing jumps
     · under 720px it is a full-screen sheet, never a cramped centred box
   ========================================================================== */

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export type DialogProps = {
  open: boolean
  onClose: () => void
  /** Accessible name. Rendered by the caller; passed here for aria-labelledby. */
  titleId: string
  /** Shown on the close control and read by screen readers. */
  closeLabel?: string
  children: ReactNode
  className?: string
}

export function Dialog({
  open,
  onClose,
  titleId,
  closeLabel = 'Close',
  children,
  className,
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  const closeRef = useRef<HTMLButtonElement | null>(null)
  const openerRef = useRef<HTMLElement | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  // Remember who opened us, and hand focus back to exactly that element.
  useEffect(() => {
    if (!open) return
    openerRef.current = document.activeElement as HTMLElement | null
    return () => {
      const opener = openerRef.current
      if (opener && document.contains(opener)) opener.focus()
    }
  }, [open])

  // Scroll lock. The scrollbar width is measured and replaced as padding so
  // the page behind does not shift sideways when it disappears.
  useEffect(() => {
    if (!open) return
    const width = window.innerWidth - document.documentElement.clientWidth
    document.body.style.setProperty('--scrollbar-w', `${Math.max(0, width)}px`)
    document.body.dataset.scrollLocked = 'true'
    return () => {
      delete document.body.dataset.scrollLocked
      document.body.style.removeProperty('--scrollbar-w')
    }
  }, [open])

  // Move focus in. Prefer the close control: it is the reliable escape hatch,
  // and it means a screen reader announces the dismiss affordance immediately.
  useEffect(() => {
    if (!open) return
    const id = requestAnimationFrame(() => {
      const target =
        closeRef.current ??
        panelRef.current?.querySelector<HTMLElement>(FOCUSABLE) ??
        panelRef.current
      target?.focus()
    })
    return () => cancelAnimationFrame(id)
  }, [open])

  const onKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!open) return

      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }

      if (event.key !== 'Tab') return

      const panel = panelRef.current
      if (!panel) return

      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      )
      if (items.length === 0) {
        event.preventDefault()
        panel.focus()
        return
      }

      const first = items[0]
      const last = items[items.length - 1]
      if (!first || !last) return

      const active = document.activeElement

      if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    },
    [open, onClose],
  )

  useEffect(() => {
    if (!open) return
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [open, onKeyDown])

  if (!mounted || !open) return null

  return createPortal(
    <div className="dlg" data-open="true">
      {/* Not focusable and aria-hidden: the only way out is Escape or the
          close control, both of which are real. */}
      <div className="dlg__veil" onClick={onClose} aria-hidden="true" />

      <div
        ref={panelRef}
        className={['dlg__panel', className].filter(Boolean).join(' ')}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        {/* A sticky bar rather than an absolutely-positioned button: inset
            properties on a sticky element are adhesion thresholds, not offsets,
            so `right: 0` on the button itself would not place it — and inside a
            panel that scrolls its own content, an absolute button scrolls away. */}
        <div className="dlg__bar">
          <button ref={closeRef} type="button" className="dlg__close" onClick={onClose}>
            <span className="label">{closeLabel}</span>
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <path d="M1 1 13 13M13 1 1 13" stroke="currentColor" strokeWidth="1" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  )
}

/** Stable ids for the aria-labelledby wiring, one per dialog instance. */
export function useDialogTitleId(prefix: string): string {
  const id = useId()
  return `${prefix}-${id}`
}
