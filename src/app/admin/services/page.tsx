import type { Metadata } from 'next'
import Link from 'next/link'
import { DangerButton, OrderButtons } from '@/components/admin/fields'
import { ServiceIcon } from '@/components/site/ServiceIcon'
import { listServices } from '@/lib/admin-queries'
import { deleteService, moveService, setServiceStatus } from '@/lib/actions/roster'
import { pluralise } from '@/lib/format'
import { requireAdmin } from '@/lib/session'

import '@/styles/admin-roster.css'

/* ==========================================================================
   What the studio offers, as the client operates it.

   One row per service, drafts included, in the order the home page lists
   them. The icon is the real one the site draws, not a name in a box — the
   client picks which icon, never what it looks like.
   ========================================================================== */

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Services',
  robots: { index: false, follow: false },
}

export default async function AdminServicesPage() {
  await requireAdmin()

  const services = await listServices()
  const published = services.filter((service) => service.status === 'published').length

  return (
    <>
      <header className="ad-head">
        <div className="ad-head__strip" aria-hidden="true">
          <span className="mono ad-head__chan">04</span>
          <span className="ad-head__rule" />
          <span className="label">Studio</span>
        </div>
        <div className="ad-head__title">
          <h1 className="ad-head__h">Services</h1>
          <p className="ad-head__intro">
            What the studio offers, in the order the home page lists them. Six reads best
            in that grid — the arrows set which come first. Drafts are invisible on the
            site until you publish them.
          </p>
        </div>
        <div className="ad-head__aside">
          <Link href="/admin/services/new" className="btn ad-btn--primary">
            New service
          </Link>
        </div>
      </header>

      <section className="ad-panel" aria-labelledby="services-heading">
        <div className="ad-panel__head">
          <span className="label" id="services-heading">
            Services
          </span>
          <span className="mono ros-count">
            {services.length} {pluralise(services.length, 'service')} · {published}{' '}
            published
          </span>
        </div>

        <div className="ad-panel__body">
          {services.length === 0 ? (
            <div className="empty">
              <p className="empty__title">No services listed yet</p>
              <p className="empty__text">
                Add what the studio offers — recording, mixing, mastering, whatever fits.
              </p>
            </div>
          ) : (
            <ul className="ad-table">
              {services.map((service) => {
                const nextStatus = service.status === 'published' ? 'draft' : 'published'

                return (
                  <li className="ad-row svc-row" key={service.id}>
                    <span className="svc-row__icon">
                      <ServiceIcon name={service.icon} />
                    </span>

                    <div className="svc-row__main">
                      <Link
                        href={`/admin/services/${service.id}`}
                        className="ad-row__title svc-row__link"
                      >
                        {service.title}
                      </Link>
                      <span className="svc-row__text">
                        {service.description || 'No description yet'}
                      </span>
                    </div>

                    <span className="svc-row__flags">
                      <span
                        className={`ad-badge ad-badge--${
                          service.status === 'published' ? 'published' : 'draft'
                        }`}
                      >
                        {service.status === 'published' ? 'Published' : 'Draft'}
                      </span>
                      <span className="mono ad-row__meta">{service.icon}</span>
                    </span>

                    <span className="ad-row__tools">
                      <OrderButtons
                        upAction={moveService.bind(null, service.id, 'up')}
                        downAction={moveService.bind(null, service.id, 'down')}
                      />

                      <form action={setServiceStatus.bind(null, service.id, nextStatus)}>
                        <button type="submit" className="btn btn--sm btn--ghost">
                          {service.status === 'published' ? 'Unpublish' : 'Publish'}
                          <span className="vh"> {service.title}</span>
                        </button>
                      </form>

                      <Link
                        href={`/admin/services/${service.id}`}
                        className="btn btn--sm"
                      >
                        Edit
                        <span className="vh"> {service.title}</span>
                      </Link>

                      <form action={deleteService.bind(null, service.id)}>
                        <DangerButton confirmLabel="Delete it">
                          Delete
                          <span className="vh"> {service.title}</span>
                        </DangerButton>
                      </form>
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </section>
    </>
  )
}
