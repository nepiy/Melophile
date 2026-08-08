'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { AccountMenu } from '@/components/account/AccountMenu'
import { CartBadge } from '@/components/cart/CartBadge'

/* The account menu is in the bar on every page, so its stylesheet has to be
   loaded on every page — and this is the only component the whole site shares
   that knows about it. The dashboard imports it again from its own layout;
   Next serves one copy either way. */
import '@/styles/account.css'
// The Account button can open the profile form from any public route, not just
// /account, so its input styles must be available in this shared nav too.
import '@/styles/auth.css'

export type NavProps = {
  logoText: string
  labels: {
    music: string
    artists: string
    store: string
    events: string
    about: string
    contact: string
  }
  bookLabel: string
}

/* /admin is deliberately absent from this list and from the footer. */
export function Nav({ logoText, labels, bookLabel }: NavProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [lifted, setLifted] = useState(false)

  const items = [
    { href: '/music', label: labels.music },
    { href: '/artists', label: labels.artists },
    { href: '/store', label: labels.store },
    { href: '/events', label: labels.events },
    { href: '/about', label: labels.about },
    { href: '/contact', label: labels.contact },
  ]

  const warmRoute = (href: string) => router.prefetch(href)

  // Close the menu on navigation. Without this, tapping a link on mobile
  // leaves the sheet open over the new page.
  useEffect(() => setOpen(false), [pathname])

  // Over the hero the bar is transparent; past it, it earns a hairline and a
  // veil so nav text stays readable against sleeve artwork.
  useEffect(() => {
    const onScroll = () => setLifted(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <header className="nav" data-lifted={lifted ? 'true' : 'false'} data-open={open}>
      <div className="nav__inner">
        <Link
          href="/"
          className="nav__logo"
          aria-label={`${logoText} — home`}
          onMouseEnter={() => warmRoute('/')}
          onFocus={() => warmRoute('/')}
        >
          <span className="nav__logo-text">{logoText}</span>
          {/* The REC indicator from the hero, kept alive in the bar. It is the
              one piece of instrumentation that persists across every page. */}
          <span className="nav__rec" aria-hidden="true">
            <span className="nav__rec-dot" />
            <span className="label">REC</span>
          </span>
        </Link>

        <button
          type="button"
          className="nav__toggle"
          aria-expanded={open}
          aria-controls="nav-menu"
          onClick={() => setOpen((v) => !v)}
        >
          <span className="label">{open ? 'Close' : 'Menu'}</span>
          <span className="nav__toggle-bars" aria-hidden="true">
            <span />
            <span />
          </span>
        </button>

        <nav id="nav-menu" className="nav__menu" aria-label="Main">
          <ul className="nav__list">
            {items.map((item) => {
              const active =
                pathname === item.href || pathname.startsWith(`${item.href}/`)
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="nav__link label"
                    aria-current={active ? 'page' : undefined}
                    prefetch
                    onMouseEnter={() => warmRoute(item.href)}
                    onFocus={() => warmRoute(item.href)}
                  >
                    {item.label}
                  </Link>
                </li>
              )
            })}
            <li className="nav__cart">
              <CartBadge />
            </li>
            {/* Renders nothing at all when Supabase is not configured, and the
                signed-out link until the browser has read the session — see
                AccountMenu for why it reads it there rather than here. */}
            <li className="nav__account">
              <AccountMenu />
            </li>
            <li className="nav__book">
              <Link
                href="/contact#book"
                className="btn btn--ghost"
                prefetch
                onMouseEnter={() => warmRoute('/contact')}
                onFocus={() => warmRoute('/contact')}
              >
                {bookLabel}
              </Link>
            </li>
          </ul>
        </nav>
      </div>
      <div className="nav__rule" aria-hidden="true" />
    </header>
  )
}
