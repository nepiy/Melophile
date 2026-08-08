/**
 * Regenerates the seeded placeholder artwork in place.
 *
 * Filenames are deterministic, so every file is rewritten at the path the
 * database already points at — no rows change, no content is lost. Useful after
 * the palette moves, which is exactly why it exists: art drawn for the old
 * near-black base disappeared against the smoky one.
 *
 *   npm run art:regen
 */
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { artists, db, events, images, products, releases } from '../src/db'
import { portraitSvg, rasterise, sleeveSvg } from '../src/db/seed-art'
import { writeUploadFile } from '../src/lib/storage'
import { slugify } from '../src/lib/format'

for (const file of ['.env.local', '.env']) {
  const path = resolve(process.cwd(), file)
  if (existsSync(path)) {
    try {
      process.loadEnvFile(path)
    } catch {
      /* the checks below will report anything missing */
    }
  }
}

async function main() {
  let count = 0
  const write = async (svg: string, filename: string) => {
    const raster = await rasterise(svg)
    await writeUploadFile(filename, raster.data)
    count++
  }

  for (const r of await db.select().from(releases).all()) {
    await write(sleeveSvg(r.catalogNumber), `sleeve-${r.catalogNumber.toLowerCase()}.webp`)
  }
  for (const a of await db.select().from(artists).all()) {
    await write(portraitSvg(a.name), `portrait-${slugify(a.name)}.webp`)
  }
  for (const p of await db.select().from(products).all()) {
    // Music products reuse a release sleeve; only regenerate their own art.
    const filename = `product-${slugify(p.title)}.webp`
    const row = await db.select().from(images).all()
    const usesOwn = row.some((i) => i.path === `/uploads/${filename}`)
    if (usesOwn) await write(sleeveSvg(`${p.kind.toUpperCase()}-${p.title}`), filename)
  }
  for (const e of await db.select().from(events).all()) {
    await write(sleeveSvg(`EVENT-${e.title}`), `event-${slugify(e.title)}.webp`)
  }

  console.log(`Regenerated ${count} images. Restart the dev server to clear the image cache.`)
}

main().catch((error) => {
  console.error('Could not regenerate the artwork:', error)
  process.exit(1)
})
