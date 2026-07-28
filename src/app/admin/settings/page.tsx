import type { Metadata } from 'next'
import { getSettingsForEdit } from '@/lib/admin-queries'
import { requireAdmin } from '@/lib/session'
import { SettingsForm, type SettingsFormValues } from './SettingsForm'

import '@/styles/admin-pages.css'

/* ==========================================================================
   /admin/settings — the chrome every page wears.

   A server component: it reads the row uncached and shapes it for the form. The
   row can be missing on a database that was migrated but never seeded, so the
   defaults below match the column defaults in src/db/schema.ts — and saving
   inserts the row.
   ========================================================================== */

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Settings',
  robots: { index: false, follow: false },
}

export default async function AdminSettingsPage() {
  await requireAdmin()

  const settings = await getSettingsForEdit()

  const values: SettingsFormValues = {
    logoText: settings?.logoText ?? 'MELOPHILE',
    navMusic: settings?.navMusic ?? 'Music',
    navArtists: settings?.navArtists ?? 'Artists',
    navAbout: settings?.navAbout ?? 'About us',
    navContact: settings?.navContact ?? 'Contact',
    footerText: settings?.footerText ?? '',
    socialLinks: (settings?.socialLinks ?? []).map((social) => ({
      platform: social.platform,
      url: social.url,
    })),
    metaTitle: settings?.metaTitle ?? 'Melophile Records',
    metaDescription: settings?.metaDescription ?? '',
  }

  return (
    <>
      <header className="ad-head">
        <div className="ad-head__strip" aria-hidden="true">
          <span className="mono ad-head__chan">08</span>
          <span className="ad-head__rule" />
          <span className="label">Site</span>
        </div>
        <div className="ad-head__title">
          <h1 className="ad-head__h">Settings</h1>
          <p className="ad-head__intro">
            The wordmark, the four nav labels, the footer and what search engines are
            told. These are read by every page, so a change here shows up across the whole
            site the moment you save it.
          </p>
        </div>
      </header>

      <SettingsForm settings={values} />
    </>
  )
}
