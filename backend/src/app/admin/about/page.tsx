import type { Metadata } from 'next'
import type { AdminImage } from '@/components/admin/fields'
import { getAboutForEdit, type AdminAboutPhoto } from '@/lib/admin-queries'
import { requireAdmin } from '@/lib/session'
import { AboutForm, type AboutFormValues, type AboutSlot } from './AboutForm'

import '@/styles/admin-pages.css'

/* ==========================================================================
   /admin/about — the story page, and its photo slots.

   A server component: it reads the row uncached, keeps the slots the public
   getter throws away, and shapes both for the form. getAboutForEdit() returns a
   usable row even when the table is empty, so a database that was migrated but
   never seeded still opens — and saving inserts the row.
   ========================================================================== */

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'About',
  robots: { index: false, follow: false },
}

function toAdminImage(photo: AdminAboutPhoto): AdminImage | null {
  const image = photo.image
  if (!image) return null
  return {
    id: image.id,
    path: image.path,
    width: image.width,
    height: image.height,
    alt: image.alt,
    isPlaceholder: image.isPlaceholder,
  }
}

export default async function AdminAboutPage() {
  await requireAdmin()

  const { about, photos } = await getAboutForEdit()

  const values: AboutFormValues = {
    heading: about.heading,
    body: about.body,
    foundedYear: about.foundedYear === null ? '' : String(about.foundedYear),
    showCatalogCount: about.showCatalogCount,
  }

  const slots: AboutSlot[] = photos.map((photo) => ({
    id: photo.id,
    caption: photo.caption,
    image: toAdminImage(photo),
  }))

  return (
    <>
      <header className="ad-head">
        <div className="ad-head__strip" aria-hidden="true">
          <span className="mono ad-head__chan">06</span>
          <span className="ad-head__rule" />
          <span className="label">Story</span>
        </div>
        <div className="ad-head__title">
          <h1 className="ad-head__h">About</h1>
          <p className="ad-head__intro">
            The whole of /about: one heading and one long text field. The photo slots
            underneath are places a picture can go — an empty one is visible here and
            absent out there, so you can add photographs whenever they arrive.
          </p>
        </div>
      </header>

      <AboutForm about={values} slots={slots} />
    </>
  )
}
