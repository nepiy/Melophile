'use client'

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type ReactNode,
} from 'react'
import { SmartImage } from '@/components/site/SmartImage'
import type { ImageRow } from '@/db'
import { renderMarkdown } from '@/lib/markdown'

/* ==========================================================================
   Admin form primitives.

   One file, one 'use client' boundary, because every editor screen in the
   admin is assembled from exactly these pieces. Two rules they all follow:

     · the control is a real form control, so a page works with the keyboard
       and submits as ordinary multipart form data — no field uploads on its
       own, nothing depends on JS having run
     · every label, count and badge is mono; every sentence of guidance or
       error is the body serif. Chrome is a channel strip, prose is a manual.
   ========================================================================== */

/* ------------------------------------------------------------------ *
 * Field
 *
 * The wrapper owns the ids: `${htmlFor}-hint` and `${htmlFor}-error`. It
 * publishes them through context so TextInput / TextArea / SelectField can
 * set aria-describedby to the ids that actually exist, rather than pointing
 * at elements that were never rendered.
 * ------------------------------------------------------------------ */

type FieldContextValue = { describedBy?: string; invalid?: boolean }

const FieldContext = createContext<FieldContextValue>({})

export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
}: {
  label: string
  htmlFor: string
  hint?: string
  error?: string
  required?: boolean
  children: ReactNode
}) {
  const hintId = `${htmlFor}-hint`
  const errorId = `${htmlFor}-error`
  const describedBy =
    [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined

  return (
    <FieldContext.Provider value={{ describedBy, invalid: Boolean(error) }}>
      <div className="ad-field" data-error={error ? 'true' : undefined}>
        <label className="label ad-field__label" htmlFor={htmlFor}>
          {label}
          {required ? (
            <>
              <span className="ad-field__req" aria-hidden="true">
                *
              </span>
              <span className="vh"> (required)</span>
            </>
          ) : null}
        </label>

        {hint ? (
          <p className="ad-field__hint" id={hintId}>
            {hint}
          </p>
        ) : null}

        {children}

        {error ? (
          <p className="ad-field__error" id={errorId}>
            {error}
          </p>
        ) : null}
      </div>
    </FieldContext.Provider>
  )
}

/* ------------------------------------------------------------------ *
 * Text controls
 * ------------------------------------------------------------------ */

export function TextInput({
  id,
  name,
  defaultValue,
  type = 'text',
  placeholder,
  required,
  min,
  max,
  maxLength,
  error,
  autoComplete,
}: {
  id: string
  name: string
  defaultValue?: string
  type?: string
  placeholder?: string
  required?: boolean
  min?: string | number
  max?: string | number
  maxLength?: number
  error?: boolean
  /** Optional. Password managers need it on the two auth forms. */
  autoComplete?: string
}) {
  const field = useContext(FieldContext)
  const invalid = error || field.invalid

  return (
    <input
      className="ad-input"
      id={id}
      name={name}
      type={type}
      defaultValue={defaultValue}
      placeholder={placeholder}
      required={required}
      min={min}
      max={max}
      maxLength={maxLength}
      autoComplete={autoComplete}
      aria-describedby={field.describedBy}
      aria-invalid={invalid ? true : undefined}
    />
  )
}

export function TextArea({
  id,
  name,
  defaultValue,
  rows = 4,
  maxLength,
  error,
}: {
  id: string
  name: string
  defaultValue?: string
  rows?: number
  maxLength?: number
  error?: boolean
}) {
  const field = useContext(FieldContext)
  const invalid = error || field.invalid

  return (
    <textarea
      className="ad-textarea"
      id={id}
      name={name}
      defaultValue={defaultValue}
      rows={rows}
      maxLength={maxLength}
      aria-describedby={field.describedBy}
      aria-invalid={invalid ? true : undefined}
    />
  )
}

export function SelectField({
  id,
  name,
  defaultValue,
  options,
  error,
}: {
  id: string
  name: string
  defaultValue?: string
  options: { value: string; label: string }[]
  error?: boolean
}) {
  const field = useContext(FieldContext)
  const invalid = error || field.invalid

  return (
    <span className="ad-select-wrap">
      <select
        className="ad-select"
        id={id}
        name={name}
        defaultValue={defaultValue}
        aria-describedby={field.describedBy}
        aria-invalid={invalid ? true : undefined}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </span>
  )
}

export function Checkbox({
  id,
  name,
  defaultChecked,
  label,
  hint,
}: {
  id: string
  name: string
  defaultChecked?: boolean
  label: string
  hint?: string
}) {
  const hintId = `${id}-hint`

  return (
    <div className="ad-check">
      <input
        className="ad-check__box"
        type="checkbox"
        id={id}
        name={name}
        defaultChecked={defaultChecked}
        aria-describedby={hint ? hintId : undefined}
      />
      <label className="ad-check__label" htmlFor={id}>
        {label}
      </label>
      {hint ? (
        <p className="ad-check__hint" id={hintId}>
          {hint}
        </p>
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * MarkdownField
 *
 * A textarea over the subset src/lib/markdown.tsx actually renders, with a
 * toolbar that wraps the selection, a character count and a preview that
 * uses the real renderer — so what the client sees here is what the page
 * will show, not an approximation of it.
 * ------------------------------------------------------------------ */

const MD_LEGEND = '## heading · - list · 1. list · > quote · **bold** · [text](url)'

export function MarkdownField({
  id,
  name,
  defaultValue,
  rows = 12,
  label,
  hint,
  error,
}: {
  id: string
  name: string
  defaultValue?: string
  rows?: number
  label: string
  hint?: string
  error?: string
}) {
  const [value, setValue] = useState(defaultValue ?? '')
  const [preview, setPreview] = useState(false)
  const ref = useRef<HTMLTextAreaElement | null>(null)
  /** Selection to restore after a toolbar edit re-renders the textarea. */
  const pendingSelection = useRef<[number, number] | null>(null)

  useEffect(() => {
    const target = pendingSelection.current
    const el = ref.current
    pendingSelection.current = null
    if (!target || !el) return
    el.focus()
    el.setSelectionRange(target[0], target[1])
  }, [value])

  function surround(prefix: string, suffix: string, placeholder: string) {
    const el = ref.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const selected = value.slice(start, end) || placeholder
    setValue(value.slice(0, start) + prefix + selected + suffix + value.slice(end))
    pendingSelection.current = [
      start + prefix.length,
      start + prefix.length + selected.length,
    ]
  }

  /** Toggles a line prefix — '## ' or '- ' — over every touched line. */
  function prefixLines(prefix: string) {
    const el = ref.current
    if (!el) return
    const lineStart = value.lastIndexOf('\n', Math.max(0, el.selectionStart - 1)) + 1
    const nextBreak = value.indexOf('\n', el.selectionEnd)
    const lineEnd = nextBreak === -1 ? value.length : nextBreak
    const lines = value.slice(lineStart, lineEnd).split('\n')
    const already = lines.every((line) => line.startsWith(prefix))
    const rewritten = lines
      .map((line) => (already ? line.slice(prefix.length) : prefix + line))
      .join('\n')

    setValue(value.slice(0, lineStart) + rewritten + value.slice(lineEnd))
    pendingSelection.current = [lineStart, lineStart + rewritten.length]
  }

  const rendered = preview ? renderMarkdown(value) : null

  return (
    <Field label={label} htmlFor={id} hint={hint} error={error}>
      <div className="ad-md">
        <div className="ad-md__bar">
          <div className="ad-md__tools" role="group" aria-label={`${label} formatting`}>
            <button
              type="button"
              className="ad-md__tool"
              onClick={() => surround('**', '**', 'bold text')}
            >
              Bold
            </button>
            <button
              type="button"
              className="ad-md__tool"
              onClick={() => surround('*', '*', 'italic text')}
            >
              Italic
            </button>
            <button
              type="button"
              className="ad-md__tool"
              onClick={() => surround('[', '](https://)', 'link text')}
            >
              Link
            </button>
            <button
              type="button"
              className="ad-md__tool"
              aria-label="Heading"
              onClick={() => prefixLines('## ')}
            >
              H2
            </button>
            <button
              type="button"
              className="ad-md__tool"
              aria-label="Bullet list"
              onClick={() => prefixLines('- ')}
            >
              List
            </button>
          </div>

          <button
            type="button"
            className="ad-md__tool ad-md__tool--toggle"
            aria-pressed={preview}
            onClick={() => setPreview((on) => !on)}
          >
            Preview
          </button>
        </div>

        {/* Hidden, not unmounted: a hidden textarea still posts its value, so
            toggling the preview can never lose what the client typed. */}
        <div className="ad-md__edit" hidden={preview}>
          <textarea
            ref={ref}
            className="ad-textarea ad-md__area"
            id={id}
            name={name}
            rows={rows}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            aria-describedby={`${id}-legend`}
            aria-invalid={error ? true : undefined}
          />
        </div>

        {preview ? (
          <div className="ad-md__preview">
            {rendered ? (
              <div className="prose">{rendered}</div>
            ) : (
              <p className="ad-md__blank">
                Nothing to preview yet. Write something first.
              </p>
            )}
          </div>
        ) : null}

        <div className="ad-md__foot">
          <span className="mono ad-md__legend" id={`${id}-legend`}>
            {MD_LEGEND}
          </span>
          <span className="mono ad-md__count">{value.length} characters</span>
        </div>
      </div>
    </Field>
  )
}

/* ------------------------------------------------------------------ *
 * ImageField
 *
 * Posts as part of an ordinary multipart form: a file under {name}, its alt
 * text under {name}Alt, and a removal flag under {name}Remove. It never
 * uploads on its own, so a half-finished edit cannot leave an orphan file on
 * disk. An empty slot is a labelled drop zone rather than nothing, because
 * the About page's empty slots have to be findable in here even though they
 * collapse out of the public page entirely.
 * ------------------------------------------------------------------ */

export type AdminImage = {
  id: number
  path: string
  width: number
  height: number
  alt: string
  isPlaceholder?: boolean
}

/** Mirrors MAX_UPLOAD_BYTES in src/lib/storage.ts, which is the authority —
 *  that module cannot be imported here because it pulls in sharp and node:fs.
 *  This check only saves the client an upload; the server checks again. */
const MAX_BYTES = 8 * 1024 * 1024

function humanBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

const EPOCH = new Date(0)

/** SmartImage reads path, width, height and alt and nothing else. The other
 *  columns are filled with inert values so every image in the admin renders
 *  through the same component the public site uses. */
function asImageRow(image: AdminImage): ImageRow {
  return {
    id: image.id,
    path: image.path,
    width: image.width,
    height: image.height,
    alt: image.alt,
    mimeType: 'image/webp',
    bytes: 0,
    isPlaceholder: image.isPlaceholder ?? false,
    createdAt: EPOCH,
  }
}

export function ImageField({
  name,
  label,
  image,
  hint,
  aspect = 'square',
}: {
  name: string
  label: string
  image: AdminImage | null
  hint?: string
  aspect?: 'square' | 'portrait' | 'auto'
}) {
  const fileId = `${name}-file`
  const altId = `${name}Alt`
  const removeId = `${name}Remove`

  const [chosen, setChosen] = useState<{ url: string; label: string } | null>(null)
  const [tooBig, setTooBig] = useState<string | null>(null)
  const [removing, setRemoving] = useState(false)
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)

  // The cleanup closes over the previous value, so replacing or unmounting
  // revokes the URL that is going away and never the live one.
  useEffect(() => {
    if (!chosen) return
    const url = chosen.url
    return () => URL.revokeObjectURL(url)
  }, [chosen])

  function take(files: FileList | null) {
    const file = files?.[0]
    if (!file) {
      setChosen(null)
      setTooBig(null)
      return
    }
    if (file.size > MAX_BYTES) {
      setTooBig(
        `That image is ${humanBytes(file.size)}. The limit is ${humanBytes(
          MAX_BYTES,
        )} — export it again at a smaller size, or save it as a JPEG.`,
      )
      setChosen(null)
      if (fileRef.current) fileRef.current.value = ''
      return
    }
    setTooBig(null)
    setRemoving(false)
    setChosen({ url: URL.createObjectURL(file), label: file.name })
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragging(false)
    const file = event.dataTransfer.files?.[0]
    const input = fileRef.current
    if (!file || !input) return
    try {
      const transfer = new DataTransfer()
      transfer.items.add(file)
      input.files = transfer.files
    } catch {
      // A browser that will not let us write to the input still has the
      // file picker, which is why the input is always visible.
      return
    }
    take(input.files)
  }

  const showsExisting = Boolean(image) && !removing && !chosen
  const altRequired = Boolean(chosen) || showsExisting

  return (
    <div className="ad-image" data-aspect={aspect}>
      <span className="label ad-image__label">{label}</span>
      {hint ? <p className="ad-field__hint">{hint}</p> : null}

      <div className="ad-image__grid">
        <div
          className="ad-drop"
          data-drag={dragging ? 'true' : undefined}
          data-filled={chosen || showsExisting ? 'true' : undefined}
          onDragOver={(event) => {
            event.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          {chosen ? (
            // A local blob preview, not site content: it has no stored row
            // and no intrinsic dimensions to read.
            // eslint-disable-next-line @next/next/no-img-element
            <img className="ad-drop__preview" src={chosen.url} alt="" />
          ) : showsExisting && image ? (
            <SmartImage
              image={asImageRow(image)}
              sizes="(max-width: 900px) 60vw, 240px"
              alt={image.alt}
            />
          ) : (
            <span className="ad-drop__empty">
              <span className="label ad-drop__title">
                {removing ? 'Marked for removal' : 'Empty slot'}
              </span>
              <span className="ad-drop__hint">
                {removing
                  ? 'Save to clear it, or untick "Remove image" to keep it.'
                  : 'Drop an image here, or choose a file.'}
              </span>
            </span>
          )}
        </div>

        <div className="ad-image__side">
          {image?.isPlaceholder && !chosen ? (
            <p className="ad-flag label">Placeholder — replace this</p>
          ) : null}

          <div className="ad-field">
            <label className="label ad-field__label" htmlFor={fileId}>
              Image file
            </label>
            <input
              ref={fileRef}
              className="ad-file"
              id={fileId}
              name={name}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif,image/tiff"
              onChange={(event) => take(event.target.files)}
              aria-describedby={`${fileId}-hint`}
            />
            <p className="ad-field__hint" id={`${fileId}-hint`}>
              JPEG, PNG, WebP or AVIF, up to {humanBytes(MAX_BYTES)}. It is resized and
              converted on save.
            </p>
            {tooBig ? <p className="ad-field__error">{tooBig}</p> : null}
            {chosen ? (
              <p className="mono ad-image__chosen">
                {chosen.label} — saved when you save the form
              </p>
            ) : null}
          </div>

          <Field
            label="Alt text"
            htmlFor={altId}
            required={altRequired}
            hint="Describe what is in the picture for someone who cannot see it."
          >
            <TextInput
              id={altId}
              name={altId}
              defaultValue={image?.alt ?? ''}
              maxLength={180}
              required={altRequired}
            />
          </Field>

          {image ? (
            <div className="ad-check">
              <input
                className="ad-check__box"
                type="checkbox"
                id={removeId}
                name={removeId}
                checked={removing}
                onChange={(event) => setRemoving(event.target.checked)}
              />
              <label className="ad-check__label" htmlFor={removeId}>
                Remove image
              </label>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * RepeaterField
 *
 * Tracklists, streaming links, social links, emails, artist links. The whole
 * set posts as ONE hidden input holding JSON, so the server action does a
 * single JSON.parse instead of unpicking indexed field names.
 * ------------------------------------------------------------------ */

export type RepeaterColumn = {
  key: string
  label: string
  placeholder?: string
  type?: string
  width?: string
}

export function RepeaterField({
  name,
  label,
  hint,
  columns,
  rows,
  addLabel,
}: {
  name: string
  label: string
  hint?: string
  columns: RepeaterColumn[]
  rows: Record<string, string>[]
  addLabel: string
}) {
  const blank = (): Record<string, string> =>
    Object.fromEntries(columns.map((column) => [column.key, '']))

  const [items, setItems] = useState<Record<string, string>[]>(() =>
    rows.map((row) => ({ ...blank(), ...row })),
  )
  const [focusRow, setFocusRow] = useState<number | null>(null)
  const boxRef = useRef<HTMLDivElement | null>(null)

  // Adding a row moves focus into it; removing one puts focus on the row that
  // took its place. Without this the keyboard user is dropped at the top.
  useEffect(() => {
    if (focusRow === null) return
    setFocusRow(null)
    const row = boxRef.current?.querySelectorAll('.ad-repeater__row').item(focusRow)
    const input = row?.querySelector('input')
    if (input instanceof HTMLInputElement) input.focus()
  }, [focusRow])

  const template = `${columns.map((column) => column.width ?? 'minmax(0, 1fr)').join(' ')} auto`
  const gridStyle = { '--ad-cols': template } as CSSProperties

  function setCell(index: number, key: string, value: string) {
    setItems((current) =>
      current.map((row, i) => (i === index ? { ...row, [key]: value } : row)),
    )
  }

  function addRow() {
    setItems((current) => [...current, blank()])
    setFocusRow(items.length)
  }

  function removeRow(index: number) {
    setItems((current) => current.filter((_, i) => i !== index))
    setFocusRow(Math.max(0, Math.min(index, items.length - 2)))
  }

  function move(index: number, delta: number) {
    const target = index + delta
    if (target < 0 || target >= items.length) return
    setItems((current) => {
      const next = [...current]
      const a = next[index]
      const b = next[target]
      if (!a || !b) return current
      next[index] = b
      next[target] = a
      return next
    })
    setFocusRow(target)
  }

  return (
    <div className="ad-repeater" ref={boxRef}>
      <div className="ad-repeater__top">
        <span className="label ad-repeater__label">{label}</span>
        <span className="mono ad-repeater__count">
          {items.length} {items.length === 1 ? 'row' : 'rows'}
        </span>
      </div>
      {hint ? <p className="ad-field__hint">{hint}</p> : null}

      {/* One hidden input carries the whole set. */}
      <input type="hidden" name={name} value={JSON.stringify(items)} />

      {items.length === 0 ? (
        <p className="ad-repeater__empty">
          Nothing here yet. Add the first row and it appears on the site as soon as you
          save.
        </p>
      ) : (
        <>
          <div className="ad-repeater__head" style={gridStyle} aria-hidden="true">
            {columns.map((column) => (
              <span className="label" key={column.key}>
                {column.label}
              </span>
            ))}
            <span className="label">Order</span>
          </div>

          <ul className="ad-repeater__rows">
            {items.map((row, index) => (
              <li className="ad-repeater__row" key={index} style={gridStyle}>
                {columns.map((column) => (
                  <input
                    key={column.key}
                    className="ad-input ad-input--sm ad-repeater__cell"
                    type={column.type ?? 'text'}
                    value={row[column.key] ?? ''}
                    placeholder={column.placeholder}
                    aria-label={`${column.label}, row ${index + 1}`}
                    onChange={(event) => setCell(index, column.key, event.target.value)}
                  />
                ))}

                <span className="ad-repeater__tools">
                  <button
                    type="button"
                    className="ad-iconbtn"
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    aria-label={`Move row ${index + 1} up`}
                  >
                    <span aria-hidden="true">↑</span>
                  </button>
                  <button
                    type="button"
                    className="ad-iconbtn"
                    onClick={() => move(index, 1)}
                    disabled={index === items.length - 1}
                    aria-label={`Move row ${index + 1} down`}
                  >
                    <span aria-hidden="true">↓</span>
                  </button>
                  <button
                    type="button"
                    className="ad-iconbtn ad-iconbtn--drop"
                    onClick={() => removeRow(index)}
                    aria-label={`Remove row ${index + 1}`}
                  >
                    <span aria-hidden="true">✕</span>
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <button type="button" className="btn btn--sm ad-repeater__add" onClick={addRow}>
        {addLabel}
      </button>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * StatusToggle
 *
 * Two radios, not two buttons: the browser already gives radios arrow-key
 * navigation, a group role and a value that posts with the form.
 * ------------------------------------------------------------------ */

export function StatusToggle({
  name,
  value,
}: {
  name: string
  value: 'draft' | 'published'
}) {
  const options = [
    { value: 'draft', label: 'Draft' },
    { value: 'published', label: 'Published' },
  ] as const

  return (
    <div className="ad-toggle" role="group" aria-label="Status">
      {options.map((option) => (
        <span className="ad-toggle__seg" key={option.value}>
          <input
            className="ad-toggle__input"
            type="radio"
            id={`${name}-${option.value}`}
            name={name}
            value={option.value}
            defaultChecked={value === option.value}
          />
          <label className="ad-toggle__label" htmlFor={`${name}-${option.value}`}>
            {option.label}
          </label>
        </span>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * OrderButtons
 *
 * Two one-button forms, so reordering works with JS disabled and each button
 * carries its own server action. Keep it OUTSIDE any other form — nested
 * forms are invalid HTML and the browser drops the inner one.
 * ------------------------------------------------------------------ */

type FormAction = (formData: FormData) => void | Promise<void>

export function OrderButtons({
  upAction,
  downAction,
}: {
  upAction: unknown
  downAction: unknown
}) {
  return (
    <span className="ad-order">
      <form action={upAction as FormAction}>
        <button type="submit" className="ad-iconbtn" aria-label="Move up">
          <span aria-hidden="true">↑</span>
        </button>
      </form>
      <form action={downAction as FormAction}>
        <button type="submit" className="ad-iconbtn" aria-label="Move down">
          <span aria-hidden="true">↓</span>
        </button>
      </form>
    </span>
  )
}

/* ------------------------------------------------------------------ *
 * FormError
 * ------------------------------------------------------------------ */

export function FormError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p className="ad-formerror" role="alert">
      {message}
    </p>
  )
}

/* ------------------------------------------------------------------ *
 * DangerButton
 *
 * Arms on the first click and only submits on the second. No native
 * confirm(): it cannot be styled, it cannot be read in context, and it is
 * the one dialog on the site nobody designed.
 * ------------------------------------------------------------------ */

export function DangerButton({
  children,
  confirmLabel,
}: {
  children: ReactNode
  confirmLabel: string
}) {
  const [armed, setArmed] = useState(false)
  const confirmRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (armed) confirmRef.current?.focus()
  }, [armed])

  if (!armed) {
    return (
      <button
        type="button"
        className="btn btn--sm ad-danger"
        onClick={() => setArmed(true)}
      >
        {children}
      </button>
    )
  }

  return (
    <span className="ad-danger__confirm">
      <button
        ref={confirmRef}
        type="submit"
        className="btn btn--sm ad-danger ad-danger--armed"
      >
        {confirmLabel}
      </button>
      <button
        type="button"
        className="btn btn--sm btn--ghost"
        onClick={() => setArmed(false)}
      >
        Keep it
      </button>
    </span>
  )
}
