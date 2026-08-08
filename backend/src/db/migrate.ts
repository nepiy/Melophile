/**
 * Applies the generated SQL migrations. Safe to run repeatedly.
 *   npm run db:migrate
 */
import { resolve } from 'node:path'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { adminUsers, db } from './index'
import { describePasswordProblem, hashPassword } from '../lib/auth'

const folder = resolve(process.cwd(), 'src/db/pg-migrations')

async function createInitialAdmin(): Promise<void> {
  // Railway runs migrations on an empty volume but does not run the optional
  // demo-content seed. Create the one account needed to enter /admin from its
  // deployment variables, without ever replacing an existing account.
  const existing = await db.select({ id: adminUsers.id }).from(adminUsers).limit(1).all()
  if (existing.length > 0) return

  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase() ?? ''
  const password = process.env.ADMIN_PASSWORD ?? ''

  if (!email || !password) {
    console.warn('No admin user created: set ADMIN_EMAIL and ADMIN_PASSWORD to enable /admin.')
    return
  }

  const problem = describePasswordProblem(password)
  if (problem) {
    console.warn(`No admin user created: ADMIN_PASSWORD is invalid (${problem})`)
    return
  }

  const { hash, salt } = await hashPassword(password)
  await db.insert(adminUsers).values({
    email,
    passwordHash: hash,
    passwordSalt: salt,
    mustChangePassword: false,
    createdAt: new Date(),
  })
  console.log(`Initial admin created for ${email}`)
}

async function main(): Promise<void> {
  await migrate(db as any, { migrationsFolder: folder })
  await createInitialAdmin()
  console.log('PostgreSQL database ready.')
}

main().catch((error) => {
  console.error('Could not prepare database:', error)
  process.exit(1)
})
