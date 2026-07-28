/**
 * The admin's own front door.
 *
 *   http://localhost:4100   →   the admin
 *   http://localhost:3000   →   the public site
 *
 * WHY A PROXY AND NOT A SECOND NEXT SERVER
 * ----------------------------------------
 * /admin is a route inside the same Next app, so it cannot be "moved" to another
 * port on its own. Two `next dev` processes would fight over the same .next
 * directory and compile the whole site twice. This is ~100 lines with no
 * dependency instead: it listens on its own port and forwards to the app,
 * prefixing every request with /admin.
 *
 * The useful side effect: on this port the public site is unreachable. A request
 * for /music becomes /admin/music, which does not exist. So the admin port
 * serves the admin and nothing else, and you can firewall or bind it separately
 * from the public one.
 *
 * Run it beside the app:
 *   npm run dev      (terminal 1)
 *   npm run admin    (terminal 2)
 * or both at once with:
 *   npm run dev:admin
 */

import http from 'node:http'
import net from 'node:net'

const APP_HOST = process.env.APP_HOST ?? '127.0.0.1'
const APP_PORT = Number(process.env.APP_PORT ?? process.env.PORT ?? 3000)
const ADMIN_PORT = Number(process.env.ADMIN_PORT ?? 4100)

/**
 * Requests that must reach the app untouched. Prefixing these with /admin would
 * break the page: the stylesheets, the client bundles and the uploaded images
 * are all served from paths the admin pages merely reference.
 */
const PASSTHROUGH = [
  /^\/_next\//,
  /^\/__nextjs/, // dev overlay + error source maps
  /^\/uploads\//,
  /^\/favicon\./,
  /^\/robots\.txt$/,
]

/** '/' → '/admin', '/releases' → '/admin/releases', assets unchanged. */
function toAdminPath(url) {
  if (PASSTHROUGH.some((re) => re.test(url))) return url
  if (url === '/' || url === '') return '/admin'
  // Already addressed to /admin (a client-side navigation, or someone typing the
  // full path) — leave it alone rather than producing /admin/admin.
  if (url === '/admin' || url.startsWith('/admin/') || url.startsWith('/admin?')) {
    return url
  }
  return `/admin${url.startsWith('/') ? '' : '/'}${url}`
}

const DOWN_PAGE = `<!doctype html>
<meta charset="utf-8">
<title>The site is not running</title>
<style>
  body{background:#0f0c0a;color:#e8e1d9;font:16px/1.6 ui-monospace,Menlo,monospace;
       display:grid;place-items:center;min-height:100vh;margin:0;padding:24px}
  div{max-width:52ch}
  h1{font-size:1.1rem;letter-spacing:.14em;text-transform:uppercase;color:#d98e2b;margin:0 0 12px}
  code{background:#1a1613;border:1px solid #2a2320;padding:2px 6px}
  p{color:#968a82}
</style>
<div>
  <h1>No signal</h1>
  <p>The admin front door is running on port ${ADMIN_PORT}, but the site itself is
  not answering on port ${APP_PORT}.</p>
  <p>Start it in another terminal with <code>npm run dev</code>, then reload.</p>
</div>`

const server = http.createServer((req, res) => {
  const path = toAdminPath(req.url ?? '/')

  const headers = { ...req.headers }

  // Leave `host` exactly as the browser sent it (localhost:4100).
  //
  // The obvious thing is to rewrite it to the app's own host, and that quietly
  // breaks every form: Next 15 checks a server action's Origin against Host to
  // stop cross-site posts, so Host 127.0.0.1:3000 against Origin
  // localhost:4100 is refused. You get a page that looks like it saved and a
  // session cookie that never arrives. Passing the real host through keeps the
  // two in agreement — and next.config.ts lists this port in
  // serverActions.allowedOrigins as well.
  headers['x-forwarded-host'] = req.headers.host ?? `localhost:${ADMIN_PORT}`
  headers['x-forwarded-proto'] = 'http'
  delete headers['accept-encoding'] // nothing here needs re-encoding

  const upstream = http.request(
    { host: APP_HOST, port: APP_PORT, path, method: req.method, headers },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers)
      upstreamRes.pipe(res)
    },
  )

  upstream.on('error', (error) => {
    if (res.headersSent) return res.destroy()
    const refused = error.code === 'ECONNREFUSED'
    res.writeHead(refused ? 503 : 502, { 'content-type': 'text/html; charset=utf-8' })
    res.end(refused ? DOWN_PAGE : `Upstream error: ${error.message}`)
  })

  req.pipe(upstream)
})

/* Next's dev server pushes hot reloads over a websocket. Without this the admin
   still works, but every edit needs a manual refresh. */
server.on('upgrade', (req, socket, head) => {
  const path = toAdminPath(req.url ?? '/')
  const upstream = net.connect(APP_PORT, APP_HOST, () => {
    const lines = [
      `${req.method} ${path} HTTP/1.1`,
      ...Object.entries(req.headers).flatMap(([key, value]) =>
        Array.isArray(value) ? value.map((v) => `${key}: ${v}`) : [`${key}: ${value}`],
      ),
      '',
      '',
    ]
    upstream.write(lines.join('\r\n'))
    if (head?.length) upstream.write(head)
    upstream.pipe(socket)
    socket.pipe(upstream)
  })
  upstream.on('error', () => socket.destroy())
  socket.on('error', () => upstream.destroy())
})

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(
      `\nPort ${ADMIN_PORT} is already in use.\n` +
        `Pick another one:  ADMIN_PORT=4200 npm run admin\n`,
    )
    process.exit(1)
  }
  throw error
})

// Loopback only. The admin should never be reachable from the network by
// accident just because someone started it on a café wifi.
server.listen(ADMIN_PORT, '127.0.0.1', () => {
  // Started by scripts/dev-with-admin.mjs, which prints one banner for both.
  if (process.env.QUIET) return
  console.log(`\n  Admin    http://localhost:${ADMIN_PORT}`)
  console.log(`  Site     http://localhost:${APP_PORT}`)
  console.log(`\n  The public pages are not served on ${ADMIN_PORT}. Ctrl+C to stop.\n`)
})
