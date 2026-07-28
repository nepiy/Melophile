'use client'

import { useActionState, useEffect, useId, useRef, useState } from 'react'
import { Avatar } from '@/components/account/AccountMenu'
import {
  removeAvatar,
  uploadAvatar,
  type ProfileState,
} from '@/lib/actions/account-profile'

/* ==========================================================================
   The profile picture.

   THE TWO REJECTIONS ARE WORD FOR WORD THE SERVER'S
   uploadAvatar refuses anything over 4 MB and anything that is not a JPEG,
   PNG, WebP or AVIF, with the sentences below. Checking here as well saves a
   pointless upload of a 30 MB photo over a phone connection — it does not
   replace the server's check, and it must not disagree with it, so the limits
   and the wording are copied deliberately rather than approximated.

   THE PREVIEW IS AN OBJECT URL, AND OBJECT URLS LEAK
   createObjectURL pins the file in memory until it is revoked. Every URL made
   here is revoked when it is replaced and again when the component unmounts.
   ========================================================================== */

const MAX_BYTES = 4 * 1024 * 1024
const TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif'])

const EMPTY: ProfileState = {}

export type AvatarUploadProps = {
  /** The picture on file, already resolved to a URL. */
  currentUrl: string | null
  /** Used for the initials when there is no picture. */
  name: string
}

export function AvatarUpload({ currentUrl, name }: AvatarUploadProps) {
  const uid = useId()
  const [state, formAction, pending] = useActionState(uploadAvatar, EMPTY)

  const inputRef = useRef<HTMLInputElement | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [chosen, setChosen] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  // The one place an object URL is released. Runs on every change of `preview`
  // — so the previous one goes when a second file is chosen — and on unmount.
  useEffect(() => {
    if (!preview) return
    return () => URL.revokeObjectURL(preview)
  }, [preview])

  // A saved picture makes the preview stale: the server has the real one now.
  useEffect(() => {
    if (!state.ok) return
    setPreview(null)
    setChosen(false)
    setLocalError(null)
    if (inputRef.current) inputRef.current.value = ''
  }, [state.ok])

  function onPick(file: File | null) {
    setLocalError(null)
    setPreview(null)
    setChosen(false)

    if (!file) return

    if (file.size > MAX_BYTES) {
      setLocalError(
        `That image is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 4 MB — export it smaller and try again.`,
      )
      if (inputRef.current) inputRef.current.value = ''
      return
    }

    if (!TYPES.has(file.type)) {
      setLocalError(
        `${file.type || 'That file'} is not an image this site can use. Use a JPEG, PNG, WebP or AVIF.`,
      )
      if (inputRef.current) inputRef.current.value = ''
      return
    }

    setPreview(URL.createObjectURL(file))
    setChosen(true)
  }

  const error = localError ?? state.fieldErrors?.avatar ?? state.formError
  const shown = preview ?? currentUrl
  const describedBy =
    [`${uid}-hint`, error ? `${uid}-err` : null].filter(Boolean).join(' ') || undefined

  return (
    <div className="ac-upload">
      <Avatar url={shown} name={name} size="lg" />

      <div className="ac-upload__side">
        <form action={formAction}>
          <div className="au-field">
            <label className="label au-field__label" htmlFor={`${uid}-avatar`}>
              {currentUrl ? 'Replace your picture' : 'Add a picture'}
            </label>

            <input
              id={`${uid}-avatar`}
              name="avatar"
              type="file"
              className="ac-file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              ref={inputRef}
              aria-invalid={Boolean(error)}
              aria-describedby={describedBy}
              onChange={(event) => onPick(event.currentTarget.files?.[0] ?? null)}
            />

            <p className="mono au-hint" id={`${uid}-hint`}>
              JPEG, PNG, WebP or AVIF. 4 MB at most.
            </p>

            {preview ? (
              <p className="mono ac-upload__preview" role="status">
                Not saved yet — this is what it will look like.
              </p>
            ) : null}

            {error ? (
              <p className="au-err" id={`${uid}-err`}>
                {error}
              </p>
            ) : null}
          </div>

          <div className="ac-actions">
            <button type="submit" className="btn btn--sm" disabled={pending || !chosen}>
              Save picture
            </button>
            <p className="mono au-status" role="status">
              {pending ? 'Uploading…' : state.ok ? (state.notice ?? '') : ''}
            </p>
          </div>
        </form>

        {/* A separate form, because forms do not nest. Removing a picture is
            not destructive enough to earn a two-click confirm — the file is
            replaceable and nothing else goes with it. */}
        {currentUrl ? (
          <form action={removeAvatar}>
            <button type="submit" className="btn btn--sm btn--ghost">
              Remove picture
            </button>
          </form>
        ) : null}
      </div>
    </div>
  )
}
