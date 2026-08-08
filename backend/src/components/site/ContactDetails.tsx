import type { ContactRow } from '@/db'
import { safeUrl } from '@/lib/markdown'

/* ==========================================================================
   Contact details, read from the single `contact` row.

   Home section 4 and /contact both render this, so the studio phone number
   exists in exactly one place — change it in the admin and it changes in both.

   Every field is optional. A field the client has left blank is not rendered
   at all: no label with nothing under it, no empty dash.
   ========================================================================== */

export function ContactDetails({
  contact,
  /** Home shows a tighter set; /contact shows everything. */
  variant = 'full',
}: {
  contact: ContactRow
  variant?: 'full' | 'compact'
}) {
  const addressLines = contact.addressLines
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  const hoursLines = contact.hours
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  const emails = contact.emails.filter((e) => e.address.trim())
  const socials = contact.socialLinks.filter((s) => safeUrl(s.url) !== null)

  const blocks: { key: string; label: string; content: React.ReactNode }[] = []

  if (addressLines.length > 0) {
    blocks.push({
      key: 'address',
      label: 'Address',
      content: (
        <address className="cd__address">
          {addressLines.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </address>
      ),
    })
  }

  if (emails.length > 0) {
    blocks.push({
      key: 'email',
      label: emails.length > 1 ? 'Email' : 'Email',
      content: (
        <ul className="cd__list">
          {emails.map((email) => (
            <li key={email.address}>
              {email.label ? <span className="cd__sub label">{email.label}</span> : null}
              <a className="link cd__value" href={`mailto:${email.address}`}>
                {email.address}
              </a>
            </li>
          ))}
        </ul>
      ),
    })
  }

  if (contact.phone.trim()) {
    blocks.push({
      key: 'phone',
      label: 'Phone',
      content: (
        <a
          className="link cd__value"
          href={`tel:${contact.phone.replace(/[^\d+]/g, '')}`}
        >
          {contact.phone}
        </a>
      ),
    })
  }

  if (variant === 'full' && hoursLines.length > 0) {
    blocks.push({
      key: 'hours',
      label: 'Hours',
      content: (
        <p className="cd__plain">
          {hoursLines.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </p>
      ),
    })
  }

  if (socials.length > 0) {
    blocks.push({
      key: 'social',
      label: 'Elsewhere',
      content: (
        <ul className="cd__list cd__list--inline">
          {socials.map((social) => (
            <li key={`${social.platform}-${social.url}`}>
              <a
                className="link cd__value"
                href={safeUrl(social.url) ?? '#'}
                target="_blank"
                rel="noopener noreferrer"
              >
                {social.platform}
              </a>
            </li>
          ))}
        </ul>
      ),
    })
  }

  // Everything blank is a real state on a brand-new site, and it should read as
  // an invitation rather than as a broken page.
  if (blocks.length === 0) {
    return (
      <div className="empty">
        <p className="empty__title">No contact details yet</p>
        <p className="empty__text">
          Add an address, an email and a phone number in the admin and they will appear
          here and on the contact page.
        </p>
      </div>
    )
  }

  return (
    <dl className="cd">
      {blocks.map((block) => (
        <div key={block.key} className="cd__block">
          <dt className="label cd__label">{block.label}</dt>
          <dd className="cd__body">{block.content}</dd>
        </div>
      ))}
    </dl>
  )
}
