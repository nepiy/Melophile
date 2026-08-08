'use client'

import { useActionState, useRef, useState, type FormEvent } from 'react'
import { SaveBar } from '@/components/admin/SaveBar'
import {
  DangerButton,
  Field,
  FormError,
  ImageField,
  MarkdownField,
  StatusToggle,
  TextArea,
  TextInput,
  type AdminImage,
} from '@/components/admin/fields'
import { deleteEvent, saveEvent, type EventState } from '@/lib/actions/events'
import { pluralise, slugify } from '@/lib/format'

/* ==========================================================================
   The event editor.

   A client component for three reasons and no others: useActionState, so an
   error lands next to the field that caused it; the slug assist; and the ticket
   readout, which has to answer "how many are left" while the client is still
   typing rather than after they have saved. Everything it renders is a
   primitive from fields.tsx and every value posts as ordinary multipart form
   data.

   PRICES ARE POUNDS IN THIS FORM AND PENCE IN THE DATABASE. The page converted
   pence to pounds on the way in; saveEvent converts pounds to pence on the way
   out with parseMoney. Nothing here does arithmetic on money at all.

   THE TICKET READOUT IS THE ONE PLACE THIS FORM ARGUES BACK. Tickets sold is
   editable because door sales are real and have to be recordable, and the cost
   of that is a number that can be typed above the capacity. The form does not
   refuse it — it says so, in the red that means something is wrong rather than
   something is missing, and leaves the client to decide which of the two
   numbers is the one that is out.
   ========================================================================== */

export type EventFormValues = {
  /** null creates. */
  id: number | null
  title: string
  slug: string
  description: string
  venue: string
  /** Newline-separated. One line per line, exactly as typed. */
  addressLines: string
  /** ISO 'YYYY-MM-DD'. */
  date: string
  /** 24h 'HH:MM', or blank. */
  startTime: string
  doorsTime: string
  /** Pounds, as typed: '18.00'. */
  price: string
  /** Blank means uncapped. */
  capacity: string
  ticketsSold: string
  externalUrl: string
  status: 'draft' | 'published'
  image: AdminImage | null
}

const EMPTY: EventState = {}

/** A count field that is blank reads as zero here; the server stores 0 too. */
function toCount(value: string): number {
  const n = Number(value.trim())
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

export function EventForm({
  event,
  currencySymbol,
  viewUrl,
}: {
  event: EventFormValues
  /** From the store page copy, so a ticket costs the same here as in the basket. */
  currencySymbol: string
  /** Set only for a published event. */
  viewUrl: string | null
}) {
  const [state, action, pending] = useActionState(saveEvent, EMPTY)

  const isNew = event.id === null

  // Existing events start "touched": a slug that changes under the client
  // breaks every link anyone has already shared.
  const slugTouched = useRef(!isNew)

  const [capacity, setCapacity] = useState(event.capacity)
  const [sold, setSold] = useState(event.ticketsSold)
  const [external, setExternal] = useState(event.externalUrl)

  /**
   * One handler on the form rather than controlled inputs, because the field
   * primitives are deliberately uncontrolled — a change event bubbles up to
   * here and the slug field is found by name on the form itself.
   */
  function onFormChange(formEvent: FormEvent<HTMLFormElement>) {
    const target = formEvent.target
    if (!(target instanceof HTMLInputElement)) return

    if (target.name === 'capacity') setCapacity(target.value)
    if (target.name === 'ticketsSold') setSold(target.value)
    if (target.name === 'externalUrl') setExternal(target.value)

    if (target.name === 'slug') {
      slugTouched.current = true
      return
    }
    if (target.name !== 'title' || slugTouched.current) return

    const slug = formEvent.currentTarget.elements.namedItem('slug')
    if (slug instanceof HTMLInputElement) slug.value = slugify(target.value)
  }

  const capped = capacity.trim() !== ''
  const cap = toCount(capacity)
  const soldCount = toCount(sold)
  const left = capped ? cap - soldCount : null
  const over = left !== null && left < 0

  return (
    <>
      <form className="ad-form" action={action} onChange={onFormChange} noValidate>
        <input type="hidden" name="id" value={event.id ?? ''} />

        <FormError message={state.error} />

        <section className="ad-panel" aria-labelledby="aev-basics">
          <div className="ad-panel__head">
            <span className="label" id="aev-basics">
              The event
            </span>
          </div>
          <div className="ad-panel__body">
            <div className="ad-form">
              <div className="ad-cols">
                <Field
                  label="Title"
                  htmlFor="title"
                  error={state.fieldErrors?.title}
                  required
                >
                  <TextInput
                    id="title"
                    name="title"
                    defaultValue={event.title}
                    maxLength={160}
                    required
                  />
                </Field>

                <Field
                  label="Web address"
                  htmlFor="slug"
                  hint={
                    isNew
                      ? 'The last part of the link to this event. It follows the title until you type here.'
                      : 'The last part of the link. It is never changed for you — but changing it yourself breaks links people have already shared.'
                  }
                  error={state.fieldErrors?.slug}
                >
                  <TextInput
                    id="slug"
                    name="slug"
                    defaultValue={event.slug}
                    placeholder="summer-showcase"
                    maxLength={72}
                  />
                </Field>
              </div>

              <ImageField
                name="image"
                label="Poster"
                image={event.image}
                aspect="square"
                hint="Square art. Anything from 800×800 up is plenty — it is resized on save."
              />
            </div>
          </div>
        </section>

        <section className="ad-panel" aria-labelledby="aev-words">
          <div className="ad-panel__head">
            <span className="label" id="aev-words">
              Words
            </span>
          </div>
          <div className="ad-panel__body">
            <MarkdownField
              id="description"
              name="description"
              label="Description"
              defaultValue={event.description}
              hint="Shown when someone opens the event. Who is on, what to expect, anything they need to know before they come."
              error={state.fieldErrors?.description}
            />
          </div>
        </section>

        <section className="ad-panel" aria-labelledby="aev-where">
          <div className="ad-panel__head">
            <span className="label" id="aev-where">
              Where and when
            </span>
          </div>
          <div className="ad-panel__body">
            <div className="ad-form">
              <div className="ad-cols">
                <Field label="Venue" htmlFor="venue" error={state.fieldErrors?.venue}>
                  <TextInput
                    id="venue"
                    name="venue"
                    defaultValue={event.venue}
                    placeholder="The Lantern"
                    maxLength={160}
                  />
                </Field>

                <Field
                  label="Address"
                  htmlFor="addressLines"
                  hint="One line per line. It is printed exactly as you type it."
                  error={state.fieldErrors?.addressLines}
                >
                  <TextArea
                    id="addressLines"
                    name="addressLines"
                    rows={4}
                    defaultValue={event.addressLines}
                    maxLength={400}
                  />
                </Field>
              </div>

              <div className="ad-cols">
                <Field
                  label="Date"
                  htmlFor="date"
                  hint="This is what decides whether the event is upcoming or past. It moves itself across on the night."
                  error={state.fieldErrors?.date}
                  required
                >
                  <TextInput
                    id="date"
                    name="date"
                    type="date"
                    defaultValue={event.date}
                    required
                  />
                </Field>

                <Field
                  label="Doors"
                  htmlFor="doorsTime"
                  hint="When people can come in. Leave it blank if it is the same as the start."
                  error={state.fieldErrors?.doorsTime}
                >
                  <TextInput
                    id="doorsTime"
                    name="doorsTime"
                    type="time"
                    defaultValue={event.doorsTime}
                  />
                </Field>

                <Field
                  label="Start"
                  htmlFor="startTime"
                  hint="When the music starts."
                  error={state.fieldErrors?.startTime}
                >
                  <TextInput
                    id="startTime"
                    name="startTime"
                    type="time"
                    defaultValue={event.startTime}
                  />
                </Field>
              </div>
            </div>
          </div>
        </section>

        <section className="ad-panel" aria-labelledby="aev-tickets">
          <div className="ad-panel__head">
            <span className="label" id="aev-tickets">
              Tickets
            </span>
          </div>
          <div className="ad-panel__body">
            <div className="ad-form">
              <div className="ad-cols">
                <Field
                  label={`Price (${currencySymbol})`}
                  htmlFor="priceCents"
                  hint="In pounds and pence. Type 18.00, not 1800. Blank is free entry."
                  error={state.fieldErrors?.priceCents}
                >
                  <TextInput
                    id="priceCents"
                    name="priceCents"
                    defaultValue={event.price}
                    placeholder="18.00"
                    maxLength={12}
                  />
                </Field>

                <Field
                  label="Capacity"
                  htmlFor="capacity"
                  hint="How many the room holds. Leave it blank for no cap — the page then makes no claim about how many are left."
                  error={state.fieldErrors?.capacity}
                >
                  <TextInput
                    id="capacity"
                    name="capacity"
                    type="number"
                    min={0}
                    defaultValue={event.capacity}
                    placeholder="Uncapped"
                  />
                </Field>

                <Field
                  label="Tickets sold"
                  htmlFor="ticketsSold"
                  hint="The store keeps this up to date on its own. Change it only to add what went on the door, or to correct a count."
                  error={state.fieldErrors?.ticketsSold}
                >
                  <TextInput
                    id="ticketsSold"
                    name="ticketsSold"
                    type="number"
                    min={0}
                    defaultValue={event.ticketsSold}
                    placeholder="0"
                  />
                </Field>
              </div>

              <p
                className={`mono aev-readout${over ? ' aev-readout--over' : ''}`}
                role="status"
              >
                {!capped
                  ? `${soldCount} sold · uncapped`
                  : over
                    ? `${soldCount} sold against a capacity of ${cap} — ${Math.abs(
                        left ?? 0,
                      )} over. One of the two numbers is wrong.`
                    : `${soldCount} sold · ${left} ${pluralise(
                        left ?? 0,
                        'ticket',
                      )} left of ${cap}`}
              </p>

              <Field
                label="Sell somewhere else"
                htmlFor="externalUrl"
                hint="Set this and the page links out to the venue instead of selling tickets here."
                error={state.fieldErrors?.externalUrl}
              >
                <TextInput
                  id="externalUrl"
                  name="externalUrl"
                  defaultValue={event.externalUrl}
                  placeholder="https://"
                  maxLength={500}
                />
              </Field>

              {external.trim() ? (
                <p className="aev-note">
                  Tickets are not sold here while that link is set. The capacity and the
                  count below it stay as a record; nothing on the site adds to them.
                </p>
              ) : null}
            </div>
          </div>
        </section>

        <section className="ad-panel" aria-labelledby="aev-visibility">
          <div className="ad-panel__head">
            <span className="label" id="aev-visibility">
              Visibility
            </span>
          </div>
          <div className="ad-panel__body">
            <div className="ad-field">
              <span className="label ad-field__label">Status</span>
              <p className="ad-field__hint">
                A draft is invisible on the events page. Published puts it up straight
                away.
              </p>
              <StatusToggle name="status" value={event.status} />
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
      {event.id === null ? null : (
        <form className="aev-danger" action={deleteEvent.bind(null, event.id)}>
          <p className="aev-danger__text">
            Deleting takes this event off the site immediately and cannot be undone.
            Tickets already sold keep their own copy of the title and the price, so
            nothing anyone has bought changes. The poster goes with it, unless another
            page uses the same one.
          </p>
          <DangerButton confirmLabel="Delete it">Delete event</DangerButton>
        </form>
      )}
    </>
  )
}
