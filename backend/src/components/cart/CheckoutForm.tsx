'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  useActionState,
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import { priceCartAction } from '@/lib/actions/cart-price'
import { submitCheckout } from '@/lib/actions/checkout'
import type { PricedCart } from '@/lib/cart'
import { CART_CHANGED_EVENT, readCart, writeCart, type CartLine } from '@/lib/cart-types'
import { formatMoney } from '@/lib/format'
import { checkoutSchema } from '@/lib/validation'

/* ==========================================================================
   Checkout.

   Validation is written once and runs three times: checkoutSchema drives the
   inline checks here (on blur, and on change once a field has already
   complained), gates the submit here, and runs again on the server before
   anything is written. A message read in the browser is the same sentence the
   server would have produced, because it is the same schema.

   The field names below match checkoutSchema exactly — name, email, phone,
   shippingLines, needsShipping, company — because the FormData this builds is
   parsed by that schema on the other side.

   THE PRICE RULE HOLDS HERE TOO. The summary beside the form is priced by
   priceCartAction() on the server, and the form posts the basket as ids and
   quantities. submitCheckout() re-prices it from the database and ignores
   anything this component might have thought the total was.
   ========================================================================== */

const FIELDS = ['name', 'email', 'phone', 'shippingLines'] as const
type Field = (typeof FIELDS)[number]
type Values = Record<Field, string>
type Errors = Partial<Record<Field, string>>

const BLANK: Values = { name: '', email: '', phone: '', shippingLines: '' }

export type CheckoutFormProps = {
  /** stripeConfigured(), from the server page. Decides the button's promise. */
  stripeReady: boolean
  /** storePage.checkoutNote — shown by the submit button. */
  checkoutNote: string
  /** storePage.shippingNote — shown by the address field. */
  shippingNote: string
  /** Account details are read server-side and become editable only in this checkout. */
  initialCustomer?: Partial<Values>
}

/**
 * Every field's problem in one pass, from the same schema the server uses.
 * `needsShipping` changes the rules, so it is an argument rather than a value
 * read off the form: the address is only required when there is a parcel.
 */
function problems(values: Values, needsShipping: boolean): Errors {
  const result = checkoutSchema.safeParse({ ...values, needsShipping, company: '' })
  if (result.success) return {}

  const out: Errors = {}
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? '')
    if ((FIELDS as readonly string[]).includes(key) && !(key in out)) {
      out[key as Field] = issue.message
    }
  }
  return out
}

export function CheckoutForm({
  stripeReady,
  checkoutNote,
  shippingNote,
  initialCustomer,
}: CheckoutFormProps) {
  const router = useRouter()
  const [state, formAction, pending] = useActionState(submitCheckout, {})

  const [lines, setLines] = useState<CartLine[] | null>(null)
  const [cart, setCart] = useState<PricedCart | null>(null)
  const [busy, setBusy] = useState(false)

  const [values, setValues] = useState<Values>({ ...BLANK, ...initialCustomer })
  const [errors, setErrors] = useState<Errors>({})
  const [leaving, setLeaving] = useState(false)

  const alertRef = useRef<HTMLDivElement | null>(null)
  const controls = useRef(new Map<Field, HTMLElement>())
  const done = useRef(false)

  const needsShipping = cart?.hasPhysical ?? false

  /* ---- the basket, and what the server says it costs ---- */

  useEffect(() => {
    const sync = () => setLines(readCart())
    sync()
    window.addEventListener(CART_CHANGED_EVENT, sync)
    return () => window.removeEventListener(CART_CHANGED_EVENT, sync)
  }, [])

  useEffect(() => {
    if (lines === null || lines.length === 0) {
      setCart(null)
      return
    }
    let live = true
    setBusy(true)
    priceCartAction(lines)
      .then((priced) => {
        if (!live) return
        setCart(priced)
        setBusy(false)
      })
      .catch(() => {
        if (live) setBusy(false)
      })
    return () => {
      live = false
    }
  }, [lines])

  /* ---- what happens after the action succeeds ----

     Three endings, and the basket is cleared in every one of them: the order
     exists on the server by this point, so a basket that survived would put
     the same items through twice. `done` guards against the effect running
     again on a re-render mid-navigation. */

  useEffect(() => {
    if (done.current) return

    if (state.redirectUrl) {
      done.current = true
      writeCart([])
      setLeaving(true)
      window.location.assign(state.redirectUrl)
      return
    }

    if (state.reference) {
      done.current = true
      writeCart([])
      setLeaving(true)
      const access = state.accessToken
        ? `?access=${encodeURIComponent(state.accessToken)}`
        : ''
      router.push(`/order/${state.reference}${access}`)
    }
  }, [state, router])

  /* ---- the server's own field errors take focus, same as ours ---- */

  useEffect(() => {
    const returned = state.fieldErrors
    if (!returned) return
    const bad = FIELDS.find((field) => returned[field])
    if (bad) controls.current.get(bad)?.focus()
    else if (state.formError || state.cartIssues) alertRef.current?.focus()
  }, [state])

  /* ---- inline validation ---- */

  const apply = useCallback((field: Field, message: string | undefined) => {
    setErrors((prev) => {
      const out = { ...prev }
      if (message) out[field] = message
      else delete out[field]
      return out
    })
  }, [])

  function change(field: Field, value: string) {
    const next = { ...values, [field]: value }
    setValues(next)
    // Only re-check on change once the field has already said something is
    // wrong. Checking as they first type would nag mid-word.
    if (errors[field]) apply(field, problems(next, needsShipping)[field])
  }

  function blur(field: Field) {
    apply(field, problems(values, needsShipping)[field])
  }

  const hold = (field: Field) => (el: HTMLElement | null) => {
    if (el) controls.current.set(field, el)
    else controls.current.delete(field)
  }

  const boundTo = (field: Field, hasHint = false) =>
    [hasHint ? `co-${field}-hint` : null, errors[field] ? `co-${field}-err` : null]
      .filter(Boolean)
      .join(' ') || undefined

  /**
   * React runs onSubmit before the form's action, and preventDefault here
   * stops the action from firing at all — which is what lets a bad form fail
   * in the browser without a round trip.
   */
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    const found = problems(values, needsShipping)
    setErrors(found)

    const firstBad = FIELDS.find((field) => found[field])
    if (firstBad) {
      event.preventDefault()
      controls.current.get(firstBad)?.focus()
    }
  }

  /* ---------------------------- leaving ---------------------------- */

  if (leaving) {
    return (
      <div className="cko__leaving" role="status" aria-live="polite">
        <p className="label cko__leaving-label">
          {state.redirectUrl ? 'Payment' : 'Order'}
        </p>
        <p className="cko__leaving-text">
          {state.redirectUrl
            ? 'Taking you to payment…'
            : 'Order placed. Taking you to your order…'}
        </p>
        {state.unpaidNotice ? (
          <p className="mono cko__leaving-note">{state.unpaidNotice}</p>
        ) : null}
      </div>
    )
  }

  /* ----------------------------- empty ----------------------------- */

  if (lines === null) {
    return (
      <div className="cko__wait mono" role="status" aria-live="polite">
        Reading your basket…
      </div>
    )
  }

  if (lines.length === 0) {
    return (
      <div className="empty cko__empty">
        <p className="empty__title">There is nothing to pay for</p>
        <p className="empty__text">
          Your basket is empty. Everything in the store is one click from here.
        </p>
        <Link href="/store" className="btn cko__empty-go">
          Go to the store
        </Link>
      </div>
    )
  }

  /* ------------------------------ form ----------------------------- */

  const symbol = cart?.symbol ?? '£'
  const action = stripeReady ? 'Pay now' : 'Place order'
  const working = stripeReady ? 'Taking payment…' : 'Placing order…'

  return (
    <div className="cko">
      <form className="cko__form" action={formAction} onSubmit={onSubmit} noValidate>
        {state.formError || state.cartIssues ? (
          <div className="cko__alert" role="alert" tabIndex={-1} ref={alertRef}>
            <p className="label cko__alert-label">Not placed</p>
            {state.formError ? (
              <p className="cko__alert-text">{state.formError}</p>
            ) : null}
            {(state.cartIssues ?? []).map((issue) => (
              <p key={issue} className="cko__alert-text">
                {issue}
              </p>
            ))}
            {state.cartIssues ? (
              <Link href="/cart" className="btn btn--ghost cko__alert-go">
                Back to the basket
              </Link>
            ) : null}
          </div>
        ) : null}

        <div className="cko__grid">
          <Cell field="name" label="Name" error={errors.name}>
            <input
              id="co-name"
              name="name"
              type="text"
              className="cko__box"
              autoComplete="name"
              required
              value={values.name}
              ref={hold('name')}
              aria-invalid={Boolean(errors.name)}
              aria-describedby={boundTo('name')}
              onChange={(e) => change('name', e.currentTarget.value)}
              onBlur={() => blur('name')}
            />
          </Cell>

          <Cell
            field="email"
            label="Email"
            hint="The receipt and any downloads go here."
            error={errors.email}
          >
            <input
              id="co-email"
              name="email"
              type="email"
              className="cko__box cko__box--mono"
              autoComplete="email"
              inputMode="email"
              required
              value={values.email}
              ref={hold('email')}
              aria-invalid={Boolean(errors.email)}
              aria-describedby={boundTo('email', true)}
              onChange={(e) => change('email', e.currentTarget.value)}
              onBlur={() => blur('email')}
            />
          </Cell>

          <Cell field="phone" label="Phone (optional)" error={errors.phone}>
            <input
              id="co-phone"
              name="phone"
              type="tel"
              className="cko__box cko__box--mono"
              autoComplete="tel"
              value={values.phone}
              ref={hold('phone')}
              aria-invalid={Boolean(errors.phone)}
              aria-describedby={boundTo('phone')}
              onChange={(e) => change('phone', e.currentTarget.value)}
              onBlur={() => blur('phone')}
            />
          </Cell>

          {/* The address is asked for only when something has to be posted,
              and the reason is on the page rather than assumed. */}
          {needsShipping ? (
            <Cell
              field="shippingLines"
              label="Delivery address"
              hint="We only ask because there is something to post."
              error={errors.shippingLines}
              className="cko__field--wide"
            >
              <textarea
                id="co-shippingLines"
                name="shippingLines"
                rows={4}
                className="cko__box cko__box--area"
                autoComplete="street-address"
                required
                value={values.shippingLines}
                ref={hold('shippingLines')}
                aria-invalid={Boolean(errors.shippingLines)}
                aria-describedby={boundTo('shippingLines', true)}
                onChange={(e) => change('shippingLines', e.currentTarget.value)}
                onBlur={() => blur('shippingLines')}
              />
            </Cell>
          ) : null}
        </div>

        {needsShipping && shippingNote ? (
          <p className="cko__ship-note">{shippingNote}</p>
        ) : null}

        {/* The basket, as ids and quantities. The server prices it again. */}
        <input type="hidden" name="cart" value={JSON.stringify(lines)} readOnly />
        <input
          type="hidden"
          name="needsShipping"
          value={needsShipping ? 'true' : 'false'}
          readOnly
        />

        {/* Spam gate. Invisible to a person, irresistible to a form filler. */}
        <div className="vh" aria-hidden="true">
          <label htmlFor="co-company">Company</label>
          <input
            id="co-company"
            name="company"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            defaultValue=""
          />
        </div>

        <div className="cko__foot">
          <button type="submit" className="btn btn--solid" disabled={pending}>
            {pending ? working : action}
          </button>
          <p className="cko__note">
            {checkoutNote ||
              (stripeReady
                ? 'Payment is taken on a page hosted by our payment provider. No card details reach this site.'
                : 'No card is taken here. We will be in touch to arrange payment.')}
          </p>
        </div>
      </form>

      {/* ------------------------- the summary ------------------------- */}

      <aside className="cko__sum" aria-labelledby="cko-sum-heading">
        <h2 id="cko-sum-heading" className="label cko__sum-head">
          Your order
        </h2>

        <p className="mono cko__sum-busy" role="status" aria-live="polite">
          {busy ? 'Updating…' : ''}
        </p>

        {cart ? (
          <>
            <ul className="cko__sum-lines">
              {cart.lines.map((line) => (
                <li
                  key={`${line.type}:${line.id}:${line.variant}`}
                  className="cko__sum-line"
                >
                  <span className="cko__sum-title">
                    {line.title}
                    {line.variant ? (
                      <span className="cko__sum-variant"> · {line.variant}</span>
                    ) : null}
                  </span>
                  <span className="mono cko__sum-qty">×{line.quantity}</span>
                  <span className="mono cko__sum-money">
                    {formatMoney(line.lineTotalCents, symbol)}
                  </span>
                </li>
              ))}
            </ul>

            <dl className="cko__sum-rows">
              <div className="cko__sum-row">
                <dt className="label">Subtotal</dt>
                <dd className="mono">{formatMoney(cart.subtotalCents, symbol)}</dd>
              </div>
              <div className="cko__sum-row">
                <dt className="label">Postage</dt>
                <dd className="mono">
                  {cart.hasPhysical
                    ? formatMoney(cart.shippingCents, symbol)
                    : 'No postage — all downloads'}
                </dd>
              </div>
              <div className="cko__sum-row cko__sum-row--total">
                <dt className="label">Total</dt>
                <dd className="mono cko__sum-total">
                  {formatMoney(cart.totalCents, symbol)}
                </dd>
              </div>
            </dl>
          </>
        ) : null}

        <Link href="/cart" className="btn btn--ghost cko__sum-back">
          Change the basket
        </Link>
      </aside>
    </div>
  )
}

/* --------------------------------------------------------------------------
   One labelled slot: mono label, hairline box, message beneath. The same
   shape the booking form uses, so a form is a form across the whole site.
   -------------------------------------------------------------------------- */

function Cell({
  field,
  label,
  hint,
  error,
  className,
  children,
}: {
  field: Field
  label: string
  hint?: string
  error?: string
  className?: string
  children: ReactNode
}) {
  return (
    <div className={['cko__field', className].filter(Boolean).join(' ')}>
      <label className="label cko__label" htmlFor={`co-${field}`}>
        {label}
      </label>

      {children}

      {hint ? (
        <p className="mono cko__hint" id={`co-${field}-hint`}>
          {hint}
        </p>
      ) : null}

      {error ? (
        <p className="cko__err" id={`co-${field}-err`}>
          {error}
        </p>
      ) : null}
    </div>
  )
}
