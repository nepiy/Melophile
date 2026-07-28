import type { ReactNode } from 'react'

/* ==========================================================================
   Markdown subset → React elements.

   Why not marked + DOMPurify: sanitising an HTML *string* is a game you can
   lose, and it only takes losing once. This renderer never produces an HTML
   string and never touches dangerouslySetInnerHTML. Author text can only ever
   become a React text node, so injection is impossible by construction rather
   than by allowlist.

   Supported, because this is prose written by a label owner and nothing more:
     ## h2   ### h3   paragraphs   - lists   1. lists   > quote   ---
     **bold**   *italic*   `code`   [text](url)
   ========================================================================== */

const ALLOWED_PROTOCOLS = ['http:', 'https:', 'mailto:', 'tel:']

/** Returns a safe href, or null if the URL is anything we will not link to. */
export function safeUrl(raw: string): string | null {
  const value = raw.trim()
  if (!value) return null
  // Root-relative and same-page links are fine and carry no protocol.
  if (value.startsWith('/') || value.startsWith('#')) return value
  try {
    const url = new URL(value)
    return ALLOWED_PROTOCOLS.includes(url.protocol) ? url.toString() : null
  } catch {
    return null
  }
}

/**
 * Built fresh on every call, deliberately.
 *
 * A single module-level /g regex cannot be used here: renderInline recurses into
 * the content it matched (so `**bold *and italic***` works), and a shared regex
 * object means the inner call clobbers the outer call's `lastIndex`. The outer
 * loop then rewinds and never terminates — a hang, not an error. One regex per
 * invocation keeps the iteration state local to its own stack frame.
 */
const inlinePattern = () =>
  // The URL group allows one level of balanced parentheses so that real links
  // like .../wiki/Tape_(recording) survive instead of being cut at the first ")".
  /(\*\*)([\s\S]+?)\*\*|(\*)([^*\n]+?)\*|`([^`\n]+?)`|\[([^\]\n]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)/g

/** Emphasis nested more than a few deep is a typo, not intent. */
const MAX_INLINE_DEPTH = 6

function renderInline(text: string, key: string, depth = 0): ReactNode[] {
  if (depth > MAX_INLINE_DEPTH) return [text]

  const re = inlinePattern()
  const out: ReactNode[] = []
  let last = 0
  let i = 0

  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    // A zero-length match would spin forever; step past it.
    if (match[0].length === 0) {
      re.lastIndex += 1
      continue
    }

    if (match.index > last) out.push(text.slice(last, match.index))
    const k = `${key}-i${i++}`

    if (match[2] !== undefined) {
      out.push(<strong key={k}>{renderInline(match[2], k, depth + 1)}</strong>)
    } else if (match[4] !== undefined) {
      out.push(<em key={k}>{renderInline(match[4], k, depth + 1)}</em>)
    } else if (match[5] !== undefined) {
      out.push(
        <code key={k} className="mono">
          {match[5]}
        </code>,
      )
    } else if (match[6] !== undefined && match[7] !== undefined) {
      const href = safeUrl(match[7])
      const label = renderInline(match[6], k, depth + 1)
      out.push(
        href ? (
          <a
            key={k}
            className="link"
            href={href}
            {...(href.startsWith('http')
              ? { target: '_blank', rel: 'noopener noreferrer' }
              : {})}
          >
            {label}
          </a>
        ) : (
          // A link we refuse to follow still shows its text. Silently dropping
          // the client's words would be worse than dropping the link.
          <span key={k}>{label}</span>
        ),
      )
    }
    last = match.index + match[0].length
  }

  if (last < text.length) out.push(text.slice(last))
  return out
}

type Block =
  | { kind: 'h2' | 'h3' | 'p' | 'quote'; text: string }
  | { kind: 'ul' | 'ol'; items: string[] }
  | { kind: 'hr' }

function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n')
  const blocks: Block[] = []
  let para: string[] = []

  const flushPara = () => {
    if (para.length) {
      blocks.push({ kind: 'p', text: para.join(' ').trim() })
      para = []
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    const trimmed = line.trim()

    if (!trimmed) {
      flushPara()
      continue
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flushPara()
      blocks.push({ kind: 'hr' })
      continue
    }

    const heading = /^(#{2,3})\s+(.*)$/.exec(trimmed)
    if (heading) {
      flushPara()
      blocks.push({ kind: heading[1] === '##' ? 'h2' : 'h3', text: heading[2] ?? '' })
      continue
    }

    if (/^>\s?/.test(trimmed)) {
      flushPara()
      const quote: string[] = []
      while (i < lines.length && /^>\s?/.test((lines[i] ?? '').trim())) {
        quote.push((lines[i] ?? '').trim().replace(/^>\s?/, ''))
        i++
      }
      i--
      blocks.push({ kind: 'quote', text: quote.join(' ').trim() })
      continue
    }

    const bullet = /^[-*+]\s+(.*)$/.exec(trimmed)
    if (bullet) {
      flushPara()
      const items: string[] = []
      while (i < lines.length) {
        const m = /^[-*+]\s+(.*)$/.exec((lines[i] ?? '').trim())
        if (!m) break
        items.push(m[1] ?? '')
        i++
      }
      i--
      blocks.push({ kind: 'ul', items })
      continue
    }

    const numbered = /^\d+[.)]\s+(.*)$/.exec(trimmed)
    if (numbered) {
      flushPara()
      const items: string[] = []
      while (i < lines.length) {
        const m = /^\d+[.)]\s+(.*)$/.exec((lines[i] ?? '').trim())
        if (!m) break
        items.push(m[1] ?? '')
        i++
      }
      i--
      blocks.push({ kind: 'ol', items })
      continue
    }

    para.push(trimmed)
  }

  flushPara()
  return blocks
}

/** Renders a Markdown subset. Returns null for empty input so callers can
 *  collapse the container rather than render an empty box. */
export function renderMarkdown(src: string | null | undefined): ReactNode[] | null {
  if (!src || !src.trim()) return null
  const blocks = parseBlocks(src)
  if (!blocks.length) return null

  return blocks.map((block, n) => {
    const key = `b${n}`
    switch (block.kind) {
      case 'h2':
        return <h2 key={key}>{renderInline(block.text, key)}</h2>
      case 'h3':
        return <h3 key={key}>{renderInline(block.text, key)}</h3>
      case 'quote':
        return (
          <blockquote key={key} className="prose-quote">
            {renderInline(block.text, key)}
          </blockquote>
        )
      case 'hr':
        return <hr key={key} className="prose-rule" />
      case 'ul':
        return (
          <ul key={key} className="prose-list">
            {block.items.map((item, m) => (
              <li key={`${key}-${m}`}>{renderInline(item, `${key}-${m}`)}</li>
            ))}
          </ul>
        )
      case 'ol':
        return (
          <ol key={key} className="prose-list prose-list--ordered">
            {block.items.map((item, m) => (
              <li key={`${key}-${m}`}>
                <span className="mono prose-list__n">
                  {String(m + 1).padStart(2, '0')}
                </span>
                <span>{renderInline(item, `${key}-${m}`)}</span>
              </li>
            ))}
          </ol>
        )
      default:
        return <p key={key}>{renderInline(block.text, key)}</p>
    }
  })
}

/** Plain text, for <meta> descriptions and admin list previews. */
export function stripMarkdown(src: string | null | undefined, limit = 200): string {
  if (!src) return ''
  const flat = src
    .replace(/\r\n?/g, '\n')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/^\d+[.)]\s+/gm, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return flat.length > limit ? `${flat.slice(0, limit - 1).trimEnd()}…` : flat
}

/** Server component wrapper. `as` lets /about widen the measure. */
export function RichText({
  value,
  className,
  variant = 'default',
}: {
  value: string | null | undefined
  className?: string
  variant?: 'default' | 'story'
}) {
  const content = renderMarkdown(value)
  if (!content) return null
  return (
    <div
      className={['prose', variant === 'story' && 'prose--story', className]
        .filter(Boolean)
        .join(' ')}
    >
      {content}
    </div>
  )
}
