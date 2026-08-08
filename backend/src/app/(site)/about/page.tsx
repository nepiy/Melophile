import type { Metadata } from 'next'
import { Reveal } from '@/components/site/Reveal'
import { SectionHead } from '@/components/site/SectionHead'
import { SmartImage } from '@/components/site/SmartImage'
import { pluralise } from '@/lib/format'
import { RichText, stripMarkdown } from '@/lib/markdown'
import { getAbout, type AboutPhotoFull } from '@/lib/data'

import '@/styles/about.css'

/* ==========================================================================
   /about — one rack unit, and the only page on the site that is mostly words.

   The whole page is two fields in the admin: a heading and one long text
   field. Nothing here is hard-coded except our own structural chrome.

   The photo column is the point of this file. Photos arrive later — today
   `about_photos` holds three slots with no image attached, and getAbout()
   filters those out, so `photos` is []. When it is empty the second column is
   never rendered: no empty frame, no reserved gap, no `visibility: hidden`.
   The branch is in the JSX, so the DOM tells the truth about what exists.
   ========================================================================== */

export async function generateMetadata(): Promise<Metadata> {
  const { about } = await getAbout()
  const description = stripMarkdown(about.body, 155)

  return {
    title: about.heading,
    // A blank body inherits the site description rather than setting an empty one.
    ...(description ? { description } : {}),
  }
}

export default async function AboutPage() {
  const { about, photos, catalogCount } = await getAbout()

  const hasBody = about.body.trim().length > 0
  const hasPhotos = photos.length > 0

  // Either half of the readout is optional, and neither leaves a stray
  // separator behind when it is absent.
  const showYear = typeof about.foundedYear === 'number'
  const showCount = about.showCatalogCount && catalogCount > 0

  return (
    <section className="sec about" aria-labelledby="about-heading">
      <div className="shell">
        <SectionHead
          channel="01"
          label="Story"
          heading={about.heading}
          id="about-heading"
          headingLevel={1}
          aside={
            showYear || showCount ? (
              <p className="label about__meta">
                {showYear ? (
                  <span>
                    Est. <span className="about__meta-v">{about.foundedYear}</span>
                  </span>
                ) : null}

                {showYear && showCount ? (
                  <span className="about__meta-sep" aria-hidden="true">
                    ·
                  </span>
                ) : null}

                {showCount ? (
                  <span>
                    <span className="about__meta-v">
                      {String(catalogCount).padStart(3, '0')}
                    </span>{' '}
                    {pluralise(catalogCount, 'release')}
                  </span>
                ) : null}
              </p>
            ) : null
          }
        />

        {!hasBody ? (
          /* Nothing written yet. If photos are already loaded they still get
             shown — the client did upload them. */
          <>
            <div className="about__note">
              <div className="empty">
                <p className="empty__title">Our story has not been written yet</p>
                <p className="empty__text">
                  Add it from the admin — the whole page is one editable text field.
                </p>
              </div>
            </div>
            {hasPhotos ? <AboutPhotos photos={photos} layout="row" /> : null}
          </>
        ) : hasPhotos ? (
          /* Words and pictures: two columns, photos running down the second. */
          <div className="about__layout">
            <Reveal className="about__prose">
              <RichText value={about.body} variant="story" />
            </Reveal>
            <AboutPhotos photos={photos} layout="column" />
          </div>
        ) : (
          /* No photos: one column at the wide measure, centred, with its own
             top edge. The photo column does not exist. */
          <Reveal className="about__solo">
            <RichText value={about.body} variant="story" />
          </Reveal>
        )}
      </div>
    </section>
  )
}

/* --------------------------------------------------------------------------
   The photo column. Each photo keeps its own shape (fill={false}) rather than
   being cropped to a grid cell, and a slot with no image renders nothing at
   all — getAbout() already dropped those, and empty="none" is the belt to
   that braces.
   -------------------------------------------------------------------------- */

const PHOTO_SIZES = {
  column:
    '(max-width: 559px) 88vw, (max-width: 899px) 44vw, (max-width: 1320px) 30vw, 400px',
  row: '(max-width: 559px) 88vw, (max-width: 1100px) 44vw, 30vw',
} as const

function AboutPhotos({
  photos,
  layout,
}: {
  photos: AboutPhotoFull[]
  layout: 'column' | 'row'
}) {
  return (
    <ul className={`about__photos about__photos--${layout}`}>
      {photos.map((photo, i) => (
        <Reveal as="li" key={photo.id} index={i}>
          <figure className="about__photo">
            <SmartImage
              image={photo.image}
              sizes={PHOTO_SIZES[layout]}
              empty="none"
              fill={false}
              className="about__photo-img"
            />
            {photo.caption.trim() ? (
              <figcaption className="mono about__caption">
                <span className="about__caption-n" aria-hidden="true">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span>{photo.caption}</span>
              </figcaption>
            ) : null}
          </figure>
        </Reveal>
      ))}
    </ul>
  )
}
