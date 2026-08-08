import Link from 'next/link'
import type { SiteSettingsRow } from '@/db'
import { safeUrl } from '@/lib/markdown'

/* /admin is never linked from here. That is the whole point of it not being
   in the nav either. */
export function Footer({
  settings,
  catalogCount,
  foundedYear,
}: {
  settings: SiteSettingsRow
  catalogCount: number
  foundedYear: number | null
}) {
  const socials = settings.socialLinks.filter((s) => safeUrl(s.url) !== null)

  return (
    <footer className="foot">
      <div className="foot__rule" aria-hidden="true" />
      <div className="shell foot__inner">
        <div className="foot__brand">
          <span className="foot__mark">{settings.logoText}</span>
          {settings.footerText ? (
            <p className="foot__text">{settings.footerText}</p>
          ) : null}
        </div>

        <nav className="foot__nav" aria-label="Footer">
          <ul>
            <li>
              <Link href="/music" className="foot__link label">
                {settings.navMusic}
              </Link>
            </li>
            <li>
              <Link href="/artists" className="foot__link label">
                {settings.navArtists}
              </Link>
            </li>
            <li>
              <Link href="/store" className="foot__link label">
                {settings.navStore}
              </Link>
            </li>
            <li>
              <Link href="/events" className="foot__link label">
                {settings.navEvents}
              </Link>
            </li>
            <li>
              <Link href="/about" className="foot__link label">
                {settings.navAbout}
              </Link>
            </li>
            <li>
              <Link href="/contact" className="foot__link label">
                {settings.navContact}
              </Link>
            </li>
          </ul>
        </nav>

        {socials.length > 0 ? (
          <nav className="foot__social" aria-label="Social">
            <ul>
              {socials.map((s) => (
                <li key={`${s.platform}-${s.url}`}>
                  <a
                    className="foot__link label"
                    href={safeUrl(s.url) ?? '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {s.platform}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}

        {/* The utility mono earning its keep: real information, stated plainly. */}
        <p className="foot__meta mono">
          {foundedYear ? <span>EST. {foundedYear}</span> : null}
          {catalogCount > 0 ? (
            <span>
              {String(catalogCount).padStart(3, '0')}{' '}
              {catalogCount === 1 ? 'RELEASE' : 'RELEASES'}
            </span>
          ) : null}
          <span>© {new Date().getFullYear()}</span>
        </p>
      </div>
    </footer>
  )
}
