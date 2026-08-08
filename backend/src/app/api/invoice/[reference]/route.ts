import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db, orderItems, orders } from '@/db'
import { getSiteSettings } from '@/lib/data'
import { formatDateLong, formatMoney, orderStatusLabel } from '@/lib/format'
import {
  currencySymbol,
  getOrderByReference,
  orderStatusWord,
  paymentStatusWord,
  principalPayment,
} from '@/lib/orders/store'
import { getSession } from '@/lib/session'
import { serviceRoleAvailable } from '@/lib/supabase/config'
import { getCurrentUser } from '@/lib/supabase/server'
import { getStorePage } from '@/lib/store-data'

/* ==========================================================================
   /api/invoice/<reference> — the document a customer keeps.

   WHY HTML AND NOT A PDF LIBRARY
   A PDF library is 2–5 MB of dependency, a second layout engine to learn, its
   own font embedding and its own bugs — all to produce a page the browser can
   already produce perfectly. Every browser prints to PDF, honours @page and
   an @media print stylesheet, embeds the fonts, and gets the paper size right
   for the country it is running in. So this route returns one self-contained
   HTML document with a print stylesheet, and "Save as PDF" in the print dialog
   does the rest. No dependency, no build step, no server-side renderer to keep
   patched — and the customer can read it in a browser without downloading
   anything at all. If invoices ever need to be generated server-side and
   emailed as attachments, that is the day to reconsider, not before.

   IT IS BLACK ON WHITE, AND THAT IS DELIBERATE
   Everywhere else on this site the tokens in tokens.css are the only colours
   allowed. This is the one exception: it is not a page of the site, it is a
   document that goes through a printer, and the site's smoke-and-tungsten
   palette would print as a sheet of wet brown ink. A printed document is black
   on white. It carries no site chrome for the same reason.

   THE GUARD, AND WHY IT IS 404
   The order must belong to the signed-in customer, or the caller must be the
   admin. Anything else is 404 — never 403 — because a 403 confirms that the
   reference exists and belongs to somebody, which tells the person guessing
   references exactly what they came to find out. A missing order and somebody
   else's order are indistinguishable from outside.

   AN UNPAID ORDER IS NEVER HEADED "INVOICE"
   It is headed "Order confirmation" and says plainly that nothing has been
   paid. A document that calls itself an invoice for money that never moved is
   a document somebody can file, claim or reclaim against.
   ========================================================================== */

export const dynamic = 'force-dynamic'

/** No caching, and no indexing: this is one person's document. */
const HEADERS = {
  'cache-control': 'no-store, max-age=0',
  'x-robots-tag': 'noindex, nofollow',
}

type DocLine = {
  name: string
  variant: string
  quantity: number
  unitPrice: number
}

type Doc = {
  reference: string
  /** ISO date the order was placed. */
  placed: string
  paid: boolean
  statusText: string
  paymentText: string
  customerName: string
  email: string
  phone: string
  shippingLines: string
  lines: DocLine[]
  subtotal: number
  shipping: number
  total: number
  symbol: string
  /** The provider and its reference, when there is a payment on file. */
  paymentProvider: string
  paymentReference: string
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ reference: string }> },
) {
  const { reference } = await params

  // A reference is five characters of a fixed alphabet behind a prefix.
  // Anything else never reaches a query, and never reaches a header.
  if (!/^[A-Za-z0-9][A-Za-z0-9-]{1,31}$/.test(reference)) return missing()

  const admin = await callerIsAdmin()

  const doc = serviceRoleAvailable()
    ? await postgresDoc(reference, admin)
    : await sqliteDoc(reference, admin)

  if (!doc) return missing()

  const settings = await getSiteSettings()
  const label = settings.metaTitle || settings.logoText || 'Melophile Records'

  return new NextResponse(render(doc, label), {
    status: 200,
    headers: {
      ...HEADERS,
      'content-type': 'text/html; charset=utf-8',
      // inline, so it opens in the browser ready to print rather than landing
      // in a downloads folder as a file nobody looks at.
      'content-disposition': `inline; filename="melophile-${doc.reference.replace(/[^A-Za-z0-9-]/g, '')}.html"`,
    },
  })
}

/** One answer for every refusal, so nothing can be learned from the difference. */
function missing() {
  return new NextResponse('Not found', {
    status: 404,
    headers: { ...HEADERS, 'content-type': 'text/plain; charset=utf-8' },
  })
}

/**
 * The admin's own scrypt session, which is a separate system from customer
 * accounts on purpose. getSession throws when SESSION_SECRET is missing, and
 * an unconfigured secret means "not an admin" rather than a 500 on a customer's
 * invoice.
 */
async function callerIsAdmin(): Promise<boolean> {
  try {
    return (await getSession()) !== null
  } catch {
    return false
  }
}

/* --------------------------------------------------------------------------
   Loading, with the guard on the way out of each one
   -------------------------------------------------------------------------- */

async function postgresDoc(reference: string, admin: boolean): Promise<Doc | null> {
  const found = await getOrderByReference(reference)
  if (!found.ok) return null
  const order = found.order

  if (!admin) {
    const user = await getCurrentUser()
    // A guest order has no user_id and therefore no owner who can prove it is
    // theirs. Holding the reference is not proof — it is printed on an email
    // anybody could be forwarded — so only the admin can pull that document.
    if (!user || !order.user_id || order.user_id !== user.id) return null
  }

  const payment = principalPayment(order.payments)

  return {
    reference: order.reference,
    placed: order.created_at.slice(0, 10),
    paid: order.payment_status === 'paid',
    statusText: orderStatusWord(order.order_status),
    paymentText: paymentStatusWord(order.payment_status),
    customerName: order.customer_name,
    email: order.email,
    phone: order.phone,
    shippingLines: order.shipping_address,
    lines: order.items.map((item) => ({
      name: item.product_name,
      variant: item.variant_label,
      quantity: item.quantity,
      unitPrice: item.unit_price,
    })),
    subtotal: order.subtotal_amount,
    shipping: order.shipping_amount,
    total: order.total_amount,
    symbol: currencySymbol(order.currency),
    paymentProvider: payment?.payment_provider ?? '',
    paymentReference: payment?.transaction_id ?? '',
  }
}

/**
 * SQLite — the store used when Supabase is switched off.
 *
 * An order here has no customer account attached to it, because there are no
 * customer accounts on this deployment. There is therefore nobody who can
 * prove an order is theirs, so the document is the admin's alone. Switching
 * Supabase on is what gives customers their own invoices.
 */
async function sqliteDoc(reference: string, admin: boolean): Promise<Doc | null> {
  if (!admin) return null

  const order = await db
    .select()
    .from(orders)
    .where(eq(orders.reference, reference))
    .get()
  if (!order) return null

  const [items, page] = await Promise.all([
    db.select().from(orderItems).where(eq(orderItems.orderId, order.id)).all(),
    getStorePage(),
  ])

  const paid = order.status === 'paid'

  return {
    reference: order.reference,
    placed: isoDate(order.createdAt),
    paid,
    statusText: orderStatusLabel(order.status),
    paymentText: paid ? 'Paid' : 'Unpaid',
    customerName: order.name,
    email: order.email,
    phone: order.phone,
    shippingLines: order.shippingLines,
    lines: items.map((item) => ({
      name: item.titleSnapshot,
      variant: item.variantLabel,
      quantity: item.quantity,
      unitPrice: item.unitPriceCents,
    })),
    subtotal: order.subtotalCents,
    shipping: order.shippingCents,
    total: order.totalCents,
    symbol: page.currencySymbol,
    paymentProvider: order.paymentProvider === 'stripe' ? 'stripe' : '',
    paymentReference: order.stripeSessionId,
  }
}

/** A Date to '2026-07-27', without going through a locale. */
function isoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`
}

/* --------------------------------------------------------------------------
   The document
   -------------------------------------------------------------------------- */

/** Everything interpolated below goes through this. Customer text is text. */
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** A typed address keeps its line breaks and gains nothing else. */
function lines(value: string): string {
  return esc(value)
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .join('<br />')
}

function render(doc: Doc, label: string): string {
  const money = (cents: number) => esc(formatMoney(cents, doc.symbol))
  const title = doc.paid ? 'Invoice' : 'Order confirmation'

  const rows = doc.lines
    .map(
      (line) => `      <tr>
        <td>${esc(line.name)}${line.variant ? `<span class="variant"> — ${esc(line.variant)}</span>` : ''}</td>
        <td class="n">${line.quantity}</td>
        <td class="n">${money(line.unitPrice)}</td>
        <td class="n">${money(line.unitPrice * line.quantity)}</td>
      </tr>`,
    )
    .join('\n')

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>${esc(title)} ${esc(doc.reference)} — ${esc(label)}</title>
<style>
  /* A printed document, not a page of the site: black on white, one system
     font stack so it needs nothing from the network, and 12pt because that is
     what a printer is for. The site's palette is deliberately absent. */
  @page { margin: 18mm 16mm; }

  * { box-sizing: border-box; }

  body {
    margin: 0 auto;
    padding: 24px 20px 48px;
    max-width: 760px;
    background: #fff;
    color: #000;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
    font-size: 12pt;
    line-height: 1.5;
  }

  h1 { margin: 0; font-size: 18pt; letter-spacing: 0.02em; }
  h2 { margin: 28px 0 8px; font-size: 11pt; text-transform: uppercase; letter-spacing: 0.12em; }
  p  { margin: 0 0 4px; }

  .head {
    display: flex;
    justify-content: space-between;
    gap: 24px;
    flex-wrap: wrap;
    padding-bottom: 12px;
    border-bottom: 1px solid #000;
  }
  .head__label { font-size: 13pt; font-weight: 700; letter-spacing: 0.06em; }
  .head__meta { text-align: right; font-size: 10.5pt; }

  .ref { font-family: ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace; letter-spacing: 0.08em; }

  .cols { display: flex; gap: 40px; flex-wrap: wrap; margin-top: 20px; }
  .col { flex: 1 1 220px; min-width: 0; }

  .unpaid {
    margin-top: 20px;
    padding: 10px 14px;
    border: 1px solid #000;
    font-size: 10.5pt;
  }

  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th, td { padding: 8px 6px; text-align: left; vertical-align: top; border-bottom: 1px solid #999; }
  th { font-size: 9.5pt; text-transform: uppercase; letter-spacing: 0.1em; border-bottom-color: #000; }
  td.n, th.n { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .variant { color: #444; }

  .sums { margin-left: auto; width: 260px; margin-top: 10px; }
  .sums tr td { border: 0; padding: 4px 6px; }
  .sums tr.total td { border-top: 1px solid #000; font-weight: 700; padding-top: 8px; }

  .foot { margin-top: 32px; padding-top: 10px; border-top: 1px solid #999; font-size: 9.5pt; color: #333; }

  /* The one thing on the page that is not part of the document. */
  .hint { margin-bottom: 20px; padding: 8px 12px; border: 1px dashed #666; font-size: 10pt; }
  @media print { .hint { display: none; } body { padding: 0; } }
</style>
</head>
<body>

<p class="hint">Print this page and choose “Save as PDF” to keep a copy.</p>

<header class="head">
  <div>
    <p class="head__label">${esc(label)}</p>
    <p>${esc(title)}</p>
  </div>
  <div class="head__meta">
    <p class="ref">${esc(doc.reference)}</p>
    <p>${esc(formatDateLong(doc.placed))}</p>
  </div>
</header>

<h1>${esc(title)}</h1>

${
  doc.paid
    ? ''
    : `<div class="unpaid">
  <strong>This is not a receipt.</strong> Nothing has been paid on this order yet, so it
  is a confirmation of what was ordered rather than an invoice for money received.
</div>`
}

<div class="cols">
  <div class="col">
    <h2>Billed to</h2>
    <p>${esc(doc.customerName)}</p>
    <p>${esc(doc.email)}</p>
    ${doc.phone ? `<p>${esc(doc.phone)}</p>` : ''}
  </div>

  ${
    doc.shippingLines
      ? `<div class="col">
    <h2>Posting to</h2>
    <p>${lines(doc.shippingLines)}</p>
  </div>`
      : ''
  }

  <div class="col">
    <h2>Status</h2>
    <p>Payment: ${esc(doc.paymentText)}</p>
    <p>Order: ${esc(doc.statusText)}</p>
    ${doc.paymentProvider ? `<p>Taken by ${esc(doc.paymentProvider)}</p>` : ''}
    ${doc.paymentReference ? `<p class="ref">${esc(doc.paymentReference)}</p>` : ''}
  </div>
</div>

<h2>Items</h2>

<table>
  <thead>
    <tr>
      <th>Item</th>
      <th class="n">Qty</th>
      <th class="n">Unit</th>
      <th class="n">Total</th>
    </tr>
  </thead>
  <tbody>
${rows}
  </tbody>
</table>

<table class="sums">
  <tbody>
    <tr><td>Subtotal</td><td class="n">${money(doc.subtotal)}</td></tr>
    ${doc.shipping > 0 ? `<tr><td>Postage</td><td class="n">${money(doc.shipping)}</td></tr>` : ''}
    <tr class="total"><td>Total</td><td class="n">${money(doc.total)}</td></tr>
  </tbody>
</table>

<p class="foot">
  ${esc(label)} · Order <span class="ref">${esc(doc.reference)}</span> ·
  ${esc(formatDateLong(doc.placed))}. Keep the reference — it is how we find this order.
</p>

</body>
</html>
`
}
