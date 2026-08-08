import { eq } from 'drizzle-orm'
import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { AdminShell } from '@/components/admin/AdminShell'
import { LoginForm } from '@/components/admin/LoginForm'
import { bookings, db } from '@/db'
import { getSession } from '@/lib/session'

import '@/styles/admin.css'

/* ==========================================================================
   The admin guard, and the only one. Every /admin/* route is a child of this
   layout, so nothing below it renders without a session.

   WHY THIS DOES NOT REDIRECT
   --------------------------
   The obvious version is `await requireAdmin()` here. It redirect-loops:
   /admin/login is itself a child of this layout, so a signed-out visitor gets
   layout → redirect('/admin/login') → layout → redirect('/admin/login') …
   for ever, and the admin becomes unreachable rather than merely locked.

   The usual escape — a route group with its own root layout — is not
   available: src/app/layout.tsx is the root for the whole app and route
   groups do not opt out of a parent layout. Moving the login route out of
   /admin would break requireAdmin()'s redirect target, which every server
   action relies on.

   So the gate does not redirect at all. With no session this layout renders
   the sign-in screen INSTEAD of `children`. Consequences, all of them wanted:

     · `children` is never included in the returned tree, so the requested
       page component is never invoked and no protected data is read
     · nothing redirects, so no loop is possible at any URL, including
       /admin/login and including requireAdmin()'s own redirect target
     · the requested path stays in the address bar; LoginForm posts it back as
       `next`, so signing in from a deep link lands where you were going

   requireAdmin() is still called by every page and every action underneath,
   which is what makes the guard defence in depth rather than a single point.
   ========================================================================== */

export const metadata: Metadata = {
  title: 'Admin',
  robots: { index: false, follow: false },
}

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await getSession()

  if (!session) return <LoginForm />

  // The one number the shell needs. Small table, exact count, always live —
  // an admin badge that lags is worse than no badge.
  const waiting = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(eq(bookings.status, 'new'))
    .all()

  return (
    <AdminShell
      email={session.user.email}
      newBookings={waiting.length}
      mustChangePassword={session.user.mustChangePassword}
    >
      {children}
    </AdminShell>
  )
}
