import { randomBytes } from 'node:crypto'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import sharp, { type Metadata, type Sharp } from 'sharp'

/* ==========================================================================
   Image storage.

   One interface, one implementation. Local disk is right for a label running
   its own site: uploads are backed up by copying a folder. It does NOT work on
   a read-only serverless filesystem — see HANDOVER.md. Moving to S3/R2/Vercel
   Blob is a second class implementing Storage and one line in `storage`.
   ========================================================================== */

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024 // 8 MB
export const MAX_DIMENSION = 2000 // longest edge of the stored master

const ACCEPTED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/tiff',
])

export type StoredImage = {
  path: string
  width: number
  height: number
  mimeType: string
  bytes: number
}

export type SaveResult = { ok: true; image: StoredImage } | { ok: false; error: string }

export interface Storage {
  save(file: File): Promise<SaveResult>
  remove(path: string): Promise<void>
}

function humanBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

class LocalDiskStorage implements Storage {
  private dir = resolve(process.cwd(), 'public', 'uploads')

  async save(file: File): Promise<SaveResult> {
    if (!file || file.size === 0) {
      return { ok: false, error: 'That file is empty. Pick another one.' }
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return {
        ok: false,
        error: `That image is ${humanBytes(file.size)}. The limit is ${humanBytes(
          MAX_UPLOAD_BYTES,
        )} — export it again at a smaller size, or save it as a JPEG.`,
      }
    }

    if (file.type && !ACCEPTED_TYPES.has(file.type)) {
      return {
        ok: false,
        error: `${file.type} is not an image format this site can use. Use a JPEG, PNG, WebP or AVIF.`,
      }
    }

    const input = Buffer.from(await file.arrayBuffer())

    let pipeline: Sharp
    let meta: Metadata
    try {
      pipeline = sharp(input, { failOn: 'error' })
      meta = await pipeline.metadata()
    } catch {
      return {
        ok: false,
        error:
          'That file is not a readable image. It may be corrupted — try exporting it again.',
      }
    }

    if (!meta.width || !meta.height) {
      return {
        ok: false,
        error: 'That image has no readable dimensions. Try exporting it again.',
      }
    }

    await mkdir(this.dir, { recursive: true })

    const name = `${randomBytes(9).toString('hex')}.webp`

    // One master, resized down only, re-encoded to WebP. next/image derives
    // every rendered size from this and emits AVIF where the browser takes it.
    const output = await pipeline
      .rotate() // honour EXIF orientation before stripping it
      .resize({
        width: MAX_DIMENSION,
        height: MAX_DIMENSION,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 82, effort: 4 })
      .toBuffer({ resolveWithObject: true })

    await writeFile(join(this.dir, name), output.data)

    return {
      ok: true,
      image: {
        path: `/uploads/${name}`,
        width: output.info.width,
        height: output.info.height,
        mimeType: 'image/webp',
        bytes: output.data.byteLength,
      },
    }
  }

  async remove(path: string): Promise<void> {
    // Only ever delete inside the uploads directory, whatever the input says.
    const name = path.replace(/^\/uploads\//, '')
    if (!name || name.includes('/') || name.includes('..')) return
    try {
      await unlink(join(this.dir, name))
    } catch {
      // Already gone is the desired end state.
    }
  }
}

/** Write raw bytes straight to uploads. Used by the seed for generated art. */
export async function writeUploadFile(name: string, data: Buffer): Promise<string> {
  const dir = resolve(process.cwd(), 'public', 'uploads')
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, name), data)
  return `/uploads/${name}`
}

export const storage: Storage = new LocalDiskStorage()
