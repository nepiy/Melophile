/**
 * Smoke checks for the two pieces of logic that carry real risk and cannot be
 * caught by the type checker:
 *
 *   1. the Markdown-subset renderer — it must never emit HTML from author text,
 *      never follow a dangerous URL scheme, and never hang. It DID hang once:
 *      a module-level /g regex shared across a recursive function rewinds its
 *      own lastIndex forever on nested emphasis. That is exactly the kind of
 *      bug that reaches production, so it is pinned here.
 *   2. the booking schema — the public form and the server action both depend
 *      on it, and a silent validation change means either spam or lost bookings.
 *
 * Run with:  npm run check
 */
import { createElement, Fragment } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { renderMarkdown, safeUrl } from '../src/lib/markdown'
import { bookingSchema } from '../src/lib/validation'
import { todayIso } from '../src/lib/format'

let failures = 0

function check(name: string, condition: boolean, detail = '') {
  if (condition) {
    console.log(`  ok   ${name}`)
  } else {
    failures++
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

function html(src: string): string {
  const el = renderMarkdown(src)
  return el ? renderToStaticMarkup(createElement(Fragment, null, el)) : ''
}

console.log('\nMarkdown renderer')

// Author text can only ever become a text node.
check(
  'script tags are escaped, not emitted',
  !html('<script>alert(1)</script>').includes('<script'),
)
// The point is that no ELEMENT is created. The characters "onerror=" surviving
// inside an escaped text node is harmless — "<img" surviving would not be.
check(
  'no element is created from raw html',
  !html('<img src=x onerror="alert(1)">').includes('<img'),
)
check(
  'attribute quotes are escaped',
  html('<img src=x onerror="alert(1)">').includes('&quot;'),
)
check('raw tags are escaped', html('a <b>c</b>').includes('&lt;b&gt;'))

// Dangerous schemes never become an href.
check('javascript: is refused', !html('[x](javascript:alert(1))').includes('href'))
check('data: is refused', !html('[x](data:text/html,<b>)').includes('href'))
check('vbscript: is refused', !html('[x](vbscript:msgbox)').includes('href'))
check(
  'refused links keep their text',
  html('[click](javascript:alert(1))').includes('click'),
)

// Real links survive, including the awkward ones.
check(
  'https links work',
  html('[x](https://example.com)').includes('href="https://example.com/"'),
)
check(
  'external links get rel=noopener',
  html('[x](https://example.com)').includes('rel="noopener noreferrer"'),
)
check('mailto works', html('[x](mailto:a@b.co)').includes('href="mailto:a@b.co"'))
check('relative links work', html('[x](/music)').includes('href="/music"'))
check(
  'parenthesised URLs are not truncated',
  html('[t](https://en.wikipedia.org/wiki/Tape_(recording))').includes(
    'Tape_(recording)"',
  ),
)

// The hang regression. If the shared-regex bug returns, this never returns.
check('nested emphasis terminates', html('**bold *and italic* here**').includes('<em>'))
check(
  'emphasis around a link terminates',
  html('**[l](https://e.com)**').includes('<strong>'),
)
check('runaway asterisks terminate', typeof html('*'.repeat(200)) === 'string')

// Blocks.
check('headings render', html('## Hi').startsWith('<h2>'))
check('lists render', html('- a\n- b').includes('<li>a</li>'))
check('quotes render', html('> q').includes('blockquote'))
check('rules render', html('---').includes('<hr'))
check('blank input renders nothing', renderMarkdown('   ') === null)

console.log('\nsafeUrl')
check('javascript: -> null', safeUrl('javascript:alert(1)') === null)
check('data: -> null', safeUrl('data:text/html,x') === null)
check('empty -> null', safeUrl('  ') === null)
check('anchor kept', safeUrl('#book') === '#book')

console.log('\nBooking schema')

const valid = {
  name: 'Priya Raman',
  email: 'Priya@Example.com ',
  phone: '07700 900412',
  date: todayIso(),
  time: '13:00',
  sessionType: 'recording',
  durationHours: '6',
  people: '5',
  notes: 'Five-piece, tracking live.',
  referenceUrl: 'https://example.com/demo',
  company: '',
  elapsedMs: '9000',
}

const ok = bookingSchema.safeParse(valid)
check('a good request passes', ok.success)
check(
  'email is lower-cased and trimmed',
  ok.success && ok.data.email === 'priya@example.com',
)
check(
  'numbers are coerced',
  ok.success && ok.data.durationHours === 6 && ok.data.people === 5,
)

const reject = (patch: Record<string, unknown>, label: string) =>
  check(label, !bookingSchema.safeParse({ ...valid, ...patch }).success)

reject({ email: 'not-an-email' }, 'a malformed email is refused')
reject({ date: '2020-01-01' }, 'a past date is refused')
reject({ time: '03:00' }, 'a time outside opening hours is refused')
reject({ durationHours: '99' }, 'an absurd duration is refused')
reject({ people: '0' }, 'zero people is refused')
reject({ name: 'A' }, 'a one-character name is refused')
reject({ referenceUrl: 'javascript:alert(1)' }, 'a dangerous reference link is refused')
reject({ company: 'spam' }, 'the honeypot blocks bots')
reject({ elapsedMs: '200' }, 'an instant submission is blocked')

check(
  'a blank phone is allowed',
  bookingSchema.safeParse({ ...valid, phone: '' }).success,
)
check(
  'a blank reference link is allowed',
  bookingSchema.safeParse({ ...valid, referenceUrl: '' }).success,
)

console.log(
  failures === 0
    ? '\nAll content checks passed.\n'
    : `\n${failures} check${failures === 1 ? '' : 's'} failed.\n`,
)
process.exit(failures === 0 ? 0 : 1)
