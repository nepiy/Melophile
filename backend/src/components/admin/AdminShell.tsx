'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { signOut } from '@/lib/actions/auth'

/* ==========================================================================
   The admin frame: a left rack of sections, hairline-divided, mono. Same
   palette, same hairlines, same type roles as the public site — the client
   should feel they are operating the same machine, not a second product.

   A client component for one reason: aria-current="page" needs the current
   path, and a server layout cannot know it.
   ========================================================================== */

const SECTIONS = [
  { href: '/admin/bookings', label: 'Bookings' },
  // Two order screens, because there are two databases and both hold real
  // money. Orders is the SQLite store — everything the shop took before
  // customer accounts existed. Customer orders is Postgres, which is where
  // checkout writes now and what a signed-in customer reads under /account.
  // Named for what they are so nobody has to guess which list they are on.
  { href: '/admin/orders', label: 'Orders' },
  { href: '/admin/users', label: 'Customers' },
  { href: '/admin/customer-orders', label: 'Customer orders' },
  { href: '/admin/releases', label: 'Releases' },
  { href: '/admin/artists', label: 'Artists' },
  { href: '/admin/store', label: 'Store' },
  { href: '/admin/events', label: 'Events' },
  { href: '/admin/services', label: 'Services' },
  // The home page's own copy — the wordmark text, the scroll cue, every section
  // heading and button label. Without this screen those strings would only be
  // changeable in code, which is exactly what the client asked not to have.
  { href: '/admin/home', label: 'Home page' },
  { href: '/admin/about', label: 'About' },
  { href: '/admin/contact', label: 'Contact' },
  { href: '/admin/settings', label: 'Settings' },
  { href: '/admin/blackouts', label: 'Blackouts' },
] as const

export function AdminShell({
  email,
  newBookings,
  mustChangePassword,
  children,
}: {
  email: string
  /** Bookings with status 'new'. Queried in the layout, passed in here. */
  newBookings: number
  mustChangePassword: boolean
  children: ReactNode
}) {
  const pathname = usePathname() ?? ''

  const isCurrent = (href: string) =>
    href === '/admin'
      ? pathname === '/admin'
      : pathname === href || pathname.startsWith(`${href}/`)

  return (
    <div className="ad-shell">
      <aside className="ad-side">
        <div className="ad-side__head">
          <Link
            href="/admin"
            className="ad-side__logo"
            aria-current={isCurrent('/admin') ? 'page' : undefined}
          >
            <span className="ad-side__mark">MELOPHILE</span>
            <span className="label ad-side__tag">Admin</span>
          </Link>
        </div>

        <nav className="ad-nav" aria-label="Admin sections">
          <ul className="ad-nav__list">
            {SECTIONS.map((section) => (
              <li className="ad-nav__item" key={section.href}>
                <Link
                  href={section.href}
                  className="ad-nav__link"
                  aria-current={isCurrent(section.href) ? 'page' : undefined}
                >
                  <span className="ad-nav__text">{section.label}</span>
                  {section.href === '/admin/bookings' && newBookings > 0 ? (
                    <span className="ad-badge ad-badge--new">
                      {newBookings}
                      <span className="vh"> new</span>
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="ad-side__foot">
          <ul className="ad-nav__list">
            <li className="ad-nav__item">
              <Link
                href="/admin/account"
                className="ad-nav__link"
                aria-current={isCurrent('/admin/account') ? 'page' : undefined}
              >
                <span className="ad-nav__text">Account</span>
                {mustChangePassword ? (
                  <span className="ad-badge ad-badge--new" aria-hidden="true">
                    !
                  </span>
                ) : null}
              </Link>
            </li>
            <li className="ad-nav__item">
              {/* A POST, never a link: signing out is a state change and must
                  not be reachable by a prefetch or a stray GET. */}
              <form action={signOut}>
                <button type="submit" className="ad-nav__link ad-nav__link--btn">
                  <span className="ad-nav__text">Log out</span>
                </button>
              </form>
            </li>
            <li className="ad-nav__item">
              <a
                href="/"
                className="ad-nav__link"
                target="_blank"
                rel="noopener noreferrer"
              >
                <span className="ad-nav__text">View the site</span>
                <span className="vh"> (opens in a new tab)</span>
              </a>
            </li>
          </ul>

          <p className="mono ad-side__who" title={email}>
            {email}
          </p>
        </div>
      </aside>

      <div className="ad-main">
        {mustChangePassword ? (
          <div className="ad-banner" role="alert">
            <span className="label ad-banner__tag">Action needed</span>
            <p className="ad-banner__text">
              Change this password before you do anything else. It is the one the site was
              set up with, and anyone who has it can edit everything.{' '}
              <Link href="/admin/account" className="link">
                Change it now
              </Link>
              .
            </p>
          </div>
        ) : null}

        {children}
      </div>
    </div>
  )
}
