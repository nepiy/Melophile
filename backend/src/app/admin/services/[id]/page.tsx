import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getServiceForEdit } from '@/lib/admin-queries'
import { requireAdmin } from '@/lib/session'
import { ServiceForm, type ServiceFormValues } from './ServiceForm'

import '@/styles/admin-roster.css'

/* ==========================================================================
   One service. `new` creates.

   The smallest editor in here — a title, a line of description, an icon and a
   status. It is a server component all the same, for the same reason every
   other editor is: the row is read uncached, so what opens is what is stored.
   ========================================================================== */

export const dynamic = 'force-dynamic'

type PageProps = { params: Promise<{ id: string }> }

function noIndex(title: string): Metadata {
  return { title, robots: { index: false, follow: false } }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params
  if (id === 'new') return noIndex('New service')

  const service = /^\d+$/.test(id) ? await getServiceForEdit(Number(id)) : null
  return noIndex(service ? service.title : 'Service')
}

export default async function ServiceEditorPage({ params }: PageProps) {
  await requireAdmin()

  const { id } = await params
  const isNew = id === 'new'
  if (!isNew && !/^\d+$/.test(id)) notFound()

  const service = isNew ? null : await getServiceForEdit(Number(id))
  if (!isNew && !service) notFound()

  const values: ServiceFormValues = {
    id: service?.id ?? null,
    title: service?.title ?? '',
    description: service?.description ?? '',
    icon: service?.icon ?? 'waveform',
    status: service?.status ?? 'draft',
  }

  return (
    <>
      <header className="ad-head">
        <div className="ad-head__strip" aria-hidden="true">
          <span className="mono ad-head__chan">{isNew ? 'NEW' : '04'}</span>
          <span className="ad-head__rule" />
          <span className="label">Service</span>
        </div>
        <div className="ad-head__title">
          <h1 className="ad-head__h">{service ? service.title : 'New service'}</h1>
          {service ? (
            <p className="mono ros-head__meta">
              {service.icon} · {service.status === 'published' ? 'Published' : 'Draft'}
            </p>
          ) : null}
          <p className="ad-head__intro">
            {isNew
              ? 'A title, one line under it and an icon. It joins the end of the row on the home page — the arrows on the list move it.'
              : 'Every change here is live on the home page the moment you save it. Set it back to draft to take it out of the row without deleting it.'}
          </p>
        </div>
        <div className="ad-head__aside">
          <Link href="/admin/services" className="btn btn--sm btn--ghost">
            All services
          </Link>
        </div>
      </header>

      <ServiceForm
        service={values}
        viewUrl={service && service.status === 'published' ? '/#services' : null}
      />
    </>
  )
}
