'use client'

import { useEffect, useRef, useState, type ElementType, type ReactNode } from 'react'

/* ==========================================================================
   Scroll reveal — triggered, never scroll-hijacked.

   One IntersectionObserver per element, disconnected after it fires, so a long
   catalogue page does not keep observers alive for content already seen.
   Under prefers-reduced-motion nothing is observed at all: the content is
   simply present from the first paint.
   ========================================================================== */

export type RevealProps = {
  children: ReactNode
  /** Stagger position within a group. Multiplied by ~70ms in CSS. */
  index?: number
  as?: ElementType
  className?: string
  /** How far into the viewport before it fires. */
  rootMargin?: string
}

export function Reveal({
  children,
  index = 0,
  as: Tag = 'div',
  className,
  rootMargin = '0px 0px -12% 0px',
}: RevealProps) {
  const ref = useRef<HTMLElement | null>(null)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node) return

    if (
      typeof window === 'undefined' ||
      !('IntersectionObserver' in window) ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      setShown(true)
      return
    }

    // Already on screen at mount (above the fold, or a back-navigation):
    // show it immediately rather than animating content the user is looking at.
    const box = node.getBoundingClientRect()
    if (box.top < window.innerHeight * 0.9 && box.bottom > 0) {
      setShown(true)
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShown(true)
            observer.disconnect()
          }
        }
      },
      { rootMargin, threshold: 0.05 },
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [rootMargin])

  return (
    <Tag
      ref={ref}
      className={['reveal', className].filter(Boolean).join(' ')}
      data-shown={shown ? 'true' : 'false'}
      style={{ '--reveal-i': index } as React.CSSProperties}
    >
      {children}
    </Tag>
  )
}
