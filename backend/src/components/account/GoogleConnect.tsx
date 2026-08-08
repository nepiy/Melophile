'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

/** Adds Google as an additional Supabase identity without replacing the
 * customer's email/password login. */
export function GoogleConnect({ connected }: { connected: boolean }) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function connect() {
    setBusy(true)
    setError('')
    const { error: linkError } = await createClient().auth.linkIdentity({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/account/settings` },
    })
    if (linkError) {
      setError(linkError.message)
      setBusy(false)
    }
  }

  if (connected)
    return <p className="ac-panel__text">Google is connected to this account.</p>
  return (
    <div className="ac-actions">
      <button
        type="button"
        className="btn btn--ghost btn--sm"
        onClick={connect}
        disabled={busy}
      >
        {busy ? 'Opening Google…' : 'Connect Google'}
      </button>
      {error ? (
        <p className="au-err" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
