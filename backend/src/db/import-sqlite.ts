/**
 * One-time SQLite → PostgreSQL content import.
 *
 * Usage: SQLITE_DATABASE_URL=file:../data/melophile.db DATABASE_URL=postgres://…
 *        npm run db:import-sqlite
 *
 * The PostgreSQL database must already have `npm run db:migrate` applied and
 * be empty. The script refuses to overwrite it.
 */
import Database from 'better-sqlite3'
import postgres from 'postgres'
import { isAbsolute, resolve } from 'node:path'

const source = process.env.SQLITE_DATABASE_URL?.replace(/^file:/, '')
const target = process.env.DATABASE_URL
if (!source || !target) throw new Error('Set SQLITE_DATABASE_URL and DATABASE_URL before importing.')

const sqlite = new Database(isAbsolute(source) ? source : resolve(process.cwd(), source), {
  readonly: true,
})
const sql = postgres(target)

const order = [
  'images', 'site_settings', 'home', 'about', 'contact', 'artists', 'releases',
  'release_artists', 'services', 'about_photos', 'blackouts', 'admin_users',
  'sessions', 'login_attempts', 'store_page', 'events_page', 'products', 'events',
  'bookings', 'orders', 'order_items',
]
const json = new Set(['social_links', 'emails', 'links', 'tracklist', 'streaming_links', 'variants'])
const booleans = new Set(['is_placeholder', 'show_catalog_count', 'featured', 'notified', 'digital', 'must_change_password', 'ok'])
const timestamps = new Set(['created_at', 'updated_at', 'last_login_at', 'expires_at', 'at', 'paid_at'])

function value(column: string, raw: unknown) {
  if (raw === null) return null
  if (json.has(column) && typeof raw === 'string') return JSON.parse(raw)
  if (booleans.has(column)) return Boolean(raw)
  if (timestamps.has(column) && typeof raw === 'number') return new Date(raw)
  return raw
}

async function main() {
  for (const table of order) {
    const existing = await sql.unsafe(`select count(*)::int as count from "${table}"`)
    if (existing[0].count > 0) throw new Error(`PostgreSQL table ${table} is not empty; refusing to overwrite data.`)

    const rows = sqlite.prepare(`select * from "${table}"`).all() as Record<string, unknown>[]
    if (!rows.length) continue
    const columns = Object.keys(rows[0])
    const names = columns.map((name) => `"${name}"`).join(', ')
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ')
    for (const row of rows) {
      await sql.unsafe(
        `insert into "${table}" (${names}) values (${placeholders})`,
        columns.map((column) => value(column, row[column])),
      )
    }
    if (columns.includes('id')) {
      await sql.unsafe(`select setval(pg_get_serial_sequence('${table}', 'id'), (select max(id) from "${table}"))`)
    }
    console.log(`Imported ${rows.length} row(s) into ${table}.`)
  }
}

main().finally(async () => { sqlite.close(); await sql.end() })
