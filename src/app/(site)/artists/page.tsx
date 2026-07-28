import type { Metadata } from 'next'
import { ArtistGrid } from '@/components/artists/ArtistGrid'
import { SectionHead } from '@/components/site/SectionHead'
import { getArtists, getSiteSettings } from '@/lib/data'
import { pluralise } from '@/lib/format'

import '@/styles/artists.css'

/* ==========================================================================
   /artists — the roster.

   The client's one instruction for this page was that the grid shows the
   photographs and nothing else: no bio, no role, no genre, no caption. The
   name is revealed on hover and on focus; everything else waits for a click.
   So this page is deliberately thin — one head, one grid — and the whole of
   the content lives in the panel the grid opens.

   The heading is the client's own word for this section, read from
   site_settings, so renaming the nav item renames the page with it.
   ========================================================================== */

export const metadata: Metadata = {
  title: 'Artists',
}

export default async function ArtistsPage() {
  const [settings, artists] = await Promise.all([getSiteSettings(), getArtists()])

  return (
    <section className="sec" id="roster" aria-labelledby="artists-heading">
      <div className="shell">
        <SectionHead
          channel="01"
          label="Roster"
          heading={settings.navArtists}
          id="artists-heading"
          headingLevel={1}
          aside={
            artists.length > 0 ? (
              <p className="mono dim">
                {artists.length} {pluralise(artists.length, 'collaborator')}
              </p>
            ) : null
          }
        />

        {artists.length === 0 ? (
          <div className="empty">
            <p className="empty__title">No artists published yet</p>
            <p className="empty__text">
              Add the first collaborator from the admin, with a photo and a short
              description.
            </p>
          </div>
        ) : (
          <ArtistGrid artists={artists} />
        )}
      </div>
    </section>
  )
}
