import type { PricedCart } from '@/lib/cart'

/* ==========================================================================
   Payments.

   Stripe Checkout, and nothing else touches money. The customer is sent to a
   page hosted by Stripe, so no card number ever reaches this server, this
   database, or these logs — which is the whole reason for choosing the hosted
   flow over a card form.

   It is written to work UNCONFIGURED. With no STRIPE_SECRET_KEY the order is
   still created and still lands in the admin; the customer is told plainly
   that payment will be arranged directly rather than being shown a broken
   checkout. Same contract as the booking notifications: never lose the record,
   never claim something happened that did not.

   No SDK dependency — Stripe's REST API is form-encoded and this is one call.
   ========================================================================== */

export type CheckoutSession =
  | { ok: true; url: string; sessionId: string }
  | { ok: false; error: string; configured: boolean }

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim())
}

/** Stripe rejects zero-amount lines, and a free order needs no payment page. */
export function needsPayment(cart: PricedCart): boolean {
  return cart.totalCents > 0
}

type CreateArgs = {
  cart: PricedCart
  reference: string
  email: string
  successUrl: string
  cancelUrl: string
}

export async function createCheckoutSession({
  cart,
  reference,
  email,
  successUrl,
  cancelUrl,
}: CreateArgs): Promise<CheckoutSession> {
  const key = process.env.STRIPE_SECRET_KEY?.trim()
  if (!key) {
    return {
      ok: false,
      configured: false,
      error:
        'No payment provider is configured, so this order was recorded and we will arrange payment with you directly.',
    }
  }

  // Stripe's API is application/x-www-form-urlencoded with bracketed keys.
  const form = new URLSearchParams()
  form.set('mode', 'payment')
  form.set('success_url', successUrl)
  form.set('cancel_url', cancelUrl)
  form.set('customer_email', email)
  form.set('client_reference_id', reference)
  form.set('metadata[reference]', reference)

  let index = 0
  for (const line of cart.lines) {
    if (line.quantity <= 0) continue
    const p = `line_items[${index}]`
    form.set(`${p}[quantity]`, String(line.quantity))
    form.set(`${p}[price_data][currency]`, cart.currency.toLowerCase())
    form.set(`${p}[price_data][unit_amount]`, String(line.unitPriceCents))
    form.set(
      `${p}[price_data][product_data][name]`,
      line.variant ? `${line.title} (${line.variant})` : line.title,
    )
    if (line.subtitle) {
      form.set(`${p}[price_data][product_data][description]`, line.subtitle.slice(0, 300))
    }
    index++
  }

  if (index === 0) {
    return { ok: false, configured: true, error: 'There is nothing to pay for.' }
  }

  if (cart.shippingCents > 0) {
    const p = `line_items[${index}]`
    form.set(`${p}[quantity]`, '1')
    form.set(`${p}[price_data][currency]`, cart.currency.toLowerCase())
    form.set(`${p}[price_data][unit_amount]`, String(cart.shippingCents))
    form.set(`${p}[price_data][product_data][name]`, 'Shipping')
  }

  try {
    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        // Without this, a retried submit can create a second charge.
        'Idempotency-Key': `order-${reference}`,
      },
      body: form.toString(),
      signal: AbortSignal.timeout(15_000),
    })

    const payload = (await response.json()) as {
      id?: string
      url?: string
      error?: { message?: string }
    }

    if (!response.ok || !payload.url || !payload.id) {
      return {
        ok: false,
        configured: true,
        error:
          payload.error?.message ??
          `The payment provider returned ${response.status}. Your order was recorded.`,
      }
    }

    return { ok: true, url: payload.url, sessionId: payload.id }
  } catch (error) {
    return {
      ok: false,
      configured: true,
      error: error instanceof Error ? error.message : 'Could not reach the payment provider.',
    }
  }
}

/** Confirms a session really is paid. Never trust the browser's return URL. */
export async function verifySessionPaid(sessionId: string): Promise<boolean> {
  const key = process.env.STRIPE_SECRET_KEY?.trim()
  if (!key || !sessionId) return false
  try {
    const response = await fetch(
      `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
      {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(10_000),
      },
    )
    if (!response.ok) return false
    const payload = (await response.json()) as { payment_status?: string }
    return payload.payment_status === 'paid'
  } catch {
    return false
  }
}
