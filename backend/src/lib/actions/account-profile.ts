'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { logActivity, usernameAvailable } from '@/lib/account/queries'
import { clientIp } from '@/lib/ratelimit'
import { createAdminClient } from '@/lib/supabase/admin'
import { accountsEnabled, serviceRoleAvailable } from '@/lib/supabase/config'
import { createServerSupabase } from '@/lib/supabase/server'
import {
  addressSchema,
  deleteAccountSchema,
  profileSchema,
  toFieldErrors,
  type FieldErrors,
} from '@/lib/validation'

/* ==========================================================================
   Profile, addresses, avatar, account deletion.

   Every write here goes through the USER's own Supabase client, so row level
   security is the backstop: a mistake in a `where` clause cannot reach another
   customer's row, because Postgres refuses it. The service role appears only
   where a customer genuinely cannot act for themselves — writing the audit
   trail, and deleting the auth record at the end.
   ========================================================================== */

export type ProfileState = {
  fieldErrors?: FieldErrors
  formError?: string
  notice?: string
  ok?: boolean
}

const NOT_CONFIGURED = 'Customer accounts are not switched on yet.'
const ACCOUNT_SCHEMA_MISSING =
  'Account storage has not been installed yet. The site owner needs to run supabase/migrations/0001_accounts_and_orders.sql and supabase/migrations/0002_profile_identity.sql in the Supabase SQL Editor, then try again.'

function accountStorageMessage(message: string): string {
  return /Could not find the table ['"]public\.(users|profiles|addresses)['"]|PGRST205/i.test(
    message,
  )
    ? ACCOUNT_SCHEMA_MISSING
    : message
}

async function requestContext() {
  const h = await headers()
  return { ip: await clientIp(), userAgent: h.get('user-agent')?.slice(0, 300) ?? '' }
}

async function requireUser() {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return { supabase, user }
}

/* ------------------------------- profile -------------------------------- */

export async function saveProfile(
  _prev: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  if (!accountsEnabled()) return { formError: NOT_CONFIGURED }

  const parsed = profileSchema.safeParse({
    fullName: formData.get('fullName'),
    username: formData.get('username'),
    phoneNumber: formData.get('phoneNumber') ?? '',
    phoneCountryCode: formData.get('phoneCountryCode') ?? '+1',
    dateOfBirth: formData.get('dateOfBirth') ?? '',
    gender: formData.get('gender') ?? '',
    genderSelfDescribed: formData.get('genderSelfDescribed') ?? '',
    bio: formData.get('bio') ?? '',
    marketingOptIn: formData.get('marketingOptIn') === 'on',
  })
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

  const { supabase, user } = await requireUser()
  if (!user) return { formError: 'You are not signed in.' }

  const v = parsed.data

  // Checked before writing so the customer gets a field error rather than a
  // constraint violation. The unique index is still the real guard.
  // A service-role key is useful for the friendly pre-flight message, but it
  // must never be a requirement for saving a profile. Without it Postgres's
  // unique index remains the authority and the update below reports a clash.
  if (serviceRoleAvailable() && !(await usernameAvailable(v.username, user.id))) {
    return { fieldErrors: { username: 'That username is taken. Try another.' } }
  }

  const { error: userError } = await supabase
    .from('users')
    .update({ username: v.username })
    .eq('id', user.id)
  if (userError) {
    return /duplicate|unique/i.test(userError.message)
      ? { fieldErrors: { username: 'That username is taken. Try another.' } }
      : { formError: accountStorageMessage(userError.message) }
  }

  const profileUpdate = {
    full_name: v.fullName,
    phone_number: v.phoneNumber,
    phone_country_code: v.phoneCountryCode,
    date_of_birth: v.dateOfBirth === '' ? null : v.dateOfBirth,
    gender: v.gender === '' ? null : v.gender,
    gender_self_described: v.gender === 'self_described' ? v.genderSelfDescribed : '',
    bio: v.bio,
    marketing_opt_in: v.marketingOptIn,
  }

  let { error } = await supabase
    .from('profiles')
    .upsert({ user_id: user.id, ...profileUpdate }, { onConflict: 'user_id' })

  // Sites upgraded before the profile-identity migration can still save the
  // existing profile fields. Country code becomes persistent as soon as the
  // migration has run, instead of making every profile save fail meanwhile.
  if (error && /phone_country_code/i.test(error.message)) {
    const { phone_country_code: _countryCode, ...legacyUpdate } = profileUpdate
    const retry = await supabase
      .from('profiles')
      .upsert({ user_id: user.id, ...legacyUpdate }, { onConflict: 'user_id' })
    error = retry.error
  }

  if (error) return { formError: accountStorageMessage(error.message) }

  await logActivity(user.id, 'profile_updated', {}, await requestContext())
  revalidatePath('/account')
  return { ok: true, notice: 'Changes saved.' }
}

/* -------------------------------- avatar -------------------------------- */

const AVATAR_MAX_BYTES = 4 * 1024 * 1024
const AVATAR_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif'])

export async function uploadAvatar(
  _prev: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  if (!accountsEnabled()) return { formError: NOT_CONFIGURED }

  const { supabase, user } = await requireUser()
  if (!user) return { formError: 'You are not signed in.' }

  const file = formData.get('avatar')
  if (!(file instanceof File) || file.size === 0) {
    return { fieldErrors: { avatar: 'Choose an image first.' } }
  }
  if (file.size > AVATAR_MAX_BYTES) {
    return {
      fieldErrors: {
        avatar: `That image is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 4 MB — export it smaller and try again.`,
      },
    }
  }
  if (!AVATAR_TYPES.has(file.type)) {
    return {
      fieldErrors: {
        avatar: `${file.type || 'That file'} is not an image this site can use. Use a JPEG, PNG, WebP or AVIF.`,
      },
    }
  }

  // The path starts with the user's id, which is exactly what the storage
  // policy checks — a customer can only ever write inside their own folder.
  const extension = file.type.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg'
  const path = `${user.id}/avatar-${Date.now()}.${extension}`

  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type })

  if (uploadError) return { fieldErrors: { avatar: uploadError.message } }

  const { data: existing } = await supabase
    .from('profiles')
    .select('profile_picture')
    .eq('user_id', user.id)
    .maybeSingle()

  const { error } = await supabase
    .from('profiles')
    .update({ profile_picture: path })
    .eq('user_id', user.id)

  if (error) {
    await supabase.storage.from('avatars').remove([path])
    return { formError: error.message }
  }

  // Only remove the old file once the row points at the new one, so a failure
  // never leaves a profile pointing at something that is gone.
  const previous = existing?.profile_picture
  if (previous && !previous.startsWith('http')) {
    await supabase.storage.from('avatars').remove([previous])
  }

  await logActivity(user.id, 'avatar_updated', {}, await requestContext())
  revalidatePath('/account')
  return { ok: true, notice: 'Picture updated.' }
}

export async function removeAvatar(): Promise<void> {
  if (!accountsEnabled()) return
  const { supabase, user } = await requireUser()
  if (!user) return

  const { data } = await supabase
    .from('profiles')
    .select('profile_picture')
    .eq('user_id', user.id)
    .maybeSingle()

  await supabase.from('profiles').update({ profile_picture: '' }).eq('user_id', user.id)

  const path = data?.profile_picture
  if (path && !path.startsWith('http')) {
    await supabase.storage.from('avatars').remove([path])
  }

  revalidatePath('/account')
}

/* ------------------------------- addresses ------------------------------ */

export async function saveAddress(
  _prev: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  if (!accountsEnabled()) return { formError: NOT_CONFIGURED }

  const parsed = addressSchema.safeParse({
    label: formData.get('label') ?? '',
    recipient: formData.get('recipient') ?? '',
    country: formData.get('country') ?? '',
    state: formData.get('state') ?? '',
    city: formData.get('city') ?? '',
    postalCode: formData.get('postalCode') ?? '',
    streetAddress: formData.get('streetAddress') ?? '',
    phoneNumber: formData.get('phoneNumber') ?? '',
    isDefault: formData.get('isDefault') === 'on',
  })
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

  const { supabase, user } = await requireUser()
  if (!user) return { formError: 'You are not signed in.' }

  const id = String(formData.get('id') ?? '').trim()
  const v = parsed.data

  const row = {
    user_id: user.id,
    label: v.label || 'Home',
    recipient: v.recipient,
    country: v.country,
    state: v.state,
    city: v.city,
    postal_code: v.postalCode,
    street_address: v.streetAddress,
    phone_number: v.phoneNumber,
    is_default: v.isDefault,
  }

  // Only one default per user is a unique index, so the old one has to be
  // cleared first or the insert is rejected.
  if (v.isDefault) {
    await supabase
      .from('addresses')
      .update({ is_default: false })
      .eq('user_id', user.id)
      .eq('is_default', true)
  }

  const { error } = id
    ? await supabase.from('addresses').update(row).eq('id', id).eq('user_id', user.id)
    : await supabase.from('addresses').insert(row)

  if (error) return { formError: error.message }

  await logActivity(
    user.id,
    id ? 'address_updated' : 'address_added',
    {},
    await requestContext(),
  )
  revalidatePath('/account/addresses')
  return { ok: true, notice: 'Changes saved.' }
}

export async function deleteAddress(id: string): Promise<void> {
  if (!accountsEnabled()) return
  const { supabase, user } = await requireUser()
  if (!user) return

  await supabase.from('addresses').delete().eq('id', id).eq('user_id', user.id)
  await logActivity(user.id, 'address_deleted', {}, await requestContext())
  revalidatePath('/account/addresses')
}

/* ---------------------------- delete account ---------------------------- */

export async function deleteAccount(
  _prev: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  if (!accountsEnabled()) return { formError: NOT_CONFIGURED }

  const parsed = deleteAccountSchema.safeParse({ confirm: formData.get('confirm') })
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

  const { supabase, user } = await requireUser()
  if (!user) return { formError: 'You are not signed in.' }

  const ctx = await requestContext()

  try {
    const admin = createAdminClient()

    // Orders are NOT deleted. They are a financial record, and the business
    // needs them; the link to the person is what goes. The order keeps its
    // email so it can still be found by reference.
    await admin.from('orders').update({ user_id: null }).eq('user_id', user.id)

    await admin.from('account_activity').insert({
      user_id: null,
      activity_type: 'account_deleted',
      metadata: { email: user.email, deleted_at: new Date().toISOString() },
      ip_address: ctx.ip,
      user_agent: ctx.userAgent,
    })

    // Removing the auth user cascades to users → profiles, addresses and any
    // remaining activity rows, because every one of those is ON DELETE CASCADE.
    const { error } = await admin.auth.admin.deleteUser(user.id)
    if (error) return { formError: `Could not delete the account: ${error.message}` }
  } catch (error) {
    return {
      formError:
        error instanceof Error
          ? error.message
          : 'Could not delete the account. Try again in a moment.',
    }
  }

  await supabase.auth.signOut()
  redirect('/?deleted=1')
}
