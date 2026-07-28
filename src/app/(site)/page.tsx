import Link from 'next/link'
import { Hero } from '@/components/hero/Hero'
import { ReleaseCard } from '@/components/music/ReleaseCard'
import { ContactDetails } from '@/components/site/ContactDetails'
import { Reveal } from '@/components/site/Reveal'
import { SectionHead } from '@/components/site/SectionHead'
import { ServiceIcon } from '@/components/site/ServiceIcon'
import { labelCode } from '@/lib/format'
import {
  getContact,
  getHome,
  getRecentReleases,
  getServices,
  getSiteSettings,
} from '@/lib/data'

import '@/styles/hero.css'
import '@/styles/home.css'

/* ==========================================================================
   Home. The scroll order is fixed by the client and built in exactly this
   order: hero → music → services → contact.

   Every heading, intro line and button label on this page comes from the
   `home` table. There is not one user-visible English string hard-coded here.
   ========================================================================== */

export default async function HomePage() {
  const [settings, home, services, contact] = await Promise.all([
    getSiteSettings(),
    getHome(),
    getServices(),
    getContact(),
  ])

  // Same rows /music reads, from the same query. Never a second copy.
  const releases = await getRecentReleases(home.featuredCount)

  return (
    <>
      {/* 1 — HERO */}
      <Hero
        line1={home.wordmarkLine1}
        line2={home.wordmarkLine2}
        tagline={home.wordmarkTagline}
        scrollCue={home.scrollCue}
        readoutCode={labelCode(settings.logoText)}
      />

      {/* 2 — MUSIC */}
      <section className="sec" id="music" aria-labelledby="music-heading">
        <div className="shell">
          <SectionHead
            channel="02"
            label="Music"
            heading={home.musicHeading}
            intro={home.musicIntro}
            id="music-heading"
            aside={
              releases.length > 0 ? (
                <Link href="/music" className="arrow-link">
                  {home.musicCta}
                  <span className="arrow-link__line" aria-hidden="true" />
                </Link>
              ) : null
            }
          />

          {releases.length === 0 ? (
            <div className="empty">
              <p className="empty__title">No releases published yet</p>
              <p className="empty__text">
                Add the first one from the admin. It will appear here and in the catalogue
                as soon as you publish it.
              </p>
            </div>
          ) : (
            <ul className="home-music" data-count={releases.length}>
              {releases.map((release, i) => (
                <Reveal as="li" key={release.id} index={i} className="home-music__item">
                  <ReleaseCard
                    release={release}
                    sizes="(max-width: 640px) 92vw, (max-width: 1024px) 46vw, 23vw"
                  />
                </Reveal>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* 3 — OUR SERVICES */}
      <section className="sec" id="services" aria-labelledby="services-heading">
        <div className="shell">
          <SectionHead
            channel="03"
            label="Services"
            heading={home.servicesHeading}
            intro={home.servicesIntro}
            id="services-heading"
          />

          {services.length === 0 ? (
            <div className="empty">
              <p className="empty__title">No services listed yet</p>
              <p className="empty__text">
                Add what the studio offers from the admin — recording, mixing, mastering,
                whatever fits.
              </p>
            </div>
          ) : (
            <ul className="svc">
              {services.map((service, i) => (
                <Reveal as="li" key={service.id} index={i} className="svc__item">
                  <ServiceIcon name={service.icon} />
                  <h3 className="svc__title">{service.title}</h3>
                  {service.description ? (
                    <p className="svc__line">{service.description}</p>
                  ) : null}
                </Reveal>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* 4 — CONTACT */}
      <section className="sec" id="contact" aria-labelledby="contact-heading">
        <div className="shell">
          <SectionHead
            channel="04"
            label="Contact"
            heading={home.contactHeading}
            id="contact-heading"
          />

          <div className="home-contact">
            <Reveal className="home-contact__details">
              <ContactDetails contact={contact} variant="compact" />
            </Reveal>

            <Reveal className="home-contact__cta" index={1}>
              <Link href="/contact#book" className="btn btn--solid">
                {home.contactCta}
              </Link>
              {contact.responseTime ? (
                <p className="home-contact__note">We reply {contact.responseTime}.</p>
              ) : null}
            </Reveal>
          </div>
        </div>
      </section>
    </>
  )
}
