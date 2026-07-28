import type { Metadata } from 'next'
import { getContactForEdit } from '@/lib/admin-queries'
import { requireAdmin } from '@/lib/session'
import { ContactForm, type ContactFormValues } from './ContactForm'

import '@/styles/admin-pages.css'

/* ==========================================================================
   /admin/contact — the details plate and the booking copy.

   A server component: it reads the row uncached and shapes it for the form.
   The row can be missing on a database that was migrated but never seeded, so
   the defaults below match the column defaults in src/db/schema.ts — and saving
   inserts the row.
   ========================================================================== */

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Contact',
  robots: { index: false, follow: false },
}

export default async function AdminContactPage() {
  await requireAdmin()

  const contact = await getContactForEdit()

  const values: ContactFormValues = {
    addressLines: contact?.addressLines ?? '',
    emails: (contact?.emails ?? []).map((email) => ({
      label: email.label,
      address: email.address,
    })),
    phone: contact?.phone ?? '',
    hours: contact?.hours ?? '',
    socialLinks: (contact?.socialLinks ?? []).map((social) => ({
      platform: social.platform,
      url: social.url,
    })),
    mapEmbed: contact?.mapEmbed ?? '',
    bookingHeading: contact?.bookingHeading ?? 'Book the studio',
    bookingIntro: contact?.bookingIntro ?? '',
    bookingSuccessMessage: contact?.bookingSuccessMessage ?? '',
    responseTime: contact?.responseTime ?? 'within two working days',
  }

  return (
    <>
      <header className="ad-head">
        <div className="ad-head__strip" aria-hidden="true">
          <span className="mono ad-head__chan">07</span>
          <span className="ad-head__rule" />
          <span className="label">Contact</span>
        </div>
        <div className="ad-head__title">
          <h1 className="ad-head__h">Contact</h1>
          <p className="ad-head__intro">
            Everything here is optional apart from the booking heading. A field you leave
            blank is not rendered at all — no empty label, no dash, no gap. The details
            are read by /contact and by the home page, so they exist in one place only.
          </p>
        </div>
      </header>

      <ContactForm contact={values} />
    </>
  )
}
