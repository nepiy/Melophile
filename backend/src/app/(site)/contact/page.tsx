import type { Metadata } from 'next'
import { BookingForm } from '@/components/contact/BookingForm'
import { ContactDetails } from '@/components/site/ContactDetails'
import { Reveal } from '@/components/site/Reveal'
import { SectionHead } from '@/components/site/SectionHead'
import { getBlackoutDates, getContact, getHome } from '@/lib/data'
import { todayIso } from '@/lib/format'
import { safeUrl } from '@/lib/markdown'

import '@/styles/contact.css'

/* ==========================================================================
   /contact — two rack units.

     01 · CONTACT   the details plate, and the map if there is one
     02 · BOOKING   the studio request, anchored at #book

   Every heading, intro, detail and success line on this page is a column in
   the `contact` row — the same row home section 4 reads. The only literals
   here are structural: our channel labels and the map's frame label.
   ========================================================================== */

export const metadata: Metadata = {
  title: 'Contact',
}

export default async function ContactPage() {
  const [home, contact, blackoutDates] = await Promise.all([
    getHome(),
    getContact(),
    getBlackoutDates(),
  ])

  // The field holds an iframe src and nothing else — never markup. safeUrl
  // rejects anything unopenable, and an embed additionally has to be http(s):
  // a mailto: or tel: URL is a safe link but not a safe frame.
  const safeMap = safeUrl(contact.mapEmbed)
  const mapSrc = safeMap && /^https?:\/\//i.test(safeMap) ? safeMap : null

  return (
    <>
      {/* 01 — CONTACT */}
      <section className="sec" aria-labelledby="contact-heading">
        <div className="shell">
          <SectionHead
            channel="01"
            label="Contact"
            heading={home.contactHeading}
            id="contact-heading"
            headingLevel={1}
          />

          <div className="ct-top">
            <Reveal>
              <ContactDetails contact={contact} variant="full" />
            </Reveal>

            {/* No map URL saved means no map, no frame and no placeholder. */}
            {mapSrc ? (
              <Reveal className="ct-map" index={1}>
                <p className="label">Location</p>
                <div className="ct-map__frame">
                  <iframe
                    src={mapSrc}
                    title="Studio location"
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                </div>
              </Reveal>
            ) : null}
          </div>
        </div>
      </section>

      {/* 02 — BOOKING. /contact#book lands here, clear of the fixed nav. */}
      <section className="sec ct-book" id="book" aria-labelledby="book-heading">
        <div className="shell">
          <SectionHead
            channel="02"
            label="Booking"
            heading={contact.bookingHeading}
            intro={contact.bookingIntro}
            id="book-heading"
          />

          <BookingForm
            today={todayIso()}
            blackoutDates={blackoutDates}
            successMessage={contact.bookingSuccessMessage}
            responseTime={contact.responseTime}
          />
        </div>
      </section>
    </>
  )
}
