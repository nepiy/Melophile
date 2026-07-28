import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AddressBook } from '@/components/account/AddressBook'
import { getAccount, getAddresses } from '@/lib/account/queries'
import { accountsEnabled } from '@/lib/supabase/config'

/* ==========================================================================
   /account/addresses

   The list is read on the server and handed to the book as data. Every write
   goes back through a server action which revalidates this path, so the list
   below a form is always the database's answer and never the browser's guess
   about what the database now contains.
   ========================================================================== */

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Addresses',
  robots: { index: false, follow: false },
}

export default async function AccountAddressesPage() {
  if (!accountsEnabled()) return null

  const account = await getAccount()
  if (!account) redirect('/login?next=/account/addresses')

  const { user } = account
  const addresses = await getAddresses(user.id)
  const blocked = user.status === 'suspended' || user.status === 'banned'

  return (
    <section className="ac-panel">
      <div className="ac-panel__strip" aria-hidden="true">
        <span className="mono ac-panel__chan">01</span>
        <span className="ac-panel__rule" />
        <span className="label ac-panel__strip-label">Addresses</span>
      </div>

      <h2 className="ac-panel__title">Where things go</h2>
      <p className="ac-panel__text">
        Keep as many as you like. The default one is filled in at checkout, and you can
        pick another when you get there.
      </p>

      {blocked ? (
        <>
          {addresses.length === 0 ? (
            <p className="ac-panel__foot">There are no addresses on this account.</p>
          ) : (
            <ul className="ac-cards">
              {addresses.map((address) => {
                const region = [address.city, address.state].filter(Boolean).join(', ')
                return (
                  <li key={address.id} className="ac-card">
                    <div className="ac-card__top">
                      <p className="label ac-card__label">{address.label || 'Address'}</p>
                      {address.is_default ? (
                        <span className="label ac-chip" data-tone="lamp">
                          Default
                        </span>
                      ) : null}
                    </div>
                    <div className="ac-card__lines">
                      {address.recipient ? <p>{address.recipient}</p> : null}
                      <p>{address.street_address}</p>
                      {region ? <p>{region}</p> : null}
                      <p>{address.postal_code}</p>
                      <p>{address.country}</p>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}

          <p className="ac-panel__foot">
            Addresses cannot be changed while the account is{' '}
            {user.status === 'banned' ? 'closed' : 'suspended'}.{' '}
            <Link className="link" href="/contact">
              Write to us
            </Link>{' '}
            and we will look at it.
          </p>
        </>
      ) : (
        <AddressBook addresses={addresses} />
      )}
    </section>
  )
}
