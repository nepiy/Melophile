import 'server-only'

import { createHmac, timingSafeEqual } from 'node:crypto'

const CONTEXT = 'melophile-order-access:v1:'
const TOKEN_BYTES = 32

export class OrderAccessConfigurationError extends Error {
  constructor() {
    super('Order access protection is not configured.')
    this.name = 'OrderAccessConfigurationError'
  }
}

function accessSecret(): string {
  const value = process.env.SESSION_SECRET
  if (!value || value.length < 32) throw new OrderAccessConfigurationError()
  return value
}

/** Fail before an order is written if its private confirmation link cannot be made. */
export function assertOrderAccessConfigured(): void {
  accessSecret()
}

/**
 * A bearer token for the private order-confirmation URL.
 *
 * It is deterministic so existing orders do not need a schema migration and a
 * guest link can be recreated by the server. The human-readable reference is
 * deliberately not authority by itself.
 */
export function orderAccessToken(reference: string): string {
  return createHmac('sha256', accessSecret())
    .update(`${CONTEXT}${reference}`)
    .digest('base64url')
}

/** Constant-time verification of an untrusted token from the URL. */
export function verifyOrderAccessToken(reference: string, candidate: string): boolean {
  if (!candidate || candidate.length > 128) return false

  try {
    const supplied = Buffer.from(candidate, 'base64url')
    const expected = Buffer.from(orderAccessToken(reference), 'base64url')
    if (supplied.length !== TOKEN_BYTES || expected.length !== TOKEN_BYTES) return false
    return timingSafeEqual(supplied, expected)
  } catch {
    return false
  }
}
