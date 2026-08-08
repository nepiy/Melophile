import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import { getSiteSettings } from '@/lib/data'
import { fontClassNames } from './fonts'

// Railway private networking is available after the service starts, not while
// its build image is created. Keep data-backed routes request-rendered.
export const dynamic = 'force-dynamic'

/* The root layout is deliberately bare: html, body, fonts, global stylesheets.

   The public nav and footer live in app/(site)/layout.tsx instead, because
   /admin is also a child of this layout and a child cannot opt out of its
   parent — with the nav up here, the client saw the public header bolted over
   their editor.

   Order matters and is explicit: tokens define the vocabulary, base applies it
   to the document, chrome builds the shared furniture. Page-specific
   stylesheets are imported by their own pages and land after these. */
import '@/styles/tokens.css'
import '@/styles/base.css'
import '@/styles/chrome.css'

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSiteSettings()
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

  return {
    metadataBase: new URL(base),
    title: {
      default: settings.metaTitle,
      template: `%s — ${settings.logoText.charAt(0)}${settings.logoText
        .slice(1)
        .toLowerCase()} Records`,
    },
    description: settings.metaDescription,
    openGraph: {
      title: settings.metaTitle,
      description: settings.metaDescription,
      type: 'website',
      url: base,
    },
    // /admin is excluded at the route level too, via headers() in next.config.
    robots: { index: true, follow: true },
  }
}

export const viewport: Viewport = {
  themeColor: '#0f0c0a',
  colorScheme: 'dark',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={fontClassNames}>
      <body>{children}</body>
    </html>
  )
}
