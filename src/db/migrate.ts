/**
 * Applies the generated SQL migrations. Safe to run repeatedly.
 *   npm run db:migrate
 */
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { db, resolveDbPath } from './index'

const folder = resolve(process.cwd(), 'src/db/migrations')

if (!existsSync(folder)) {
  console.error(
    `No migrations found at ${folder}.\nRun "npm run db:generate" first to create them from src/db/schema.ts.`,
  )
  process.exit(1)
}

migrate(db, { migrationsFolder: folder })
console.log(`Database ready at ${resolveDbPath()}`)
