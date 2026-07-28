# Melophile Records — design plan

Written before any code. Pass 1 is the plan; pass 2 (at the bottom) is the critique of the plan
against the brief; only then does the build start.

---

## 0. The bracketed decisions, made

The brief left five things in brackets. A client paying for a point of view does not want those
handed back as questions, so here they are, decided, with reasons.

| Bracket                     | Decision                                                                                                 | Why                                                                                                                                                                                                                                                                                                         |
| --------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Roster                      | **Placeholders** — 6 invented artists, 9 releases, real-looking catalog numbers                          | The client swaps them in the admin in minutes. Every placeholder is flagged as such _in the admin only_; the public site never says "placeholder".                                                                                                                                                          |
| Voice                       | **Confident and technical, with one warm room**                                                          | The label is a studio. Studios earn trust by sounding like they know the gear. `/about` is the exception — that page is allowed to be human, because a story told in spec-sheet voice is a brochure.                                                                                                        |
| Audience                    | **Primary: artists booking studio time.** Secondary: fans finding releases. Tertiary: A&R and press.     | This ranking decides real things: "Book the studio" is the only filled button on the site; the catalog is browsable without a click; and press-facing detail (catalog numbers, credits, release dates) is present but never in the way.                                                                     |
| Admin stack                 | **Custom admin** — Next.js route handlers + server actions, SQLite via Drizzle, hand-rolled session auth | See §7. Short version: a hosted CMS cannot be handed over as working software. It needs an account the client does not have yet, a project ID, and API tokens, and the site is broken until someone signs up. This runs on `npm run dev` with nothing external, and swaps to Postgres by changing one file. |
| Music section count on home | **4**                                                                                                    | The home page's job is to make you scroll to `/music`, not to be `/music`. Four large sleeves beat eight small ones.                                                                                                                                                                                        |

---

## 1. Colour tokens

The instruction was 4–6 named values, a near-black _with a hue_, greys that hold separation at low
luminance, one accent, and explicitly **not** acid green or vermilion on black.

The reference image is not "a dark website". It is **an unlit live room** — a room lined with wood
and acoustic panel, with one incandescent lamp left on in the control room next door. That is a warm
darkness, and its shadows carry the hue of tape oxide, not the blue of a screen.

```
--room    #0F0C0A   near-black base. HSL 24° 20% 5%. Oxide undertone — a real hue, not #000.
--rack    #1A1613   panel surface: cards, rack units, form fields, dialog bodies.
--score   #2A2320   hairline rules. The engraved line between two panels.
--dust    #968A82   secondary text: labels, meta, dates, captions.
--tape    #E8E1D9   primary text. Warm off-white — the colour of a tape box label, not #FFF.
--lamp    #D98E2B   THE accent. Amber lamp glow. Focus rings, active states, the scope trace.
```

Six values. Plus one reserved signal, which is not part of the palette and never used as decoration:

```
--peak     #CF3A24  signal red. Only ever: the REC dot, an over-level meter segment, a hairline
                    on an errored field, and the confirm state of a destructive admin action.
--peak-lit #E8604A  the same red, lightened purely so error *text* clears 4.5:1 (see below).
```

### Measured contrast — actually computed, not eyeballed

WCAG 2.1 relative luminance, `(L1+0.05)/(L2+0.05)`:

| Pair                 | Ratio       | Needs     |                                                       |
| -------------------- | ----------- | --------- | ----------------------------------------------------- |
| `tape` on `room`     | **15.04:1** | 4.5       | body, headings                                        |
| `tape` on `rack`     | **13.87:1** | 4.5       | body on panels                                        |
| `dust` on `room`     | **5.81:1**  | 4.5       | labels, meta, 11px mono                               |
| `dust` on `rack`     | **5.35:1**  | 4.5       | meta on panels                                        |
| `lamp` on `room`     | **7.29:1**  | 4.5 / 3.0 | accent text, focus ring                               |
| `peak` on `room`     | 3.98:1      | 3.0       | **fails 4.5 — so it is never text.** dot/rule only    |
| `peak-lit` on `room` | **5.76:1**  | 4.5       | error text                                            |
| `score` on `room`    | 1.26:1      | —         | hairline; intentionally near-invisible until you look |

`peak` failing 4.5:1 is exactly the kind of thing a dark theme ships broken. It is caught here, and
the fix is a second red for text — not a bigger font size and a shrug.

### The one deliberate structural choice

`rack` is only **1.085:1** against `room`. Cards will barely separate from the background by fill,
and that is on purpose: **surfaces separate by hairline, not by lift.** There are no drop shadows
anywhere on this site. Panels in a rack are divided by engraved lines and screw holes, not by
elevation. Every "card" is a `--score` hairline box on the same near-black. This one rule is what
keeps the site from looking like Material Design painted dark.

### Where the cold went

A monochrome warm palette risks reading _sepia / vintage_, which is the wrong century. The fix is
narrative rather than a second accent: **cold exists only while the signal is untuned.** The hero's
chromatic separation is real R/G/B channel offsetting, so during the first 600ms there are genuine
cyan and magenta fringes on the letterforms — and they resolve out at lock. Cold is the fault
condition; warm is the locked signal. A phosphor-cyan accent was considered and rejected: it would
have made the palette prettier and the story worse.

---

## 2. Type — three roles, three objects in the room

Not Inter. Not Space Grotesk. Each role maps to a physical piece of typography you would find in a
control room, which is why the pairing holds together.

**Display — Archivo (variable, `wght` 100–900 + `wdth` 62–125)**
_The engraved brand plate on the console._ Archivo is a grotesque drawn for signage and legal
print: flat terminals, near-zero stroke contrast, tight apertures, squarish bowls. That is precisely
the lettering vocabulary silkscreened onto a mixing desk. The `wdth` axis is the reason it beat a
condensed gothic — the wordmark sits at `wdth 118` (expanded, panel-engraved) while section heads sit
at `wdth 104`, so one download covers the whole display range with two different personalities.

> Engineering note: `wdth` is set **statically and never animated.** Animating a width axis changes
> glyph advance widths, which is layout, which is thrash. The brief's transform/opacity/filter rule
> is respected by treating the axis as a design decision, not a motion channel.

**Body — Newsreader (variable, `opsz` 6–72 + `wght` 200–800)**
_The manual, and the liner notes._ A serif for body copy on near-black is the single fastest way to
stop looking like a dark SaaS template, and it is the right voice for `/about`. Light-on-dark reads
optically heavier than it measures, so body runs at **`wght 380`, not 400** — a real fractional
weight, available because the font is variable — and the `opsz` axis is set per size so small text
gets the sturdier drawing and the large pull-quote gets the finer one. This is the "watch optical
weight" note in the brief, answered with an axis instead of a guess.

**Utility — IBM Plex Mono (300 / 400 / 500)**
_The silkscreened channel strip._ Drawn out of IBM's typewriter and terminal lineage — it is
literally equipment typography. It carries catalog numbers, dates, durations, timecode, meter
readouts, gain markings, the `IN → EQ → COMP → OUT` strip.

**And the decision that makes the whole thing cohere:** the site's _chrome_ is set in the utility
mono, not the body face. Nav, buttons, filters, form labels, table headers — all mono, 11px, caps,
`0.14em` tracked. Prose is the serif. Only headings are the grotesque. The result is that navigating
the site feels like operating a device, and reading it feels like reading a manual, and those are two
different sensations on purpose.

Loading: all three via `next/font/google`, which subsets and self-hosts them at build time (no
runtime request to Google). `display: 'swap'` plus Next's automatic fallback-metric adjustment, and
`preload: true` on **Archivo only** — the wordmark is the one thing that must never flash in a system
face, and preloading all three would waste the budget.

---

## 3. Spacing, grid, motion tokens

**A rack unit is the module.** 1U of rack space is 1.75in ≈ 44mm, so `--u: 44px`. Section padding is
`2U / 4U / 8U`. Vertical rhythm is traceable to a real object rather than to an 8-point grid.

```
--u: 44px                    1 rack unit
--gap: 24px                  gutter
--hair: 1px                  every rule on the site. never 2px.
--max: 1320px                content max width
--strip: 56px                left channel-strip gutter (>=1024px only)
```

**Motion.** Four durations, three easings, all named after what they do:

```
--t-flick:   90ms    a relay closing. lock transient, overshoot return, button press.
--t-quick:  180ms    hover, focus, filter change.
--t-ease:   420ms    scroll reveal, dialog open.
--t-settle: 900ms    the span a staggered group takes end to end.

--ease-gear:      cubic-bezier(.16, 1, .3, 1)     decelerating, mechanical
--ease-transient: cubic-bezier(.2, .9, .1, 1)     stiff, overshoot-capable
--step-crush:     steps(3, end)                   quantised. bit-crush only.
```

**Hero timeline** — one exported constant, tunable in one place (`src/components/hero/timeline.ts`):

```
0ms ─────── 620 ─────────────────────── 2280 ── 2450 ──── 2600 ──────► idle
   INPUT            PROCESSING              LOCK   settle
   ├ chromatic      ├ delay line 620–2280    │
   │  split         ├ filter sweep 760–2100  ├ transient @2280
   ├ band break     └ bit-crush 2050–2170    └ overshoot 2280–2450
   └ scanline
                                        total 3.10s — inside the 2.5–3.5s window
```

---

## 4. Layout — one concept, then wireframes

**Site concept, one sentence:** _the site is a rack_ — every page is a stack of rack units divided by
hairlines, each unit labelled on the left in mono caps like a channel strip, with a persistent
tick-marked gutter running down the left edge of the viewport.

That gutter is what makes the hero's instrumentation feel native instead of a one-off stunt: the
hairlines and mono label strips around the wordmark are the same hairlines and label strips that
structure `/music` and `/admin`.

### `/` Home

```
┌─ ┬───────────────────────────────────────────────────────────┐
│  │  MELOPHILE ○ REC                          MUSIC ARTISTS…  │  ← nav: mono 11 caps
│ ─┤                                                          │
│  │        ┌ IN ─── EQ ─── COMP ─── OUT ┐        ╭──────╮     │  signal chain strip
│ ─┤                                              │ VU ↗ │     │  needle on the envelope
│ M│         L I M I T L E S S                    ╰──────╯     │
│ A│         R E C O R D S                                     │  ← wordmark, wdth 118
│ S│        ╱╲__╱╲_╱╲___╱╲__ oscilloscope trace ___            │
│ T│        −20 −10 −7 −5 −3 0 +3        MLPHL ▸ 00:00:03:04   │  gain marks / timecode
│ E│                                                          │
│ R│                          ↓ scroll                         │
├─ ┼───────────────────────────────────────────────────────────┤  ─── hairline
│  │ 02 · MUSIC                                               │
│ C│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐             │  4 up desktop
│ H│  │  art   │ │  art   │ │  art   │ │  art   │             │  2 up tablet
│ 0│  └────────┘ └────────┘ └────────┘ └────────┘             │  1 up ≤520
│ 2│  Title      Title      Title      Title                  │
│  │  Artist     Artist     Artist     Artist                 │
│  │                                        See all music →   │
├─ ┼───────────────────────────────────────────────────────────┤
│  │ 03 · OUR SERVICES                                        │
│ C│  ┌──────────────┬──────────────┬──────────────┐          │  hairline-divided,
│ H│  │ Recording    │ Mixing       │ Mastering    │          │  not carded
│ 0│  │ one line     │ one line     │ one line     │          │
│ 3│  ├──────────────┼──────────────┼──────────────┤          │
│  │  │ Production   │ Artist dev.  │ Release      │          │
│  │  └──────────────┴──────────────┴──────────────┘          │
├─ ┼───────────────────────────────────────────────────────────┤
│  │ 04 · CONTACT                                             │
│ C│  address          bookings@…        +1 …                 │
│ H│  hours            press@…           socials              │
│ 0│                                                          │
│ 4│              [ Book the studio ]                          │  the only filled button
└─ ┴───────────────────────────────────────────────────────────┘
```

### `/music`

```
┌─ ┬───────────────────────────────────────────────────────────┐
│  │  CATALOGUE                              9 RELEASES        │
│  │  [ ALL ] ALBUM  EP  SINGLE      ARTIST ▾   YEAR ▾         │
├─ ┼───────────────────────────────────────────────────────────┤
│  │  ┌────────┐  ┌────────┐  ┌────────┐                      │
│  │  │  art   │  │  art   │  │  art   │   ← 3 up, big art    │
│  │  └────────┘  └────────┘  └────────┘                      │
│  │  MLPHL-007   MLPHL-006   MLPHL-005     ← mono, --lamp     │
│  │  Title       Title       Title                            │
│  │  Artist · ALBUM · 2025                                    │
└─ ┴───────────────────────────────────────────────────────────┘
  click → dialog: large art | title, artist, type, date, cat no.
                            | description (rich text)
                            | TRACKLIST  01 … 02 …   (mono, durations right-aligned)
                            | CREDITS
                            | ▸ Spotify  ▸ Apple  ▸ YouTube  ▸ Bandcamp
```

### `/artists` — photos and nothing else

```
┌─ ┬───────────────────────────────────────────────────────────┐
│  │  ARTISTS                                6 COLLABORATORS   │
├─ ┼───────────────────────────────────────────────────────────┤
│  │  ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐                 │  uniform 4:5
│  │  │       │ │       │ │       │ │       │                 │  duotone amber/room
│  │  │ photo │ │ photo │ │ photo │ │ photo │                 │  → full colour on hover
│  │  │       │ │       │ │       │ │       │                 │
│  │  │ NAME  │ │       │ │       │ │       │                 │  name on hover/focus only
│  │  └───────┘ └───────┘ └───────┘ └───────┘                 │
└─ ┴───────────────────────────────────────────────────────────┘
  No bios on the page. Each tile is a <button>. Click → dialog (desktop) /
  full-screen sheet (mobile): big photo, name, role, description, links,
  and "Appears on" pulled from Release data.
```

### `/about` — Our story

```
┌─ ┬───────────────────────────────────────────────────────────┐
│  │  OUR STORY                    EST. 2016 · 9 RELEASES      │  ← mono line
├─ ┼───────────────────────────────────────────────────────────┤
│  │        long-form serif prose, 64ch measure, left of a     │
│  │        column that photos drop into when they exist       │
│  │                                    ┌──────────────┐      │
│  │        …                           │ photo slot 1 │      │
│  │                                    └──────────────┘      │
│  │        …                                                 │
└─ ┴───────────────────────────────────────────────────────────┘
  Zero photos today → prose recentres to a single 68ch column and the photo
  column does not exist in the DOM. No empty boxes, no broken icons.
  In the admin the same slots render as visible, labelled, obviously-fillable drop zones.
```

### `/contact`

```
┌─ ┬───────────────────────────────────────────────────────────┐
│  │  CONTACT                                                  │
│  │  ADDRESS          EMAIL                PHONE              │
│  │  …                general@  bookings@  +1 …               │
│  │  HOURS            SOCIALS              [ map, optional ]  │
├─ ┼───────────────────────────────────────────────────────────┤
│  │  BOOK THE STUDIO                                          │
│  │  Name ______________   Email _____________                │
│  │  Phone _____________   People ____                        │
│  │  Date ______  Time ____  Session type [rec|mix|mst|reh]   │
│  │  Length __ h                                              │
│  │  Notes ________________________________________          │
│  │  Reference link ______________________________            │
│  │              [ Send request ]  ← produces "Request sent."  │
└─ ┴───────────────────────────────────────────────────────────┘
  Any field the client leaves blank in the admin simply is not rendered.
  Dates the client blacks out are rejected client- and server-side.
```

### `/admin`

```
┌───────────┬───────────────────────────────────────────────────┐
│ MELOPHILE │  RELEASES                          [ + New ]      │
│  ─────    │  ┌──────────────────────────────────────────────┐ │
│  Bookings │  │ ⇅ art  MLPHL-007  Title      ALBUM  PUBLISHED│ │
│    3 new  │  │ ⇅ art  MLPHL-006  Title      EP     DRAFT    │ │
│  Releases │  └──────────────────────────────────────────────┘ │
│  Artists  │                                                   │
│  Services │  reorder with ⇅, draft/publish toggle per row      │
│  About    │                                                   │
│  Contact  │                                                   │
│  Settings │                                                   │
│  Blackouts│                                                   │
└───────────┴───────────────────────────────────────────────────┘
  Same hairlines, same mono, same palette as the public site — the client should
  feel like they are operating the same machine, not a different product.
```

---

## 5. The signature

> **The wordmark that tunes itself in:** MELOPHILE RECORDS arrives as an untuned, chromatically
> split signal, visibly passes through a real delay line, a left-to-right filter sweep that resolves
> the glyphs one at a time, and a two-frame bit-crush — then snaps to lock on a single hard transient
> while a hairline VU needle kicks against the stop and the `IN → EQ → COMP → OUT` strip lights
> stage by stage, because the instrumentation is driven by the same envelope as the type.

The last clause is the whole idea. The meters are not decoration next to an animation; they are a
readout **of** the animation. One `rAF` loop owns one envelope value, and the needle, the scope
amplitude, the chain strip and the letterforms all read it. That is why it will not read as generic.

### Hero engineering, decided in advance

- **One clock.** A single `requestAnimationFrame` loop advances `t`, derives `env` and `stage`, and
  writes ~6 CSS custom properties on the hero root. Nothing else animates in JS.
- **One style write per frame.** Per-character blur for the sweep is computed _in CSS_ — each of the
  17 glyph spans carries a static `--i` and derives its own blur/offset via `calc()` from the single
  inherited `--sweep`. JS never touches 17 elements. `--sweep`, `--env`, `--split` are registered
  with `@property` as `<number>` so they interpolate and skip re-parsing.
- **Real chromatic separation**, not a text-shadow fake: three `aria-hidden` copies tinted
  `rgb(232,0,0)` / `rgb(0,225,0)` / `rgb(0,0,217)` with `mix-blend-mode: screen`, which recombine to
  exactly `--tape #E8E1D9` when the offset reaches zero. Additively correct.
- **A real delay line.** A ring buffer stores the last ~24 frames of the mark's offset; ghost tap _n_
  reads the value from `n × 90ms` ago at feedback `0.62^n`. The ghosts genuinely _trail_ the motion
  rather than smearing in place — you can see the delay time.
- **Bit-crush by SVG filter**, toggled in discrete steps (`feMorphology dilate` +
  `feComponentTransfer type="discrete"`), because quantisation should step, never ease.
- **The lock** is `--t-flick`: channels to zero in one frame, solid to one, scale 1.028 → 1.0 on
  `--ease-transient` (one frame of overshoot), a 6%-opacity flash, needle slam with real VU
  ballistics (300ms integration), REC dot lit.
- **Idle** is calm: ±0.6px / ±0.15° drift on an 11s sine, a scrolling scope trace, needle breathing on
  a sum-of-sines that looks like program material, and SMPTE timecode counting at 25fps.
- **Cursor as a hand on a knob.** Pointer proximity raises `--hand` 0→1, which scales split, ghost
  feedback and scope amplitude. `pointermove` only sets a target; the rAF loop lerps. Coarse pointers
  and reduced-motion skip it entirely.
- **Audio, off by default,** behind a real `aria-pressed` toggle. Synthesised in Web Audio — a
  filtered noise sweep plus a sine at lock, zero asset weight — and an `AnalyserNode` feeds the scope
  so unmuted, the trace is genuine frequency data. Muted, it runs on the synthetic envelope.
- **Reduced motion** does not start the loop at all: locked final state, one 400ms opacity fade,
  static trace, needle parked at −3dB.
- **Mobile degrades effect count, not frame rate:** ghosts 4 → 1, crush skipped, scope at half
  resolution, no cursor tracking. The sweep and the split stay, because they are the signature.
  Under 520px the wordmark wraps to two lines and the instrumentation reflows _below_ it — never
  cropped, never hidden.
- **Real text.** The locked layer is the actual selectable `<h1>`; the effect layers are
  `aria-hidden`. No image, no bare canvas.

---

## 6. Content model

Written out before any page code, as required. SQLite tables via Drizzle; `→` marks a relation.

```
site_settings   id, logoText, navLabels{music,artists,about,contact}, footerText,
                socialLinks[]{platform,url,order}, metaTitle, metaDescription

home            id, wordmarkLine1 ("MELOPHILE"), wordmarkLine2 ("RECORDS"),
                scrollCue, musicHeading, musicCta, servicesHeading,
                servicesIntro, contactHeading, contactCta, featuredCount(4–8)

release         id, slug, title, artistId → artist, type[album|ep|single],
                coverImageId → image, releaseDate, catalogNumber, description(md),
                tracklist[]{n,title,duration}, credits(md), featured(bool),
                status[draft|published], order, createdAt, updatedAt

artist          id, slug, name, photoId → image, shortDescription(md), role,
                links[]{label,url,order}, status[draft|published], order
                // releases derived from release.artistId + release_artist join —
                // never stored twice

release_artist  releaseId → release, artistId → artist, role   // features/guests

service         id, title, description, icon(slug from a fixed set),
                status[draft|published], order

about           id, heading ("Our story"), body(md), foundedYear,
                showCatalogCount(bool)
about_photo     id, imageId → image, caption, order        // may be empty. collapses.

contact         id, addressLines, emails[]{label,address,order}, phone, hours,
                socialLinks[]{platform,url,order}, mapEmbed, bookingIntro,
                bookingSuccessMessage, responseTime ("within two working days")

booking         id, name, email, phone, date, time, sessionType[recording|mixing|
                mastering|rehearsal], durationHours, people, notes, referenceUrl,
                status[new|confirmed|declined|done], adminNote, createdAt, ip

blackout        id, date, reason            // admin-set unavailable dates

image           id, path, width, height, alt, mimeType, bytes, createdAt
                // one row per upload. width/height stored so next/image never
                // causes layout shift. alt is required at upload time.

admin_user      id, email, passwordHash, passwordSalt, createdAt, lastLoginAt
session         id, tokenHash, userId → admin_user, expiresAt, createdAt
login_attempt   id, key(ip+email), at, ok      // rate limiting
```

Rules that fall out of this shape:

1. **Home reads `release` directly** — `where status=published order by releaseDate desc limit
home.featuredCount`. There is no second copy of the catalogue anywhere.
2. **`/about` with zero rows in `about_photo`** renders a single-column layout. The photo column is
   absent from the DOM, not hidden with CSS.
3. **`/contact` and home section 4 read the same `contact` row.** One source of truth.
4. **Artist → releases is derived**, so adding a release automatically appears in the artist's dialog.
5. **Rich text is Markdown in, React elements out.** Nothing is editable about layout, animation or
   colour — `icon` is a slug chosen from a fixed set, not a class name; there is no CSS field
   anywhere.

---

## 7. Stack, and why

| Layer     | Choice                                                            | Reason                                                                                                                                                                                                                                                    |
| --------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework | **Next.js + TypeScript, App Router**                              | The admin, the upload handler and the booking form all need a server. Server actions remove a whole API layer.                                                                                                                                            |
| Styling   | **Vanilla CSS with custom properties**, layered files             | Every rule must be traceable to a token. A token file plus `@layer` is auditable at a glance; a utility-class soup is not. The hero also needs `@property`, SVG filters and `mix-blend-mode`, which are fought rather than helped by a utility framework. |
| Data      | **SQLite + Drizzle ORM**                                          | Zero external services, instant `npm run dev`, backup is copying one file, and Drizzle's Postgres dialect makes the migration a one-file change when the client outgrows it.                                                                              |
| Auth      | **Hand-rolled: `scrypt` from `node:crypto` + DB-backed sessions** | `scrypt` is in the standard library. No auth dependency, no vendor, no upgrade treadmill, and the session table makes "log out everywhere" trivial.                                                                                                       |
| Motion    | **No GSAP, no Framer Motion**                                     | Deliberate deviation from the brief's suggestion, see below.                                                                                                                                                                                              |
| Images    | `next/image` + `sharp` on upload                                  | Resize to 3 widths, emit WebP, store intrinsic dimensions.                                                                                                                                                                                                |
| Rich text | Markdown → **React elements**, hand-written renderer              | Sanitising an HTML _string_ is a game you can lose. Rendering to React elements means user text can only ever become a text node, so injection is impossible by construction, not by allowlist.                                                           |

**Why no GSAP.** The brief suggests GSAP or Framer Motion for choreography, and normally that is
right. Here it would be a second clock. The VU needle, the scope amplitude and the chain strip must
be driven by _the animation's own envelope_ — that requirement forces one JS-owned envelope function
running on `rAF` regardless. Once that exists, a timeline library is a 70kB wrapper around a
`switch` on `t`. The choreography lives in one 60-line `timeline.ts` with named stages and exported
millisecond constants, which is also the file the handover note points at for tuning. Everything
else on the site — scroll reveals, hover, dialogs — is CSS transitions and one
`IntersectionObserver`. No WebGL anywhere; CSS filters carry the effect, as instructed.

**Why a custom admin over Sanity/Payload.** The brief calls a headless CMS the recommended default,
and for editing experience per hour of work that is true. It loses on the acceptance test. "The
client can add a new single without asking a developer" has to be true _on handover_, and a hosted
CMS is not working software until someone creates an account, a project and a token, and pastes them
into `.env`. A local Payload/Strapi instance avoids that but drags in a second admin framework and
its own migration story to manage nine tables. Nine tables and eleven forms is less work than that,
and it means the admin is styled in the label's own palette — which matters, because the client will
be in there weekly and it should feel like their studio, not a dashboard.

---

## 8. Copy principles applied

- Buttons name the outcome and the flow keeps the word: **Send request → "Request sent."**;
  **Book the studio**; **Publish**; **Save changes → "Changes saved."**
- Errors state the fact and the fix, and never apologise: _"That date is blocked out. Pick another
  day, or send a note and we'll find a slot."_
- Empty states invite: `/music` with nothing published reads **"No releases published yet. Add the
  first one from the admin."** — not "No data".
- Sentence case everywhere except the mono utility strips, which are caps because a channel strip is
  caps.
- No em-dash-and-adjective filler, no "seamless", no "elevate". Plain verbs.

---

# Pass 2 — critique of this plan against the brief

Honest read of where the plan above is strong, where it is exposed, and what I changed as a result.

**1. The palette is very warm, and that is a real risk.** Warm mono + serif + amber is one bad step
away from _artisan coffee roaster_. What separates it: hairlines instead of shadows, mono chrome
instead of friendly sans, `--tape` at 15:1 rather than a soft cream, and no rounded corners or
texture anywhere. **Change made:** border-radius is `0` on everything except the REC dot. If the
site starts feeling nostalgic in the build, the correction is to cool `--dust` toward neutral, not to
add a second accent.

**2. `rack` at 1.085:1 against `room` is either the best idea here or an accessibility trap.** It is
fine — surface fill is not a contrast requirement, and every panel is bounded by a visible hairline
so its extent is perceivable. But it means **focus states cannot rely on background change.** Focus
is a 2px `--lamp` outline with a 2px offset, everywhere, no exceptions. That is now a hard rule
rather than a nice idea.

**3. Six named font-loading variants is a performance risk against Lighthouse ≥85.** Three families,
two of them variable. **Change made:** Newsreader and Plex Mono are `preload: false` and Latin-subset
only; only Archivo preloads. Body text swapping in 100ms later is acceptable; the wordmark flashing
is not.

**4. The brief says "choose two or three effects and commit." I chose four** (split, delay, sweep,
crush) plus the lock and the idle. That is scope creep on the one element I was told to make bold, so
it is defensible — but it is also the most likely source of a dropped frame. **Change made:** the
four are explicitly ranked. Sweep and split are the signature and never degrade. Delay degrades by
tap count. Crush is the first thing dropped on mobile or if the frame budget slips. There is a single
`effectTier` value (`full | reduced | still`) derived once at mount from screen width, pointer
coarseness, `deviceMemory` and `prefers-reduced-motion`, and every effect reads it.

**5. "Everything the client can see, the client can edit" is the requirement I am most likely to
half-do.** It is easy to make releases editable and quietly hardcode the nav labels, the scroll cue,
the section headings, the response-time promise, the booking intro, the success message. **Change
made:** the `home`, `site_settings` and `contact` tables above carry every one of those strings, and
the build gets a grep check — no user-visible English string may be a literal in a public page
component. The exception list is exactly one item: the `IN → EQ → COMP → OUT` strip, which is
instrumentation, not content, and is therefore not editable, consistent with "nothing about
animation is editable."

**6. Storing uploads on the local filesystem breaks on serverless.** True, and worth stating rather
than discovering. `lib/storage.ts` is a single interface with a `LocalDiskStorage` implementation;
moving to S3/R2/Vercel Blob is one new class and one line. Noted in the handover.

**7. Email will fail silently in the wrong hands.** A booking that saves but never notifies is worse
than an error. **Change made:** the booking is committed first and the notification is attempted
second; a failed send is recorded on the booking row and the admin bookings list shows a
"not notified" flag. The client is never told "sent" when nothing was sent.

**8. The acceptance test is about memory, not about frames.** "Someone can describe the hero to a
friend." A person will not say "chromatic aberration with a per-glyph filter sweep". They will say
**"the name comes in broken and out of tune, you watch it get fixed left to right, then it clicks
into place and the little needle jumps."** That sentence is the actual spec, and the ranked effect
tiers in point 4 exist to protect precisely the parts of it a person would repeat: _broken → fixed
left to right → clicks → needle jumps._

---

_Plan ends. Build starts._
