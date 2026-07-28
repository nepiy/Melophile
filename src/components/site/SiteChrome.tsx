import type { ReactNode } from 'react'
import { ChannelStrip } from '@/components/site/ChannelStrip'
import { Footer } from '@/components/site/Footer'
import { Nav } from '@/components/site/Nav'
import { getAbout, getCatalogCount, getHome, getSiteSettings } from '@/lib/data'

/**
 * The public site's furniture: channel strip, nav, main, footer.
 *
 * It lives in a component rather than in the root layout because /admin is also
 * a child of the root layout, and a layout cannot be escaped by its children —
 * so putting the nav up there meant the client saw the public header bolted
 * over their editor. The public pages get this via app/(site)/layout.tsx, and
 * the global 404 gets it directly.
 */
export async function SiteChrome({ children }: { children: ReactNode }) {
  const [settings, home, catalogCount, about] = await Promise.all([
    getSiteSettings(),
    getHome(),
    getCatalogCount(),
    getAbout(),
  ])

  return (
    <>
      <a href="#main" className="skip-link label">
        Skip to content
      </a>

      <ChannelStrip />

      <Nav
        logoText={settings.logoText}
        labels={{
          music: settings.navMusic,
          artists: settings.navArtists,
          store: settings.navStore,
          events: settings.navEvents,
          about: settings.navAbout,
          contact: settings.navContact,
        }}
        bookLabel={home.contactCta}
      />

      <div className="page">
        <main id="main">{children}</main>

        <Footer
          settings={settings}
          catalogCount={catalogCount}
          foundedYear={about.about.foundedYear}
        />
      </div>
    </>
  )
}
