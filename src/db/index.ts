import { existsSync, mkdirSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'

/**
 * Resolve DATABASE_URL ("file:./data/melophile.db" or a bare path) to an
 * absolute filesystem path, creating the directory if it is missing.
 */
export function resolveDbPath(): string {
  const raw = process.env.DATABASE_URL ?? 'file:./data/melophile.db'
  const stripped = raw.startsWith('file:') ? raw.slice('file:'.length) : raw
  const abs = isAbsolute(stripped) ? stripped : resolve(process.cwd(), stripped)
  const dir = dirname(abs)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return abs
}

function createClient() {
  const sqlite = new Database(resolveDbPath())
  // WAL keeps reads from blocking the admin's writes.
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  sqlite.pragma('busy_timeout = 5000')
  return drizzle(sqlite, { schema })
}

type DbClient = ReturnType<typeof createClient>

// Next's dev server re-evaluates modules on every edit. Without this the
// process accumulates open SQLite handles until it runs out of descriptors.
const globalForDb = globalThis as unknown as { __melophileDb?: DbClient }

export const db: DbClient = globalForDb.__melophileDb ?? createClient()

if (process.env.NODE_ENV !== 'production') globalForDb.__melophileDb = db

export { schema }
export * from './schema'
