/**
 * Starts the site and the admin together and prints both addresses.
 *
 *   npm run dev
 *     http://localhost:3000   the public site
 *     http://localhost:4100   the admin
 *
 * WHY THIS CHECKS THE PORTS FIRST
 * -------------------------------
 * If something already holds 3000, `next dev` quietly moves to 3001 and carries
 * on. That is friendly on its own and wrong here: the admin front door forwards
 * to a fixed port, so a drifting site port leaves the admin proxying to nothing
 * — or worse, to a different project — with no error anywhere. Better to stop
 * and say which process is in the way.
 *
 * Ctrl+C stops both. If either dies, the other is shut down too, so you are
 * never left with half the pair holding a port.
 */

import { spawn } from 'node:child_process'
import net from 'node:net'

const SITE_PORT = Number(process.env.PORT ?? 3000)
const ADMIN_PORT = Number(process.env.ADMIN_PORT ?? 4100)

/* ----------------------------- pre-flight ------------------------------ */

function bindable(port, host) {
  return new Promise((resolve) => {
    const probe = net
      .createServer()
      .once('error', () => resolve(false))
      .once('listening', () => probe.close(() => resolve(true)))
      .listen(port, host)
  })
}

/**
 * Checked on all interfaces AND on loopback, because neither alone is enough.
 *
 * `next dev` binds IPv6 *:3000 dual-stack; on macOS a probe of 127.0.0.1:3000
 * then succeeds anyway and the port looks free when it is not — which is
 * precisely the case this guard exists to catch. Meanwhile the admin proxy binds
 * 127.0.0.1 only, so a 0.0.0.0 probe is what catches that one. A port is free
 * only if both binds succeed.
 */
async function portFree(port) {
  return (await bindable(port, '0.0.0.0')) && (await bindable(port, '127.0.0.1'))
}

const busy = []
for (const [port, label] of [
  [SITE_PORT, 'the site'],
  [ADMIN_PORT, 'the admin'],
]) {
  if (!(await portFree(port))) busy.push({ port, label })
}

if (busy.length > 0) {
  const lines = busy.map((b) => `  ${b.port}  (${b.label})`).join('\n')
  console.error(
    `\nCannot start — these ports are already in use:\n\n${lines}\n\n` +
      `Something is probably still running from earlier. Find it with:\n` +
      `  lsof -ti:${busy.map((b) => b.port).join(',')} -sTCP:LISTEN\n\n` +
      `Stop everything and try again:\n` +
      `  pkill -f "next dev"; pkill -f admin-server.mjs\n\n` +
      `Or use different ports:\n` +
      `  PORT=3200 ADMIN_PORT=4200 npm run dev\n`,
  )
  process.exit(1)
}

/* ------------------------------- start -------------------------------- */

const env = { ...process.env, PORT: String(SITE_PORT), ADMIN_PORT: String(ADMIN_PORT) }

const site = spawn(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['next', 'dev', '--port', String(SITE_PORT)],
  { stdio: ['inherit', 'pipe', 'inherit'], env },
)

// QUIET stops the proxy printing its own banner — this file prints one for both.
const admin = spawn(process.execPath, ['scripts/admin-server.mjs'], {
  stdio: 'inherit',
  env: { ...env, QUIET: '1' },
})

const children = [site, admin]

/* --------------------------- the one banner ---------------------------- */

const amber = (s) => `\x1b[38;5;179m${s}\x1b[0m`
const dim = (s) => `\x1b[2m${s}\x1b[0m`
const bold = (s) => `\x1b[1m${s}\x1b[0m`

let announced = false

function announce() {
  if (announced) return
  announced = true
  process.stdout.write(
    '\n' +
      `  ${bold('Melophile Records')}\n\n` +
      `  ${dim('SITE ')}   ${amber(`http://localhost:${SITE_PORT}`)}\n` +
      `  ${dim('ADMIN')}   ${amber(`http://localhost:${ADMIN_PORT}`)}\n\n` +
      `  ${dim(`The public pages are not served on ${ADMIN_PORT}. Ctrl+C stops both.`)}\n\n`,
  )
}

/* Next prints its own "Local: / Network:" block. Dropping just those two lines
   keeps one set of addresses on screen instead of two that disagree — the whole
   point of this script. Everything else it says is passed straight through. */
const SUPPRESS = /^\s*[-–]\s*(Local|Network):/

site.stdout.setEncoding('utf8')
site.stdout.on('data', (chunk) => {
  for (const line of chunk.split(/(?<=\n)/)) {
    if (SUPPRESS.test(line.replace(/\x1b\[[0-9;]*m/g, ''))) continue
    process.stdout.write(line)
  }
  if (/Ready in|started server/i.test(chunk)) announce()
})

/* ------------------------------- teardown ------------------------------ */

let stopping = false

function stopAll(code) {
  if (stopping) return
  stopping = true
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM')
  }
  process.exit(code ?? 0)
}

for (const child of children) {
  child.on('exit', (code) => stopAll(code ?? 0))
  child.on('error', (error) => {
    console.error(error)
    stopAll(1)
  })
}

process.on('SIGINT', () => stopAll(0))
process.on('SIGTERM', () => stopAll(0))
