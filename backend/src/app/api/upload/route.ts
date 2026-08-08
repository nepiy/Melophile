import { NextResponse } from 'next/server'
import { db, images } from '@/db'
import { getSession } from '@/lib/session'
import { storage } from '@/lib/storage'

/* ==========================================================================
   Authenticated image upload.

   The editors post images inside their normal multipart forms, so this route is
   a convenience rather than the main path. It still gets the same guard, because
   an unauthenticated upload endpoint is a file-drop for the whole internet.
   ========================================================================== */

const noStore = { 'Cache-Control': 'no-store' }

export async function POST(request: Request) {
  const session = await getSession()
  if (!session || session.user.mustChangePassword) {
    return NextResponse.json(
      { ok: false, error: 'Sign in first.' },
      { status: 401, headers: noStore },
    )
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json(
      { ok: false, error: 'That request was not a file upload.' },
      { status: 400, headers: noStore },
    )
  }

  const file = form.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json(
      { ok: false, error: 'No file was attached. Choose an image and try again.' },
      { status: 400, headers: noStore },
    )
  }

  const alt = String(form.get('alt') ?? '').trim()
  if (!alt) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'Add alt text — one short phrase describing the image, so the site works for people using a screen reader.',
      },
      { status: 400, headers: noStore },
    )
  }

  const saved = await storage.save(file)
  if (!saved.ok) {
    // storage already phrases these for a person: size limits, wrong format,
    // unreadable file. Pass its wording straight through.
    return NextResponse.json(
      { ok: false, error: saved.error },
      { status: 400, headers: noStore },
    )
  }

  const row = await db
    .insert(images)
    .values({
      path: saved.image.path,
      width: saved.image.width,
      height: saved.image.height,
      alt,
      mimeType: saved.image.mimeType,
      bytes: saved.image.bytes,
      isPlaceholder: false,
      createdAt: new Date(),
    })
    .returning({ id: images.id })
    .get()

  if (!row) {
    await storage.remove(saved.image.path)
    return NextResponse.json(
      { ok: false, error: 'Could not record that image. Try again.' },
      { status: 500, headers: noStore },
    )
  }

  return NextResponse.json(
    {
      ok: true,
      image: {
        id: row.id,
        path: saved.image.path,
        width: saved.image.width,
        height: saved.image.height,
        alt,
      },
    },
    { headers: noStore },
  )
}

/** Anything other than POST is a mistake worth naming. */
export async function GET() {
  return NextResponse.json(
    { ok: false, error: 'Upload with POST and a multipart form.' },
    { status: 405, headers: { ...noStore, Allow: 'POST' } },
  )
}
