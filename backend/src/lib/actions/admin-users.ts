'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { isUuid } from '@/lib/admin-users-queries'
import { requireAdmin } from '@/lib/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { accountsSetupHint, serviceRoleAvailable } from '@/lib/supabase/config'
import type { AccountStatus, ActivityType } from '@/lib/supabase/types'

/* ==========================================================================
   Staff actions on a customer account.

   requireAdmin() first, every one, no exceptions. These are server actions:
   they are reachable as a POST by anything that can guess a route, and the
   only thing standing between that POST and somebody's account is the line at
   the top of each function.

   THE ADMIN'S LOGIN IS NOT SUPABASE AUTH, AND IS NOT AFFECTED BY ANY OF THIS.
   requireAdmin() reads the scrypt session in SQLite. Supabase Auth is the
   customers' login and nothing else — suspending one has no bearing on who can
   open this screen.

   WHAT SUSPENDING ACTUALLY DOES
   Nothing here signs anybody out or touches a password. A suspended or banned
   account still authenticates against Supabase — the block is ours, applied
   after the token exists, in src/lib/actions/account-auth.ts and in the auth
   callback. That is deliberate and it is not duplicated here; this file writes
   the status those checks read, and the wording on the screen says exactly
   that rather than promising a lock this code does not own.

   REVALIDATION IS NARROW. A customer appears nowhere on the public site, so
   there is no public page to drop — dropping the content tags for a status
   change would throw away the whole cached site to redraw one admin row.
   ========================================================================== */

export type StaffState = {
  error?: string
  saved?: boolean
  /** What was done, for the save bar. "Changes saved." is the default. */
  message?: string
}

const GONE = 'That customer is no longer here. They may have been deleted in another tab.'

const UNIDENTIFIED =
  'That customer could not be identified. Open them again from the list.'

/** Longest reason kept. Generous — it is a reason, not a case file. */
const MAX_REASON = 2000

/**
 * The three states an admin can put an account into.
 *
 * 'deleted' is in the AccountStatus union and is deliberately not here: it is
 * what a row becomes on its way out, not something to be set from a button.
 */
const STAFF_STATUSES = ['active', 'suspended', 'banned'] as const

type StaffStatus = (typeof STAFF_STATUSES)[number]

function isStaffStatus(value: string): value is StaffStatus {
  return (STAFF_STATUSES as readonly string[]).includes(value)
}

/** Every status change writes its own line on the trail. A full Record, so
 *  adding a status above without a matching activity type breaks the build. */
const ACTIVITY: Record<StaffStatus, ActivityType> = {
  active: 'reinstated_by_admin',
  suspended: 'suspended_by_admin',
  banned: 'banned_by_admin',
}

const SAID: Record<StaffStatus, string> = {
  active: 'Account reinstated. They can sign in again.',
  suspended: 'Account suspended. They cannot sign in.',
  banned: 'Account closed. They cannot sign in.',
}

function offline(): StaffState {
  return {
    error:
      accountsSetupHint() ||
      'Customer accounts are switched off because Supabase is not configured. Nothing was changed.',
  }
}

/** Whatever PostgREST said, as one sentence a person could be shown. */
function reason(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = String((error as { message: unknown }).message).trim()
    if (message) return message
  }
  return fallback
}

/** The screens a customer is drawn on. The dashboard counts them, so it goes too. */
function refresh(userId?: string): void {
  revalidatePath('/admin/users')
  if (userId) revalidatePath(`/admin/users/${userId}`)
  revalidatePath('/admin')
}

/* -------------------------------- status --------------------------------- */

/**
 * Suspend, ban or reinstate, with the reason kept on the row.
 *
 * The status is checked against the three names above before it reaches a
 * query. The column is a Postgres enum and would reject a bad value anyway,
 * but a rejected write surfaces as a 500 rather than as a sentence, and 'admin'
 * or 'deleted' arriving here should be refused by this code rather than by
 * luck.
 *
 * The reason is required. An account nobody can explain the state of is an
 * account somebody will quietly reinstate in six months.
 */
export async function setUserStatus(
  userId: string,
  status: string,
  note: string,
): Promise<StaffState> {
  await requireAdmin()

  if (!serviceRoleAvailable()) return offline()
  if (!isUuid(userId)) return { error: UNIDENTIFIED }
  if (!isStaffStatus(status)) {
    return { error: 'That is not a state an account can be put into.' }
  }

  const because = note.trim().slice(0, MAX_REASON)
  if (!because) {
    return {
      error:
        'Write a reason first. It is kept on the account and is the only record of why this was done.',
    }
  }

  try {
    const admin = createAdminClient()

    const { data, error } = await admin
      .from('users')
      .update({
        status: status satisfies AccountStatus,
        status_reason: because,
        status_changed_at: new Date().toISOString(),
      })
      .eq('id', userId)
      .select('id')
      .maybeSingle()

    if (error) return { error: reason(error, 'The account was not changed.') }
    if (!data) return { error: GONE }

    // The trail is append-only by design — there is no update or delete policy
    // on it for anyone, including us. A failure to write the line must not undo
    // the change it was describing, so it is not checked.
    await admin.from('account_activity').insert({
      user_id: userId,
      activity_type: ACTIVITY[status],
      metadata: { reason: because, by: 'staff' },
    })

    refresh(userId)
    return { saved: true, message: SAID[status] }
  } catch (error) {
    return { error: reason(error, 'The account was not changed.') }
  }
}

/* --------------------------------- note ---------------------------------- */

/**
 * The staff note on an account.
 *
 * It lives in users.status_reason, which is the column the schema already has
 * for "why is this account like this". Inventing a second column for a note
 * would put two half-answers next to each other and leave the migration out of
 * step with the file that describes it.
 */
export async function saveUserNote(userId: string, note: string): Promise<StaffState> {
  await requireAdmin()

  if (!serviceRoleAvailable()) return offline()
  if (!isUuid(userId)) return { error: UNIDENTIFIED }

  try {
    const admin = createAdminClient()

    const { data, error } = await admin
      .from('users')
      .update({ status_reason: note.trim().slice(0, MAX_REASON) })
      .eq('id', userId)
      .select('id')
      .maybeSingle()

    if (error) return { error: reason(error, 'The note was not saved.') }
    if (!data) return { error: GONE }

    refresh(userId)
    return { saved: true, message: 'Changes saved.' }
  } catch (error) {
    return { error: reason(error, 'The note was not saved.') }
  }
}

/* ------------------------------ the one form ------------------------------ */

/**
 * What the staff panel posts. One form, four buttons, one `intent`.
 *
 * A form can carry the value of the button that submitted it, so the reason
 * field is shared by all four without any of them needing their own copy of
 * it — and the whole panel works with scripting off.
 */
export async function staffAction(
  _previous: StaffState,
  formData: FormData,
): Promise<StaffState> {
  await requireAdmin()

  const userId = String(formData.get('userId') ?? '').trim()
  const note = String(formData.get('reason') ?? '')

  switch (String(formData.get('intent') ?? '')) {
    case 'note':
      return saveUserNote(userId, note)
    case 'suspend':
      return setUserStatus(userId, 'suspended', note)
    case 'ban':
      return setUserStatus(userId, 'banned', note)
    case 'reinstate':
      return setUserStatus(userId, 'active', note)
    default:
      return { error: 'Nothing was done — that button posted no action.' }
  }
}

/* -------------------------------- delete --------------------------------- */

/**
 * Deletes the account. Bound with the id: deleteUser.bind(null, id).
 *
 * ORDERS ARE NULLED FIRST, AND THAT ORDER MATTERS.
 * `orders.user_id` is ON DELETE SET NULL, so Postgres would do this anyway —
 * doing it explicitly first means that if the auth delete then fails, the
 * financial record has still been detached rather than left pointing at a row
 * that is about to go. Every order stays, with its reference, its lines, its
 * total and the email it was placed with. What it loses is the link to a
 * person.
 *
 * Deleting the auth user cascades to public.users, and from there to profiles,
 * addresses and the activity trail. There is no archive and no undo.
 */
export async function deleteUser(userId: string): Promise<void> {
  await requireAdmin()

  if (serviceRoleAvailable() && isUuid(userId)) {
    try {
      const admin = createAdminClient()

      // Checked, and the delete does not go ahead without it. The foreign key
      // is ON DELETE SET NULL so the orders would survive either way, but a
      // destructive step that carries on past a refused write is how a half
      // deletion happens.
      const { error } = await admin
        .from('orders')
        .update({ user_id: null })
        .eq('user_id', userId)

      if (!error) {
        await admin.auth.admin.deleteUser(userId)
        refresh(userId)
      }
    } catch {
      // Nothing to say to a form post that has already left the screen. The
      // list is where the client will find out, and it will still show the
      // account if the delete did not take.
    }
  }

  redirect('/admin/users')
}
