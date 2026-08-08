import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
) => Promise<Buffer>

/* ==========================================================================
   Password hashing with scrypt from node:crypto.

   No auth dependency: scrypt is in the standard library, is memory-hard, and
   is the recommendation for exactly this job. Parameters are the Node defaults
   (N=16384, r=8, p=1) via the 3-arg form, which lands around 100ms on a
   laptop — slow enough to matter for an attacker, fast enough for a login.
   ========================================================================== */

const KEY_LENGTH = 64

export async function hashPassword(
  password: string,
): Promise<{ hash: string; salt: string }> {
  const salt = randomBytes(16).toString('hex')
  const derived = await scrypt(password, salt, KEY_LENGTH)
  return { hash: derived.toString('hex'), salt }
}

export async function verifyPassword(
  password: string,
  hash: string,
  salt: string,
): Promise<boolean> {
  try {
    const derived = await scrypt(password, salt, KEY_LENGTH)
    const stored = Buffer.from(hash, 'hex')
    // Length must match before timingSafeEqual, which throws otherwise.
    if (stored.length !== derived.length) return false
    return timingSafeEqual(stored, derived)
  } catch {
    return false
  }
}

/** Minimum the admin will accept. Long beats clever; no character classes. */
export const MIN_PASSWORD_LENGTH = 12

export function describePasswordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters. Length matters more than symbols — a short phrase works well.`
  }
  if (/^\s|\s$/.test(password)) {
    return 'Remove the space at the start or end — it is easy to lose track of.'
  }
  return null
}
