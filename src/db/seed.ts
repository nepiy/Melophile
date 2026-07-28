/* ==========================================================================
   Seed. Real copy, no lorem ipsum, and artwork generated in the site's palette.

   Everything here is content the client is expected to rewrite from /admin —
   that is the point. It exists so the design can be judged against a full
   catalogue on day one, and so the admin has something to practise on.

   Safe by default: refuses to run over an existing catalogue unless you pass
   --force, because nobody should be able to delete a client's releases by
   re-running a setup command.
   ========================================================================== */

import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  about,
  aboutPhotos,
  adminUsers,
  artists,
  blackouts,
  bookings,
  contact,
  db,
  home,
  images,
  releaseArtists,
  releases,
  services,
  siteSettings,
  storePage,
  eventsPage,
  events,
  products,
  type ReleaseType,
  type ServiceIcon,
  type SessionType,
  type StreamingLink,
  type Track,
  type ProductKind,
  type MusicFormat,
  type BeatLicense,
  type PreviewKind,
  type Variant,
} from './index'
import { portraitSvg, rasterise, sleeveSvg } from './seed-art'
import { hashPassword } from '../lib/auth'
import { writeUploadFile } from '../lib/storage'
import { slugify } from '../lib/format'

for (const file of ['.env.local', '.env']) {
  const path = resolve(process.cwd(), file)
  if (existsSync(path)) {
    try {
      process.loadEnvFile(path)
    } catch {
      /* malformed env file — the checks below will report what is missing */
    }
  }
}

const force = process.argv.includes('--force')
const NOW = new Date()

/* ------------------------------- content -------------------------------- */

type SeedArtist = {
  name: string
  role: string
  shortDescription: string
  links: { label: string; url: string }[]
}

/* Placeholder roster. Six acts that share nothing but a studio — the name is a
   promise about range, so the demo content has to actually demonstrate range. */
const ARTISTS: SeedArtist[] = [
  {
    name: 'Néa Solberg',
    role: 'Vocalist, producer — electronic soul',
    shortDescription:
      'Néa writes at a piano and finishes on a laptop, and you can hear both. She came in to track one demo in 2019 and has not really left. Two of her records were mixed in the small room at 2am because she prefers the way it sounds when the building is empty.',
    links: [
      { label: 'Instagram', url: 'https://www.instagram.com/melophilerecords' },
      { label: 'Bandcamp', url: 'https://bandcamp.com' },
    ],
  },
  {
    name: 'The Ossuary',
    role: 'Four-piece — post-punk',
    shortDescription:
      'Loud, tight, and completely uninterested in overdubs. We record them live in the big room with the drums up the middle and almost nothing fixed afterwards. Their second album took nine days, including the day the power went out.',
    links: [{ label: 'Instagram', url: 'https://www.instagram.com/melophilerecords' }],
  },
  {
    name: 'Ruben Adeyemi',
    role: 'Bass, composer — jazz and broken beat',
    shortDescription:
      'Ruben has played on more of this catalogue than anyone, usually without being credited on the front. When he brings his own record in, the band is different every time and the arrangements arrive finished.',
    links: [
      { label: 'Bandcamp', url: 'https://bandcamp.com' },
      { label: 'Website', url: 'https://example.com' },
    ],
  },
  {
    name: 'Halcyon Pines',
    role: 'Duo — ambient country',
    shortDescription:
      'A pedal steel, a tape machine and two people who do not rush. They cut the first record Melophile ever released, in a room that still had carpet samples stacked against the back wall.',
    links: [{ label: 'Bandcamp', url: 'https://bandcamp.com' }],
  },
  {
    name: 'MC Ferrograph',
    role: 'Rapper, engineer',
    shortDescription:
      'Engineers half the sessions here and raps on the other half. Named himself after a tape machine, which tells you most of what you need to know. Writes in the control room while someone else is tracking.',
    links: [{ label: 'YouTube', url: 'https://www.youtube.com' }],
  },
  {
    name: 'Yui Nakahara',
    role: 'Pianist, composer — modern classical',
    shortDescription:
      'Yui asked us to leave the room mics open during a break, kept the take, and built a record around it. She is the reason we stopped tidying up the noise floor.',
    links: [{ label: 'Website', url: 'https://example.com' }],
  },
]

type SeedRelease = {
  title: string
  artist: string
  type: ReleaseType
  releaseDate: string
  catalogNumber: string
  description: string
  tracklist: Track[]
  credits: string
  features?: { artist: string; role: string }[]
  streaming?: StreamingLink['platform'][]
  featured?: boolean
}

const RELEASES: SeedRelease[] = [
  {
    title: 'Roomtone',
    artist: 'Halcyon Pines',
    type: 'album',
    releaseDate: '2019-05-17',
    catalogNumber: 'MLPHL-001',
    description:
      'The first record we ever put out, cut in eleven days in a room that was still half warehouse. Pedal steel, upright piano, one tape machine and a lot of silence left in on purpose.\n\nWe nearly re-recorded the whole thing on better gear. We are glad we did not.',
    tracklist: [
      { n: 1, title: 'Carpet Samples', duration: '4:12' },
      { n: 2, title: 'Long Grass', duration: '3:48' },
      { n: 3, title: 'Roomtone', duration: '6:31' },
      { n: 4, title: 'Sixty Cycle Hum', duration: '2:57' },
      { n: 5, title: 'Ardwick, Raining', duration: '5:20' },
      { n: 6, title: 'Nothing To Fix', duration: '7:04' },
    ],
    credits:
      'Written and performed by Halcyon Pines.\n\nRecorded and mixed by **MC Ferrograph** at Melophile, Manchester.\nMastered by **Yui Nakahara**.\nUpright piano on *Long Grass* by Yui Nakahara.',
    streaming: ['bandcamp', 'spotify'],
  },
  {
    title: 'Bright Cold Morning',
    artist: 'Néa Solberg',
    type: 'ep',
    releaseDate: '2020-02-28',
    catalogNumber: 'MLPHL-002',
    description:
      'Four songs written in a fortnight and tracked in three nights, mostly after midnight. Néa played everything except the bass.',
    tracklist: [
      { n: 1, title: 'Bright Cold Morning', duration: '3:34' },
      { n: 2, title: 'Handle', duration: '4:02' },
      { n: 3, title: 'Two Streets Over', duration: '3:19' },
      { n: 4, title: 'Bright Cold Morning (Room Take)', duration: '4:41' },
    ],
    credits:
      'Written by Néa Solberg.\nBass by **Ruben Adeyemi**.\nRecorded, mixed and mastered at Melophile.',
    features: [{ artist: 'Ruben Adeyemi', role: 'Bass' }],
    streaming: ['spotify', 'apple', 'bandcamp'],
  },
  {
    title: 'Nine Bar Blues',
    artist: 'Ruben Adeyemi',
    type: 'album',
    releaseDate: '2021-03-12',
    catalogNumber: 'MLPHL-003',
    description:
      'Ruben brought in a nine-piece band, handed out charts, and we recorded the whole thing in two days with everyone in the same room. The horns are bleeding into the drum mics on every track and that is the record.',
    tracklist: [
      { n: 1, title: 'Nine Bar', duration: '6:18' },
      { n: 2, title: 'Cobalt Street', duration: '5:02' },
      { n: 3, title: 'The Long Way Round', duration: '8:47' },
      { n: 4, title: 'Charts On The Floor', duration: '4:33' },
      { n: 5, title: 'Second Take, Kept', duration: '7:15' },
    ],
    credits:
      'Composed and arranged by Ruben Adeyemi.\n\nRecorded live by **MC Ferrograph**.\nMixed by MC Ferrograph and Ruben Adeyemi.\nMastered at Melophile.',
    streaming: ['spotify', 'bandcamp', 'youtube'],
  },
  {
    title: 'Concrete Garden',
    artist: 'The Ossuary',
    type: 'single',
    releaseDate: '2021-11-05',
    catalogNumber: 'MLPHL-004',
    description:
      'One take, live, no overdubs, no edits. The band asked us not to fix the tuning on the second verse.',
    tracklist: [
      { n: 1, title: 'Concrete Garden', duration: '3:11' },
      { n: 2, title: 'Cold Shoulder', duration: '2:44' },
    ],
    credits: 'Written by The Ossuary.\nRecorded and mixed live at Melophile.',
    streaming: ['spotify', 'apple', 'youtube'],
  },
  {
    title: 'Tape Hiss Lullabies',
    artist: 'Yui Nakahara',
    type: 'album',
    releaseDate: '2022-09-16',
    catalogNumber: 'MLPHL-005',
    description:
      'Yui asked us to leave the room mics running during a coffee break. What we caught became the spine of the record: chair creaks, a bus outside, the piano still ringing.\n\nSix pieces for piano, room and tape. The noise floor is an instrument here, not a problem.',
    tracklist: [
      { n: 1, title: 'Break, Mics Open', duration: '5:44' },
      { n: 2, title: 'Lullaby For An Empty Building', duration: '7:12' },
      { n: 3, title: 'Bus, Outside', duration: '4:06' },
      { n: 4, title: 'Ferric', duration: '6:38' },
      { n: 5, title: 'Chair', duration: '3:22' },
      { n: 6, title: 'Still Ringing', duration: '9:15' },
    ],
    credits:
      'Composed and performed by Yui Nakahara.\n\nRecorded to 1/4-inch tape by **MC Ferrograph**.\nMixed by Yui Nakahara and MC Ferrograph.\nMastered by Néa Solberg.',
    features: [{ artist: 'MC Ferrograph', role: 'Engineer' }],
    streaming: ['bandcamp', 'spotify', 'apple'],
  },
  {
    title: 'Vertical Hold',
    artist: 'MC Ferrograph',
    type: 'ep',
    releaseDate: '2023-06-02',
    catalogNumber: 'MLPHL-006',
    description:
      'Written in the control room over eighteen months, in the gaps between other people’s sessions. Every beat is built from something recorded in this building.',
    tracklist: [
      { n: 1, title: 'Vertical Hold', duration: '3:27' },
      { n: 2, title: 'Between Sessions', duration: '4:10' },
      { n: 3, title: 'Bounce It Down', duration: '2:53' },
      { n: 4, title: 'Someone Else’s Take', duration: '3:58' },
      { n: 5, title: 'Lights Off Last', duration: '5:16' },
    ],
    credits:
      'Written, produced and engineered by MC Ferrograph.\nVocals on *Between Sessions* by **Néa Solberg**.\nBass on *Bounce It Down* by **Ruben Adeyemi**.',
    features: [
      { artist: 'Néa Solberg', role: 'Vocals' },
      { artist: 'Ruben Adeyemi', role: 'Bass' },
    ],
    streaming: ['spotify', 'soundcloud', 'youtube'],
  },
  {
    title: 'Everything Louder',
    artist: 'The Ossuary',
    type: 'album',
    releaseDate: '2024-04-19',
    catalogNumber: 'MLPHL-007',
    description:
      'Nine days, including the day the power went out and we tracked two songs on a generator. Drums up the middle, amps in the stairwell, almost nothing fixed afterwards.\n\nThe loudest record we have made and the one we argued about least.',
    tracklist: [
      { n: 1, title: 'Everything Louder', duration: '2:58' },
      { n: 2, title: 'Generator', duration: '3:41' },
      { n: 3, title: 'Stairwell Amp', duration: '4:22' },
      { n: 4, title: 'Nine Days', duration: '3:07' },
      { n: 5, title: 'No Overdubs', duration: '2:34' },
      { n: 6, title: 'Power Out', duration: '5:49' },
      { n: 7, title: 'Bury The Click', duration: '3:16' },
      { n: 8, title: 'Last One Standing', duration: '6:02' },
    ],
    credits:
      'Written by The Ossuary.\n\nRecorded live by **MC Ferrograph**.\nMixed through the desk by MC Ferrograph.\nMastered at Melophile.',
    streaming: ['spotify', 'apple', 'bandcamp', 'youtube'],
    featured: true,
  },
  {
    title: 'Salt Flats',
    artist: 'Néa Solberg',
    type: 'single',
    releaseDate: '2025-08-22',
    catalogNumber: 'MLPHL-008',
    description:
      'A first look at the next Néa record. Recorded in one night in the big room with the lights off.',
    tracklist: [
      { n: 1, title: 'Salt Flats', duration: '4:29' },
      { n: 2, title: 'Salt Flats (Piano)', duration: '3:51' },
    ],
    credits:
      'Written by Néa Solberg.\nRecorded and mixed at Melophile.\nMastered by **Yui Nakahara**.',
    streaming: ['spotify', 'apple', 'soundcloud'],
    featured: true,
  },
  {
    title: 'The Long Room',
    artist: 'Ruben Adeyemi',
    type: 'album',
    releaseDate: '2026-05-15',
    catalogNumber: 'MLPHL-009',
    description:
      'A duo record five years in the making: Ruben on double bass, Yui on the upright, recorded in the long room with two microphones and no headphones.\n\nThey played each piece twice and we kept whichever take had the better mistakes.',
    tracklist: [
      { n: 1, title: 'Two Microphones', duration: '8:04' },
      { n: 2, title: 'No Headphones', duration: '6:37' },
      { n: 3, title: 'The Long Room', duration: '11:12' },
      { n: 4, title: 'Better Mistakes', duration: '7:48' },
    ],
    credits:
      'Composed by Ruben Adeyemi and **Yui Nakahara**.\n\nRecorded by MC Ferrograph.\nMixed and mastered at Melophile.',
    features: [{ artist: 'Yui Nakahara', role: 'Piano' }],
    streaming: ['bandcamp', 'spotify'],
    featured: true,
  },
]

const SERVICES: { title: string; description: string; icon: ServiceIcon }[] = [
  {
    title: 'Recording',
    description:
      'Two live rooms, a tracking booth, and an engineer who has already heard your reference.',
    icon: 'mic',
  },
  {
    title: 'Mixing',
    description:
      'In the box or through the desk. Three revisions, printed stems, no clock-watching.',
    icon: 'fader',
  },
  {
    title: 'Mastering',
    description:
      'Loud where it needs to be. Delivered for streaming, vinyl and CD in one pass.',
    icon: 'waveform',
  },
  {
    title: 'Music production',
    description:
      'We will write, arrange and play on your record if that is what it needs.',
    icon: 'knob',
  },
  {
    title: 'Artist development',
    description:
      'Six months of sessions and honest conversation before anyone presses record.',
    icon: 'tape',
  },
  {
    title: 'Release and distribution',
    description:
      'Catalogue numbers, metadata, splits, and every store that is worth being in.',
    icon: 'disc',
  },
]

const ABOUT_BODY = `Melophile started in 2016, in one room above a carpet warehouse in Ardwick, with a borrowed desk, a pair of monitors that did not match, and a lease we could barely cover.

We took the name because we were tired of being asked what kind of music we did. Every label we admired growing up had a sound, and every one of them eventually became a cage. We wanted the roster to be able to contain a post-punk four-piece and a solo pianist without anyone having to explain themselves.

## What we actually do

Two things, and they feed each other.

We run a studio. Anyone can book it — you do not have to be signed to us, and most of the people in here are not. Some of the best records we have worked on left with somebody else's logo on the back.

And we put records out. Nine so far. We do it slowly, we pay properly, and we have never signed anyone we had not already spent six months in a room with.

## How we work

- Live in one room wherever the music allows it
- Tape when it earns its place, not as a costume
- The noise floor is an instrument, not a problem
- If a mistake is the best thing on the take, it stays

## The room

The live room has a 7-metre ceiling and a hardwood floor we refused to carpet. There is a smaller booth for vocals and a control room that fits six people if two of them stand. The kettle is good. The chairs are not.

If you want to see it, [book a session](/contact#book) or just ask — we will show anyone around.`

const BOOKING_INTRO =
  'Tell us what you are working on and when you want the room. We will come back with availability, a price, and which engineer we think should be on it.'

const BOOKING_SUCCESS =
  'We have your request. You will get a reply from a person, not an autoresponder, with availability and a price.'

/* ---------------------------- store ---------------------------- */

type SeedProduct = {
  kind: ProductKind
  title: string
  subtitle: string
  description: string
  priceCents: number
  compareAtCents?: number
  previewKind?: PreviewKind
  previewUrl?: string
  musicFormat?: MusicFormat
  licenseType?: BeatLicense
  bpm?: number
  musicalKey?: string
  variants?: Variant[]
  stock?: number | null
  digital?: boolean
  featured?: boolean
  /** Reuses a catalogue sleeve rather than generating a second picture. */
  useSleeve?: string
}

const PRODUCTS: SeedProduct[] = [
  /* --- merch --- */
  {
    kind: 'merch',
    title: 'Roomtone tour tee',
    subtitle: 'Heavyweight cotton, screen printed in Manchester',
    description:
      'Printed one at a time on 240gsm cotton, with the *Roomtone* waveform across the back and the catalogue number on the sleeve.\n\nRuns true to size. If you are between sizes, take the larger — they shrink about a centimetre in a hot wash.',
    priceCents: 2800,
    variants: [
      { label: 'S', sku: 'TEE-RT-S', stock: '4 left' },
      { label: 'M', sku: 'TEE-RT-M', stock: 'In stock' },
      { label: 'L', sku: 'TEE-RT-L', stock: 'In stock' },
      { label: 'XL', sku: 'TEE-RT-XL', stock: '2 left' },
    ],
    stock: 40,
    featured: true,
  },
  {
    kind: 'merch',
    title: 'Studio hoodie',
    subtitle: 'Heavy loopback, embroidered chest mark',
    description:
      'The one the engineers actually wear. Loopback cotton, no drawcord because it gets caught in the desk, and the mark embroidered rather than printed so it survives the wash.',
    priceCents: 6500,
    compareAtCents: 7500,
    variants: [
      { label: 'S', sku: 'HOOD-S', stock: 'In stock' },
      { label: 'M', sku: 'HOOD-M', stock: 'In stock' },
      { label: 'L', sku: 'HOOD-L', stock: 'Sold out' },
      { label: 'XL', sku: 'HOOD-XL', stock: 'In stock' },
    ],
    stock: 18,
  },
  {
    kind: 'merch',
    title: 'Tape box cap',
    subtitle: 'Six panel, oxide brown',
    description:
      'Unstructured six panel in the same brown as a tape box, with a brass buckle.',
    priceCents: 2200,
    variants: [{ label: 'One size', sku: 'CAP-01', stock: 'In stock' }],
    stock: 25,
  },
  {
    kind: 'merch',
    title: 'Everything Louder tote',
    subtitle: 'Canvas, printed both sides',
    description: 'Twelve-ounce canvas, long handles, and yes it fits a 12-inch record.',
    priceCents: 1600,
    variants: [{ label: 'One size', sku: 'TOTE-EL', stock: 'In stock' }],
    stock: 60,
  },

  /* --- music --- */
  {
    kind: 'music',
    title: 'The Long Room',
    subtitle: 'Ruben Adeyemi & Yui Nakahara',
    description:
      'The full album as 24-bit WAV and MP3, with the sleeve art and the liner notes as a PDF.\n\nTwo microphones, no headphones, and whichever take had the better mistakes.',
    priceCents: 900,
    musicFormat: 'album',
    previewKind: 'audio',
    digital: true,
    featured: true,
    useSleeve: 'MLPHL-009',
  },
  {
    kind: 'music',
    title: 'Everything Louder',
    subtitle: 'The Ossuary',
    description: 'Nine days, one power cut, no overdubs. 24-bit WAV and MP3.',
    priceCents: 900,
    musicFormat: 'album',
    previewKind: 'audio',
    digital: true,
    useSleeve: 'MLPHL-007',
  },
  {
    kind: 'music',
    title: 'Vertical Hold',
    subtitle: 'MC Ferrograph',
    description: 'Five tracks built entirely from sounds recorded in this building.',
    priceCents: 600,
    musicFormat: 'ep',
    previewKind: 'audio',
    digital: true,
    useSleeve: 'MLPHL-006',
  },
  {
    kind: 'music',
    title: 'Between Sessions',
    subtitle: 'MC Ferrograph — mixtape',
    description:
      'Eighteen tracks cut in the gaps between other people\u2019s bookings, sequenced as one continuous piece. Never pressed, download only.',
    priceCents: 500,
    musicFormat: 'mixtape',
    previewKind: 'audio',
    digital: true,
  },
  {
    kind: 'music',
    title: 'Salt Flats',
    subtitle: 'N\u00e9a Solberg',
    description: 'The single, plus the piano version recorded the same night.',
    priceCents: 200,
    musicFormat: 'single',
    previewKind: 'audio',
    digital: true,
    useSleeve: 'MLPHL-008',
  },

  /* --- beats --- */
  {
    kind: 'beat',
    title: 'Ardwick Nights',
    subtitle: 'Broken beat, upright bass, tape saturation',
    description:
      'Live upright bass through a valve pre, brushed kit, and a Rhodes that was slightly out of tune and stayed that way.\n\n**Lease** gets you the tagged WAV and MP3 for up to 10,000 streams. Credit **prod. Melophile**.',
    priceCents: 3500,
    licenseType: 'lease',
    bpm: 92,
    musicalKey: 'F minor',
    previewKind: 'audio',
    digital: true,
    featured: true,
  },
  {
    kind: 'beat',
    title: 'Ardwick Nights — exclusive',
    subtitle: 'Full ownership, beat removed from sale',
    description:
      'The same beat, sold once. You get the untagged WAV, the stems, and full ownership — it comes off the store the moment it sells and nobody else can license it.',
    priceCents: 45000,
    licenseType: 'exclusive',
    bpm: 92,
    musicalKey: 'F minor',
    previewKind: 'audio',
    digital: true,
    stock: 1,
  },
  {
    kind: 'beat',
    title: 'Cobalt Street',
    subtitle: 'Horns, swung kit, room mics open',
    description:
      'Nine-piece horn section bleeding into the drum mics, chopped and looped. **Lease** covers the tagged WAV and MP3 up to 10,000 streams.',
    priceCents: 4000,
    licenseType: 'lease',
    bpm: 84,
    musicalKey: 'B\u266d major',
    previewKind: 'audio',
    digital: true,
  },
  {
    kind: 'beat',
    title: 'Sixty Cycle',
    subtitle: 'Ambient, pedal steel, tape hiss',
    description:
      'Pedal steel through a spring reverb and a tape machine with a fault. Sparse.',
    priceCents: 3000,
    licenseType: 'lease',
    bpm: 70,
    musicalKey: 'D major',
    previewKind: 'audio',
    digital: true,
  },
  {
    kind: 'beat',
    title: 'Sixty Cycle — exclusive',
    subtitle: 'Full ownership, stems included',
    description:
      'Sold once. Untagged WAV, every stem, full ownership, removed from sale.',
    priceCents: 38000,
    licenseType: 'exclusive',
    bpm: 70,
    musicalKey: 'D major',
    previewKind: 'audio',
    digital: true,
    stock: 1,
  },
]

/* ---------------------------- events ---------------------------- */

type SeedEvent = {
  title: string
  description: string
  venue: string
  addressLines: string
  daysFromNow: number
  startTime: string
  doorsTime: string
  priceCents: number
  capacity: number | null
  ticketsSold: number
}

const EVENTS: SeedEvent[] = [
  {
    title: 'The Ossuary — Everything Louder, live',
    description:
      'The whole record, front to back, in the room it was made in. Two hundred people, no barrier, and the amps back in the stairwell where they belong.\n\nSupport from **Halcyon Pines**.',
    venue: 'Ardwick Works, Live Room',
    addressLines: 'Unit 7, Ardwick Works\n12 Cobalt Street\nManchester M12 6HQ',
    daysFromNow: 24,
    startTime: '20:00',
    doorsTime: '19:00',
    priceCents: 1800,
    capacity: 200,
    ticketsSold: 143,
  },
  {
    title: 'Yui Nakahara — piano and room',
    description:
      'One piano, two microphones, and the building left deliberately noisy. Seated, ninety minutes, no interval.',
    venue: 'Ardwick Works, Live Room',
    addressLines: 'Unit 7, Ardwick Works\n12 Cobalt Street\nManchester M12 6HQ',
    daysFromNow: 52,
    startTime: '19:30',
    doorsTime: '19:00',
    priceCents: 2200,
    capacity: 80,
    ticketsSold: 12,
  },
  {
    title: 'Open desk: mixing session',
    description:
      'Bring a session, we mix it in front of you and explain every move. Ten people maximum, three hours, and everyone leaves with the session file.',
    venue: 'Ardwick Works, Control Room',
    addressLines: 'Unit 7, Ardwick Works\n12 Cobalt Street\nManchester M12 6HQ',
    daysFromNow: 81,
    startTime: '14:00',
    doorsTime: '13:45',
    priceCents: 4500,
    capacity: 10,
    ticketsSold: 10,
  },
  {
    title: 'Ruben Adeyemi — Nine Bar Blues, live',
    description: 'The nine-piece, one night only. This one has been and gone.',
    venue: 'Band on the Wall',
    addressLines: '25 Swan Street\nManchester M4 5JZ',
    daysFromNow: -46,
    startTime: '20:00',
    doorsTime: '19:00',
    priceCents: 1600,
    capacity: 350,
    ticketsSold: 350,
  },
]

/* -------------------------------- helpers -------------------------------- */

const STREAM_URLS: Record<StreamingLink['platform'], (q: string) => string> = {
  spotify: (q) => `https://open.spotify.com/search/${encodeURIComponent(q)}`,
  apple: (q) => `https://music.apple.com/search?term=${encodeURIComponent(q)}`,
  youtube: (q) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`,
  bandcamp: (q) => `https://bandcamp.com/search?q=${encodeURIComponent(q)}`,
  soundcloud: (q) => `https://soundcloud.com/search?q=${encodeURIComponent(q)}`,
}

async function storeGenerated(
  svg: string,
  filename: string,
  alt: string,
): Promise<number> {
  const raster = await rasterise(svg)
  const path = await writeUploadFile(filename, raster.data)
  const row = await db
    .insert(images)
    .values({
      path,
      width: raster.width,
      height: raster.height,
      alt,
      mimeType: 'image/webp',
      bytes: raster.data.byteLength,
      isPlaceholder: true,
      createdAt: NOW,
    })
    .returning({ id: images.id })
    .get()
  if (!row) throw new Error(`Could not store generated image ${filename}`)
  return row.id
}

/* --------------------------------- run ---------------------------------- */

async function main() {
  const existing = await db.select({ id: releases.id }).from(releases).all()
  if (existing.length > 0 && !force) {
    console.error(
      `\nThis database already has ${existing.length} release(s).\n` +
        'Seeding again would replace them. If that is really what you want:\n\n' +
        '  npm run db:seed -- --force\n\n' +
        'To start completely fresh instead:  npm run db:reset\n',
    )
    process.exit(1)
  }

  if (force) {
    console.log('--force: clearing existing content…')
    await db.delete(releaseArtists)
    await db.delete(releases)
    await db.delete(artists)
    await db.delete(services)
    await db.delete(aboutPhotos)
    await db.delete(bookings)
    await db.delete(blackouts)
    await db.delete(images)
  }

  /* ---- artwork ---- */
  console.log('Generating placeholder artwork…')

  const portraitIds = new Map<string, number>()
  for (const artist of ARTISTS) {
    const id = await storeGenerated(
      portraitSvg(artist.name),
      `portrait-${slugify(artist.name)}.webp`,
      `Placeholder portrait for ${artist.name}`,
    )
    portraitIds.set(artist.name, id)
  }

  const sleeveIds = new Map<string, number>()
  for (const release of RELEASES) {
    const id = await storeGenerated(
      sleeveSvg(release.catalogNumber),
      `sleeve-${release.catalogNumber.toLowerCase()}.webp`,
      `Sleeve artwork for ${release.title} by ${release.artist}`,
    )
    sleeveIds.set(release.catalogNumber, id)
  }

  /* ---- artists ---- */
  console.log('Writing roster…')
  const artistIds = new Map<string, number>()
  for (const [index, artist] of ARTISTS.entries()) {
    const row = await db
      .insert(artists)
      .values({
        slug: slugify(artist.name),
        name: artist.name,
        photoId: portraitIds.get(artist.name) ?? null,
        shortDescription: artist.shortDescription,
        role: artist.role,
        links: artist.links,
        status: 'published',
        order: index,
        createdAt: NOW,
        updatedAt: NOW,
      })
      .returning({ id: artists.id })
      .get()
    if (row) artistIds.set(artist.name, row.id)
  }

  /* ---- releases ---- */
  console.log('Writing catalogue…')
  // Newest first, so the manual catalogue order the client sees matches what
  // they would expect before they touch it.
  const ordered = [...RELEASES].sort((a, b) => b.releaseDate.localeCompare(a.releaseDate))

  for (const [index, release] of ordered.entries()) {
    const query = `${release.title} ${release.artist}`
    const row = await db
      .insert(releases)
      .values({
        slug: slugify(`${release.title}-${release.catalogNumber}`),
        title: release.title,
        artistId: artistIds.get(release.artist) ?? null,
        type: release.type,
        coverImageId: sleeveIds.get(release.catalogNumber) ?? null,
        releaseDate: release.releaseDate,
        catalogNumber: release.catalogNumber,
        description: release.description,
        tracklist: release.tracklist,
        credits: release.credits,
        streamingLinks: (release.streaming ?? []).map((platform) => ({
          platform,
          url: STREAM_URLS[platform](query),
        })),
        featured: release.featured ?? false,
        status: 'published',
        order: index,
        createdAt: NOW,
        updatedAt: NOW,
      })
      .returning({ id: releases.id })
      .get()

    if (row && release.features) {
      for (const feature of release.features) {
        const artistId = artistIds.get(feature.artist)
        if (artistId) {
          await db
            .insert(releaseArtists)
            .values({ releaseId: row.id, artistId, role: feature.role })
        }
      }
    }
  }

  /* ---- services ---- */
  for (const [index, service] of SERVICES.entries()) {
    await db.insert(services).values({
      title: service.title,
      description: service.description,
      icon: service.icon,
      status: 'published',
      order: index,
      updatedAt: NOW,
    })
  }

  /* ---- store ---- */
  console.log('Writing store…')

  // Music products reuse the sleeve of the release they are, rather than
  // generating a second picture of the same record.
  const sleeveByCatalog = sleeveIds

  for (const [index, product] of PRODUCTS.entries()) {
    let imageId: number | null = null
    if (product.useSleeve) {
      imageId = sleeveByCatalog.get(product.useSleeve) ?? null
    }
    if (imageId === null) {
      imageId = await storeGenerated(
        sleeveSvg(`${product.kind.toUpperCase()}-${product.title}`),
        `product-${slugify(product.title)}.webp`,
        `Placeholder artwork for ${product.title}`,
      )
    }

    await db.insert(products).values({
      kind: product.kind,
      slug: slugify(
        `${product.title}-${product.licenseType ?? product.musicFormat ?? product.kind}`,
      ),
      title: product.title,
      subtitle: product.subtitle,
      description: product.description,
      priceCents: product.priceCents,
      compareAtCents: product.compareAtCents ?? null,
      imageId,
      previewUrl: '',
      previewKind: product.previewKind ?? 'none',
      releaseId: null,
      musicFormat: product.musicFormat ?? null,
      licenseType: product.licenseType ?? null,
      bpm: product.bpm ?? null,
      musicalKey: product.musicalKey ?? '',
      variants: product.variants ?? [],
      stock: product.stock === undefined ? null : product.stock,
      digital: product.digital ?? false,
      downloadUrl: '',
      featured: product.featured ?? false,
      status: 'published',
      order: index,
      createdAt: NOW,
      updatedAt: NOW,
    })
  }

  /* ---- events ---- */
  console.log('Writing events…')

  for (const [index, event] of EVENTS.entries()) {
    const imageId = await storeGenerated(
      sleeveSvg(`EVENT-${event.title}`),
      `event-${slugify(event.title)}.webp`,
      `Placeholder artwork for ${event.title}`,
    )

    await db.insert(events).values({
      slug: slugify(event.title),
      title: event.title,
      description: event.description,
      imageId,
      venue: event.venue,
      addressLines: event.addressLines,
      date: isoDaysFromNow(event.daysFromNow),
      startTime: event.startTime,
      doorsTime: event.doorsTime,
      priceCents: event.priceCents,
      capacity: event.capacity,
      ticketsSold: event.ticketsSold,
      externalUrl: '',
      status: 'published',
      order: index,
      createdAt: NOW,
      updatedAt: NOW,
    })
  }

  /* ---- singletons ---- */
  console.log('Writing page content…')

  await db
    .insert(siteSettings)
    .values({
      id: 1,
      logoText: 'MELOPHILE',
      navMusic: 'Music',
      navArtists: 'Artists',
      navAbout: 'About us',
      navContact: 'Contact',
      navStore: 'Store',
      navEvents: 'Events',
      footerText:
        'An independent label and recording studio in Manchester. We work across genres because narrowing the roster never made a record better.',
      socialLinks: [
        { platform: 'Instagram', url: 'https://www.instagram.com/melophilerecords' },
        { platform: 'Bandcamp', url: 'https://bandcamp.com' },
        { platform: 'YouTube', url: 'https://www.youtube.com' },
      ],
      metaTitle: 'Melophile Records — independent label and recording studio',
      metaDescription:
        'An independent label and recording studio in Manchester. Nine releases across every genre we like, and a room you can book.',
      updatedAt: NOW,
    })
    .onConflictDoNothing()

  await db
    .insert(home)
    .values({
      id: 1,
      wordmarkLine1: 'MELOPHILE',
      wordmarkLine2: 'RECORDS',
      wordmarkTagline:
        'An independent label and recording studio. The name is about range, not volume.',
      scrollCue: 'Scroll',
      musicHeading: 'Music',
      musicIntro: 'Nine releases so far. Not one of them sounds like the last.',
      musicCta: 'See all music',
      servicesHeading: 'Our services',
      servicesIntro: 'Everything from the first take to the release date.',
      contactHeading: 'Contact',
      contactCta: 'Book the studio',
      featuredCount: 4,
      updatedAt: NOW,
    })
    .onConflictDoNothing()

  await db
    .insert(about)
    .values({
      id: 1,
      heading: 'Our story',
      body: ABOUT_BODY,
      foundedYear: 2016,
      showCatalogCount: true,
      updatedAt: NOW,
    })
    .onConflictDoNothing()

  // Three empty photo slots. On the public page they collapse and the prose
  // recentres; in the admin they are visible, labelled drop zones. This is the
  // "photos added later" requirement, seeded in its starting state on purpose.
  for (let order = 0; order < 3; order++) {
    await db.insert(aboutPhotos).values({ imageId: null, caption: '', order })
  }

  await db
    .insert(contact)
    .values({
      id: 1,
      addressLines: 'Unit 7, Ardwick Works\n12 Cobalt Street\nManchester M12 6HQ',
      emails: [
        { label: 'General', address: 'hello@melophilerecords.co' },
        { label: 'Bookings', address: 'bookings@melophilerecords.co' },
        { label: 'Press', address: 'press@melophilerecords.co' },
      ],
      phone: '+44 161 496 0117',
      hours:
        'Monday to Friday, 10am – 10pm\nSaturday, 12pm – 8pm\nSunday, by arrangement',
      socialLinks: [
        { platform: 'Instagram', url: 'https://www.instagram.com/melophilerecords' },
        { platform: 'Bandcamp', url: 'https://bandcamp.com' },
        { platform: 'YouTube', url: 'https://www.youtube.com' },
      ],
      // Left blank on purpose: it demonstrates that an optional field the client
      // has not filled in collapses cleanly instead of leaving a hole.
      mapEmbed: '',
      bookingHeading: 'Book the studio',
      bookingIntro: BOOKING_INTRO,
      bookingSuccessMessage: BOOKING_SUCCESS,
      responseTime: 'within two working days',
      updatedAt: NOW,
    })
    .onConflictDoNothing()

  await db
    .insert(storePage)
    .values({
      id: 1,
      heading: 'Store',
      intro:
        'Records, beats and the odd bit of cotton. Everything here is made or mixed in this building.',
      merchHeading: 'Merch',
      merchIntro: 'Printed in Manchester in small runs. When a size is gone, it is gone.',
      musicHeading: 'Music',
      musicIntro:
        'Albums, EPs, mixtapes and singles as 24-bit WAV and MP3. The download link arrives the moment the payment clears.',
      beatsHeading: 'Beats',
      beatsIntro:
        'Lease one and keep the rights we share. Buy it exclusive and it comes off the store for good.',
      emptyMessage: 'Nothing in the store yet. Check back soon.',
      currency: 'GBP',
      currencySymbol: '£',
      shippingCents: 450,
      shippingNote: 'Flat £4.50 shipping in the UK. Downloads never carry postage.',
      checkoutNote:
        'We do not store your card. Payment is handled by Stripe on their own page.',
      successMessage:
        'Thank you. Your order is confirmed and a receipt is on its way. Downloads are on this page and in the email.',
      updatedAt: NOW,
    })
    .onConflictDoNothing()

  await db
    .insert(eventsPage)
    .values({
      id: 1,
      heading: 'Events',
      intro:
        'Shows in the live room and out of it. Capacity is small on purpose — when a night sells out it stays sold out.',
      emptyMessage:
        'Nothing booked in right now. Join the mailing list and we will tell you first.',
      pastHeading: 'Previously',
      updatedAt: NOW,
    })
    .onConflictDoNothing()

  /* ---- sample bookings + blackouts, so the admin is not empty ---- */
  const sampleBookings: {
    name: string
    email: string
    phone: string
    date: string
    time: string
    sessionType: SessionType
    durationHours: number
    people: number
    notes: string
    status: 'new' | 'confirmed' | 'done'
    daysAgo: number
  }[] = [
    {
      name: 'Priya Raman',
      email: 'priya@example.com',
      phone: '07700 900412',
      date: isoDaysFromNow(9),
      time: '13:00',
      sessionType: 'recording',
      durationHours: 6,
      people: 5,
      notes:
        'Five-piece, tracking three songs live if we can. We have our own drum kit but would need a bass amp. Reference is the second Ossuary record.',
      status: 'new',
      daysAgo: 1,
    },
    {
      name: 'Tomas Beck',
      email: 'tomas.beck@example.com',
      phone: '',
      date: isoDaysFromNow(16),
      time: '10:00',
      sessionType: 'mixing',
      durationHours: 8,
      people: 2,
      notes:
        'Eight stems per song, four songs. Happy to leave you to it and come back at the end.',
      status: 'confirmed',
      daysAgo: 4,
    },
    {
      name: 'Winter Choir',
      email: 'bookings@example.com',
      phone: '0161 496 0000',
      date: isoDaysFromNow(-6),
      time: '18:00',
      sessionType: 'rehearsal',
      durationHours: 3,
      people: 14,
      notes:
        'Fourteen singers, no amplification needed. Just need the big room and chairs.',
      status: 'done',
      daysAgo: 21,
    },
  ]

  for (const booking of sampleBookings) {
    await db.insert(bookings).values({
      name: booking.name,
      email: booking.email,
      phone: booking.phone,
      date: booking.date,
      time: booking.time,
      sessionType: booking.sessionType,
      durationHours: booking.durationHours,
      people: booking.people,
      notes: booking.notes,
      referenceUrl: '',
      status: booking.status,
      adminNote: '',
      notified: true,
      notifyError: '',
      ip: '127.0.0.1',
      createdAt: new Date(NOW.getTime() - booking.daysAgo * 86_400_000),
    })
  }

  await db
    .insert(blackouts)
    .values([
      { date: isoDaysFromNow(21), reason: 'Studio maintenance' },
      { date: isoDaysFromNow(22), reason: 'Studio maintenance' },
      { date: isoDaysFromNow(40), reason: 'Ossuary album sessions' },
    ])
    .onConflictDoNothing()

  /* ---- the first admin login ---- */
  const email = (process.env.ADMIN_EMAIL ?? 'studio@melophilerecords.test').trim()
  const envPassword = process.env.ADMIN_PASSWORD?.trim() ?? ''
  const generated =
    envPassword.length >= 12 ? null : randomBytes(12).toString('base64url')
  const password = generated ?? envPassword

  const already = await db.select({ id: adminUsers.id }).from(adminUsers).all()
  if (already.length === 0) {
    const { hash, salt } = await hashPassword(password)
    await db.insert(adminUsers).values({
      email,
      passwordHash: hash,
      passwordSalt: salt,
      mustChangePassword: true,
      createdAt: NOW,
    })
  }

  /* ---- report ---- */
  console.log(`
Seeded.

  ${ARTISTS.length} artists · ${RELEASES.length} releases · ${SERVICES.length} services
  3 sample bookings · 3 blackout dates · 3 empty About photo slots

Log in at  /admin
  email     ${email}
  password  ${
    already.length === 0
      ? generated
        ? `${password}      <-- generated, copy it now`
        : '(the ADMIN_PASSWORD from your .env.local)'
      : '(unchanged — an admin user already existed)'
  }

The admin will ask you to change that password on first login.
Everything above is placeholder content. Rewrite it from /admin — see HANDOVER.md.
`)
}

function isoDaysFromNow(days: number): string {
  const d = new Date(NOW.getTime() + days * 86_400_000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
}

main().catch((error) => {
  console.error('\nSeed failed:', error)
  process.exit(1)
})
