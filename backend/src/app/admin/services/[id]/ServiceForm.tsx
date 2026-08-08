'use client'

import { useActionState, useState, type FormEvent } from 'react'
import { SaveBar } from '@/components/admin/SaveBar'
import {
  DangerButton,
  Field,
  FormError,
  SelectField,
  StatusToggle,
  TextArea,
  TextInput,
} from '@/components/admin/fields'
import { ServiceIcon } from '@/components/site/ServiceIcon'
import { SERVICE_ICONS, type ServiceIcon as ServiceIconName } from '@/db/schema'
import { deleteService, saveService, type ServiceState } from '@/lib/actions/roster'

/* ==========================================================================
   The service editor form.

   A client component for useActionState, and for one small thing that is
   worth the boundary: the icon drawn next to the select is the one the site
   will draw, and it changes as the select changes. The client picks from a
   closed list of eight; they never pick what an icon looks like.

   The select stays uncontrolled — the change event bubbles to the form, which
   is enough to keep the preview honest without a controlled input.
   ========================================================================== */

export type ServiceFormValues = {
  /** null creates. */
  id: number | null
  title: string
  description: string
  icon: ServiceIconName
  status: 'draft' | 'published'
}

const EMPTY: ServiceState = {}

/** The eight slugs, in plain words. The value posted is always the slug. */
const ICON_LABELS: Record<ServiceIconName, string> = {
  mic: 'Microphone',
  fader: 'Faders',
  waveform: 'Waveform',
  knob: 'Rotary knob',
  tape: 'Tape machine',
  disc: 'Record',
  monitor: 'Studio monitor',
  patchbay: 'Patchbay',
}

const ICON_OPTIONS = SERVICE_ICONS.map((icon) => ({
  value: icon,
  label: ICON_LABELS[icon],
}))

export function ServiceForm({
  service,
  viewUrl,
}: {
  service: ServiceFormValues
  /** Set only for a published service. */
  viewUrl: string | null
}) {
  const [state, action, pending] = useActionState(saveService, EMPTY)
  const [icon, setIcon] = useState<ServiceIconName>(service.icon)

  function onFormChange(event: FormEvent<HTMLFormElement>) {
    const target = event.target
    if (!(target instanceof HTMLSelectElement) || target.name !== 'icon') return
    setIcon(target.value as ServiceIconName)
  }

  return (
    <>
      <form className="ad-form" action={action} onChange={onFormChange} noValidate>
        <input type="hidden" name="id" value={service.id ?? ''} />

        <FormError message={state.error} />

        <section className="ad-panel" aria-labelledby="svc-basics">
          <div className="ad-panel__head">
            <span className="label" id="svc-basics">
              The service
            </span>
          </div>
          <div className="ad-panel__body">
            <div className="ad-form">
              <Field
                label="Title"
                htmlFor="title"
                hint="Two or three words. It sits above the line below."
                error={state.fieldErrors?.title}
                required
              >
                <TextInput
                  id="title"
                  name="title"
                  defaultValue={service.title}
                  placeholder="Mixing"
                  maxLength={80}
                  required
                />
              </Field>

              <Field
                label="Description"
                htmlFor="description"
                hint="One short line — it sits under the title on the home page."
                error={state.fieldErrors?.description}
              >
                <TextArea
                  id="description"
                  name="description"
                  defaultValue={service.description}
                  rows={3}
                  maxLength={200}
                />
              </Field>

              <Field
                label="Icon"
                htmlFor="icon"
                hint="Eight to choose from, all drawn on the same grid. The one shown next to the list is the one the site will draw."
                error={state.fieldErrors?.icon}
              >
                <span className="ros-pick">
                  <SelectField
                    id="icon"
                    name="icon"
                    defaultValue={service.icon}
                    options={ICON_OPTIONS}
                  />
                  <span className="ros-pick__preview">
                    <ServiceIcon name={icon} />
                    <span className="mono ros-pick__name">{icon}</span>
                  </span>
                </span>
              </Field>
            </div>
          </div>
        </section>

        <section className="ad-panel" aria-labelledby="svc-visibility">
          <div className="ad-panel__head">
            <span className="label" id="svc-visibility">
              Visibility
            </span>
          </div>
          <div className="ad-panel__body">
            <div className="ad-field">
              <span className="label ad-field__label">Status</span>
              <p className="ad-field__hint">
                A draft is invisible on the site. Published puts it in the row on the home
                page straight away.
              </p>
              <StatusToggle name="status" value={service.status} />
            </div>
          </div>
        </section>

        <SaveBar saving={pending} saved={state.saved}>
          {viewUrl ? (
            <a
              className="btn btn--sm btn--ghost"
              href={viewUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              View on the site
              <span className="vh"> (opens in a new tab)</span>
            </a>
          ) : null}
        </SaveBar>
      </form>

      {/* Its own form, and it has to be: a submit button inside the editor form
          would post the editor form, and a nested <form> is invalid HTML that
          the browser silently drops. */}
      {service.id === null ? null : (
        <form className="ros-danger" action={deleteService.bind(null, service.id)}>
          <p className="ros-danger__text">
            Deleting takes this service off the home page immediately and cannot be
            undone. Set it to draft instead if you only want it gone for now.
          </p>
          <DangerButton confirmLabel="Delete it">Delete service</DangerButton>
        </form>
      )}
    </>
  )
}
