import { z } from 'zod'
import { SESSION_TYPES } from '@/db/schema'
import { isValidIsoDate, todayIso } from './format'
import { safeUrl } from './markdown'

/* ==========================================================================
   One schema per form, used in the browser for inline validation and again on
   the server before anything is written. Same rules, same messages, one place.

   Messages state what is wrong and how to fix it, and do not apologise.
   ========================================================================== */

// Deliberately permissive. The only real test of an address is sending to it;
// this exists to catch typos, not to adjudicate RFC 5322.
const EMAIL_RE = /^[^\s@,;:<>()[\]\\"]+@[^\s@.]+(\.[^\s@.]+)+$/

const EARLIEST_START = 8 // 08:00
const LATEST_START = 22 // 22:00

export const bookingSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, 'Tell us who to reply to — first name is enough.')
      .max(80, 'That is longer than 80 characters. Shorten it.'),

    email: z
      .string()
      .trim()
      .min(1, 'We reply by email, so we need an address.')
      .max(160, 'That address is too long to be real. Check it for a typo.')
      .regex(
        EMAIL_RE,
        'That does not look like an email address. Check for a missing @ or dot.',
      )
      .transform((v) => v.toLowerCase()),

    phone: z
      .string()
      .trim()
      .max(40, 'That is longer than a phone number needs to be.')
      .refine((v) => v === '' || v.replace(/\D/g, '').length >= 6, {
        message:
          'That phone number looks short. Include the area code, or leave it blank.',
      }),

    date: z
      .string()
      .trim()
      .min(1, 'Pick the day you want.')
      .refine(isValidIsoDate, { message: 'Pick a real date from the calendar.' })
      .refine((v) => v >= todayIso(), {
        message: 'That day has passed. Pick today or a day after it.',
      }),

    time: z
      .string()
      .trim()
      .min(1, 'Pick a start time.')
      .regex(/^\d{2}:\d{2}$/, 'Use a 24-hour time, like 14:30.')
      .refine(
        (v) => {
          const hour = Number(v.slice(0, 2))
          const minute = Number(v.slice(3, 5))
          return (
            hour >= EARLIEST_START && hour <= LATEST_START && minute >= 0 && minute < 60
          )
        },
        {
          message: `The room is bookable from ${EARLIEST_START}:00 to ${LATEST_START}:00. Pick a start time in that range.`,
        },
      ),

    sessionType: z.enum(SESSION_TYPES, {
      message: 'Pick what kind of session this is.',
    }),

    durationHours: z.coerce
      .number({ message: 'Enter the number of hours you want, as a number.' })
      .int('Book in whole hours.')
      .min(1, 'Sessions start at one hour.')
      .max(
        12,
        'Twelve hours is the longest single booking. Send a note for anything longer.',
      ),

    people: z.coerce
      .number({ message: 'Enter how many people are coming, as a number.' })
      .int('Enter a whole number of people.')
      .min(1, 'At least one person needs to be in the room.')
      .max(
        30,
        'Thirty is the most the live room holds. Tell us in the notes if it is more.',
      ),

    notes: z
      .string()
      .trim()
      .max(2000, 'That is over 2000 characters. Trim it and send the detail by email.'),

    referenceUrl: z
      .string()
      .trim()
      .max(500, 'That link is too long. Use a shorter one.')
      .refine((v) => v === '' || safeUrl(v) !== null, {
        message:
          'That is not a link we can open. Paste a full http:// or https:// address.',
      }),

    // Spam gates. Both are invisible to a person filling the form in.
    company: z.string().max(0).optional().default(''),
    elapsedMs: z.coerce.number().optional().default(99_999),
  })
  .refine((v) => v.elapsedMs >= 1200, {
    message: 'That was submitted faster than a person can type. Try again.',
    path: ['company'],
  })

export type BookingInput = z.infer<typeof bookingSchema>

/** Field-keyed errors, which is what the form needs to render inline. */
export type FieldErrors = Record<string, string>

export function toFieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {}
  for (const issue of error.issues) {
    const key = issue.path.length ? String(issue.path[0]) : '_form'
    if (!(key in out)) out[key] = issue.message
  }
  return out
}

/** Validates one field in isolation, for validate-on-blur in the browser. */
export function validateBookingField(
  field: keyof BookingInput,
  value: unknown,
  all: Record<string, unknown>,
): string | null {
  const result = bookingSchema.safeParse({ ...all, [field]: value })
  if (result.success) return null
  const issue = result.error.issues.find((i) => i.path[0] === field)
  return issue ? issue.message : null
}

/* -------------------------- admin form schemas -------------------------- */

export const loginSchema = z.object({
  email: z.string().trim().min(1, 'Enter the email you log in with.'),
  password: z.string().min(1, 'Enter your password.'),
})

const isoDate = z
  .string()
  .trim()
  .refine(isValidIsoDate, { message: 'Use a real date in YYYY-MM-DD form.' })

export const blackoutSchema = z.object({
  date: isoDate,
  reason: z.string().trim().max(120, 'Keep the reason under 120 characters.'),
})

export const releaseSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'A release needs a title.')
    .max(160, 'Shorten the title.'),
  artistId: z.coerce.number().int().nullable(),
  type: z.enum(['album', 'ep', 'single'], { message: 'Pick album, EP or single.' }),
  releaseDate: isoDate,
  catalogNumber: z.string().trim().max(40, 'Catalogue numbers stay under 40 characters.'),
  description: z.string().max(8000, 'That description is over 8000 characters.'),
  credits: z.string().max(4000, 'Credits are over 4000 characters.'),
  status: z.enum(['draft', 'published']),
  featured: z.boolean(),
})

export const artistSchema = z.object({
  name: z.string().trim().min(1, 'An artist needs a name.').max(120, 'Shorten the name.'),
  role: z.string().trim().max(120, 'Keep the role or genre under 120 characters.'),
  shortDescription: z.string().max(4000, 'That description is over 4000 characters.'),
  status: z.enum(['draft', 'published']),
})

export const serviceSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'A service needs a title.')
    .max(80, 'Shorten the title.'),
  description: z
    .string()
    .trim()
    .max(200, 'One short line — keep it under 200 characters.'),
  icon: z.string().trim().min(1),
  status: z.enum(['draft', 'published']),
})

export const aboutSchema = z.object({
  heading: z
    .string()
    .trim()
    .min(1, 'The page needs a heading.')
    .max(120, 'Shorten the heading.'),
  body: z.string().max(40_000, 'That is over 40,000 characters.'),
  foundedYear: z
    .union([z.coerce.number().int().min(1900).max(2200), z.literal('')])
    .optional(),
  showCatalogCount: z.boolean(),
})

export const contactSchema = z.object({
  addressLines: z.string().max(400, 'That address is over 400 characters.'),
  phone: z.string().trim().max(40, 'That is longer than a phone number needs to be.'),
  hours: z.string().max(300, 'Opening hours are over 300 characters.'),
  mapEmbed: z
    .string()
    .trim()
    .max(1000)
    .refine((v) => v === '' || safeUrl(v) !== null, {
      message:
        'Paste the map URL only — the src="…" value from the embed code, not the whole iframe.',
    }),
  bookingHeading: z
    .string()
    .trim()
    .min(1, 'The booking section needs a heading.')
    .max(120),
  bookingIntro: z.string().max(1000),
  bookingSuccessMessage: z.string().max(1000),
  responseTime: z.string().trim().max(120),
})

/* ---------------------------- store checkout ---------------------------- */

export const checkoutSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, 'We need a name for the order.')
      .max(80, 'That is longer than 80 characters.'),
    email: z
      .string()
      .trim()
      .min(1, 'We send the receipt and any downloads by email.')
      .max(160, 'That address is too long. Check it for a typo.')
      .regex(
        EMAIL_RE,
        'That does not look like an email address. Check for a missing @ or dot.',
      )
      .transform((v) => v.toLowerCase()),
    phone: z
      .string()
      .trim()
      .max(40, 'That is longer than a phone number needs to be.')
      .refine((v) => v === '' || v.replace(/\D/g, '').length >= 6, {
        message:
          'That phone number looks short. Include the area code, or leave it blank.',
      }),
    /** Required only when the basket contains something that has to be posted. */
    shippingLines: z.string().trim().max(400, 'That address is over 400 characters.'),
    needsShipping: z.coerce.boolean().optional().default(false),
    company: z.string().max(0).optional().default(''),
  })
  .refine((v) => !v.needsShipping || v.shippingLines.length > 0, {
    message: 'We need a delivery address for the items being posted.',
    path: ['shippingLines'],
  })

export type CheckoutInput = z.infer<typeof checkoutSchema>

export const productSchema = z.object({
  title: z.string().trim().min(1, 'This needs a title.').max(160, 'Shorten the title.'),
  subtitle: z.string().trim().max(160, 'Keep the one-liner under 160 characters.'),
  kind: z.enum(['merch', 'music', 'beat'], { message: 'Pick merch, music or a beat.' }),
  description: z.string().max(8000, 'That description is over 8000 characters.'),
  status: z.enum(['draft', 'published']),
})

export const eventSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'An event needs a title.')
    .max(160, 'Shorten the title.'),
  description: z.string().max(8000, 'That description is over 8000 characters.'),
  venue: z.string().trim().max(160, 'Shorten the venue name.'),
  date: z.string().trim().refine(isValidIsoDate, { message: 'Use a real date.' }),
  status: z.enum(['draft', 'published']),
})

/* ==========================================================================
   Customer accounts.

   The same schemas run in the browser for inline validation and again in the
   server action before anything is written. One definition, one set of
   sentences, no way for the two to disagree.
   ========================================================================== */

/** Long beats clever. Length is the only requirement that reliably helps. */
export const MIN_ACCOUNT_PASSWORD = 10

const COMMON_PASSWORDS = new Set([
  'password',
  'password1',
  'password123',
  '12345678',
  '123456789',
  '1234567890',
  'qwertyuiop',
  'iloveyou',
  'letmein123',
  'welcome123',
  'admin123',
])

export const passwordField = z
  .string()
  .min(MIN_ACCOUNT_PASSWORD, `Use at least ${MIN_ACCOUNT_PASSWORD} characters.`)
  .max(200, 'That is longer than 200 characters.')
  .refine((v) => !/^\s|\s$/.test(v), {
    message: 'Remove the space at the start or end — it is easy to lose track of.',
  })
  .refine((v) => !COMMON_PASSWORDS.has(v.toLowerCase()), {
    message: 'That is one of the most-guessed passwords there is. Pick another.',
  })
  .refine((v) => /[a-z]/i.test(v) && /\d/.test(v), {
    message: 'Include at least one letter and one number.',
  })

/** Letters, numbers and underscores. Reserved words are refused outright. */
const RESERVED_USERNAMES = new Set([
  'admin',
  'administrator',
  'root',
  'support',
  'help',
  'melophile',
  'account',
  'login',
  'signup',
  'checkout',
  'cart',
  'order',
  'orders',
  'api',
  'null',
  'undefined',
])

export const usernameField = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Usernames are at least 3 characters.')
  .max(20, 'Usernames are at most 20 characters.')
  .regex(/^[a-z0-9_]+$/, 'Letters, numbers and underscores only.')
  .refine((v) => !RESERVED_USERNAMES.has(v), {
    message: 'That username is reserved. Pick another.',
  })

export const accountEmailField = z
  .string()
  .trim()
  .min(1, 'We need an email address.')
  .max(160, 'That address is too long. Check it for a typo.')
  .regex(
    EMAIL_RE,
    'That does not look like an email address. Check for a missing @ or dot.',
  )
  .transform((v) => v.toLowerCase())

export const signUpSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(2, 'Tell us what to call you.')
      .max(80, 'That is longer than 80 characters.'),
    username: usernameField,
    email: accountEmailField,
    password: passwordField,
    confirmPassword: z.string(),
    acceptTerms: z.coerce.boolean().refine((v) => v === true, {
      message: 'You need to accept the terms to create an account.',
    }),
    company: z.string().max(0).optional().default(''),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: 'Those two passwords are different.',
    path: ['confirmPassword'],
  })

export const signInSchema = z.object({
  email: accountEmailField,
  password: z.string().min(1, 'Enter your password.'),
  remember: z.coerce.boolean().optional().default(false),
})

export const forgotPasswordSchema = z.object({ email: accountEmailField })

export const resetPasswordSchema = z
  .object({
    password: passwordField,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: 'Those two passwords are different.',
    path: ['confirmPassword'],
  })

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password.'),
    password: passwordField,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: 'Those two passwords are different.',
    path: ['confirmPassword'],
  })
  .refine((v) => v.currentPassword !== v.password, {
    message: 'That is the password you already have. Choose a different one.',
    path: ['password'],
  })

export const profileSchema = z.object({
  fullName: z.string().trim().min(2, 'Tell us what to call you.').max(80, 'Shorten it.'),
  username: usernameField,
  phoneNumber: z
    .string()
    .trim()
    .max(40, 'That is longer than a phone number needs to be.')
    .refine((v) => v === '' || v.replace(/\D/g, '').length >= 6, {
      message: 'That phone number looks short. Include the area code, or leave it blank.',
    }),
  dateOfBirth: z
    .string()
    .trim()
    .refine((v) => v === '' || isValidIsoDate(v), { message: 'Use a real date.' })
    .refine((v) => v === '' || v <= todayIso(), {
      message: 'A date of birth cannot be in the future.',
    }),
  gender: z
    .enum(['female', 'male', 'non_binary', 'prefer_not_to_say', 'self_described', ''])
    .optional()
    .default(''),
  genderSelfDescribed: z.string().trim().max(60, 'Keep it under 60 characters.'),
  bio: z.string().trim().max(500, 'Keep it under 500 characters.'),
  marketingOptIn: z.coerce.boolean().optional().default(false),
})

export const addressSchema = z.object({
  label: z.string().trim().max(40, 'Keep the label short, e.g. Home or Studio.'),
  recipient: z.string().trim().max(80, 'Shorten the name.'),
  country: z.string().trim().min(2, 'Which country?').max(60, 'Shorten it.'),
  state: z.string().trim().max(60, 'Shorten it.'),
  city: z.string().trim().min(1, 'Which town or city?').max(60, 'Shorten it.'),
  postalCode: z.string().trim().min(2, 'We need a postcode.').max(20, 'Shorten it.'),
  streetAddress: z
    .string()
    .trim()
    .min(4, 'We need a street address.')
    .max(200, 'That is over 200 characters.'),
  phoneNumber: z
    .string()
    .trim()
    .max(40, 'That is longer than a phone number needs to be.'),
  isDefault: z.coerce.boolean().optional().default(false),
})

/** Typing the exact words is the confirmation — no modal that can be muscle-memoried. */
export const deleteAccountSchema = z.object({
  confirm: z.string().refine((v) => v.trim().toLowerCase() === 'delete my account', {
    message: 'Type "delete my account" exactly to confirm.',
  }),
})
