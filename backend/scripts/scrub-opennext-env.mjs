/**
 * OpenNext copies every value from the project's Next.js env files into
 * `.open-next/cloudflare/next-env.mjs` as source-code fallbacks. That is useful
 * for public build-time values, but it also turns server credentials into
 * plaintext Worker source on a local deploy.
 *
 * Keep only NEXT_PUBLIC_* values. Runtime server secrets must come from
 * encrypted Cloudflare secret bindings, which override these fallbacks.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const target = resolve(process.cwd(), '..', '.open-next', 'cloudflare', 'next-env.mjs')
const source = await readFile(target, 'utf8')
const modes = ['production', 'development', 'test']
const output = []

for (const mode of modes) {
  const match = source.match(new RegExp(`^export const ${mode} = (.+);$`, 'm'))
  if (!match?.[1]) throw new Error(`OpenNext env bundle is missing ${mode}.`)

  const parsed = JSON.parse(match[1])
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`OpenNext env bundle has an invalid ${mode} object.`)
  }

  const safe = Object.fromEntries(
    Object.entries(parsed).filter(([key]) => key.startsWith('NEXT_PUBLIC_')),
  )
  output.push(`export const ${mode} = ${JSON.stringify(safe)};`)
}

await writeFile(target, `${output.join('\n')}\n`, { encoding: 'utf8', mode: 0o600 })
console.log('Removed server-only values from the generated OpenNext env bundle.')
