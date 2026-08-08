/**
 * Reset the admin password from the server.
 *
 * The only way back in if the password is lost — there is deliberately no
 * "forgot password" email flow, because a single-editor admin with no mail
 * server configured would be a worse door than no door.
 *
 *   npm run admin:password -- 'a new long passphrase'
 *   npm run admin:password                      (generates one and prints it)
 *   npm run admin:password -- --email new@you.com 'a new long passphrase'
 *
 * Every existing session is signed out, so if the old password leaked, whoever
 * had it is logged out too.
 */
import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { eq } from 'drizzle-orm'
import { adminUsers, db, sessions } from '../src/db'
import { describePasswordProblem, hashPassword } from '../src/lib/auth'

for (const file of ['.env.local', '.env']) {
  const path = resolve(process.cwd(), file)
  if (existsSync(path)) {
    try {
      process.loadEnvFile(path)
    } catch {
      /* malformed env file — the checks below still report what is wrong */
    }
  }
}

async function main() {
  const argv = process.argv.slice(2)

  let email: string | null = null
  const emailFlag = argv.indexOf('--email')
  if (emailFlag !== -1) {
    email = argv[emailFlag + 1] ?? null
    argv.splice(emailFlag, 2)
  }

  const supplied = argv.find((a) => !a.startsWith('--'))
  const generated = supplied ? null : randomBytes(12).toString('base64url')
  const password = supplied ?? generated ?? ''

  const problem = describePasswordProblem(password)
  if (problem) {
    console.error(`\nThat password will not do: ${problem}\n`)
    process.exit(1)
  }

  const user = email
    ? await db.select().from(adminUsers).where(eq(adminUsers.email, email)).get()
    : await db.select().from(adminUsers).get()

  if (!user) {
    console.error(
      email
        ? `\nNo admin user with the email ${email}.\n`
        : '\nThere is no admin user yet. Run `npm run setup` first.\n',
    )
    process.exit(1)
  }

  const { hash, salt } = await hashPassword(password)

  await db
    .update(adminUsers)
    .set({
      passwordHash: hash,
      passwordSalt: salt,
      // Set from a terminal by whoever runs the server, so it is not a shared
      // starter password that needs changing on sight.
      mustChangePassword: false,
    })
    .where(eq(adminUsers.id, user.id))

  // Anyone holding the old password is now signed out.
  const cleared = await db.delete(sessions).where(eq(sessions.userId, user.id))

  console.log(`
Password reset.

  email     ${user.email}
  password  ${generated ? `${password}      <-- generated, copy it now` : '(the one you passed in)'}

Every existing session was signed out${
    typeof (cleared as { changes?: number }).changes === 'number'
      ? ` (${(cleared as { changes?: number }).changes})`
      : ''
  }. Sign in again at /admin.
`)
}

main().catch((error) => {
  console.error('\nCould not reset the password:', error)
  process.exit(1)
})
