# Melophile Records — handover

Everything you can see on the public site, you can change from `/admin`. No code,
no deploy. This note covers the five things you will actually need.

---

## 1. Getting it running

```bash
npm install
cp .env.example .env.local     # then fill in SESSION_SECRET (see below)
npm run setup                  # creates the database and loads the starter content
npm run dev:admin              # site on :3000, admin on :4100
```

`SESSION_SECRET` is the one value the site refuses to start without. Generate one:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

For production: `npm run build` then `npm start`.

---

## 2. Logging into the admin

The admin has its own address:

```bash
npm run dev:admin      # starts both, in one terminal
```

|                           |                 |
| ------------------------- | --------------- |
| **http://localhost:4100** | the admin       |
| **http://localhost:3000** | the public site |

The public pages are **not served on 4100** — asking it for `/music` gets you a 404. That port is the admin and nothing else, and it only listens on your own
machine, never on the network.

You can also run them separately: `npm run dev` in one terminal, `npm run admin`
in another. To use a different port: `ADMIN_PORT=4200 npm run admin` (put the
same value in `.env.local` so the app agrees).

`/admin` on port 3000 still works if you prefer one address for everything. It is
never linked from the public site and never indexed either way.

- **Email:** whatever you set as `ADMIN_EMAIL` in `.env.local`
  (the starter value is `studio@melophilerecords.test`)
- **Password:** whatever you set as `ADMIN_PASSWORD`

If you left `ADMIN_PASSWORD` blank, `npm run setup` printed a generated password in
the terminal. It is shown once.

**The admin will ask you to change that password the first time you log in.** Do it.
Changing it signs out every other session, which is what you want if the starter
password was ever shared.

Five wrong attempts locks that email out for fifteen minutes. That is deliberate.

**Lost the password?** There is no reset email — a single-editor admin with no
mail server would be a worse door than no door. Reset it from the server instead:

```bash
npm run admin:password -- 'a new long passphrase'
```

Leave the passphrase off and it generates one and prints it. Either way every
existing session is signed out, so if the old password leaked, whoever had it is
logged out too.

### What each screen edits

| Screen        | What it controls on the public site                                                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Bookings**  | Every studio request. Status, private notes, reply by email.                                                                                           |
| **Releases**  | The whole catalogue: artwork, tracklists, credits, streaming links, order, draft/published.                                                            |
| **Artists**   | Photos, descriptions, roles, links, order. "Appears on" writes itself.                                                                                 |
| **Services**  | The six things on the home page: title, one line, icon, order.                                                                                         |
| **Home page** | Every word on `/`: the wordmark's two lines, the scroll cue, all four section headings, both button labels, and how many releases the music row shows. |
| **About**     | The heading, the whole story, the founding year, and the photo slots.                                                                                  |
| **Contact**   | Address, emails, phone, hours, socials, map, and all the booking-form wording.                                                                         |
| **Settings**  | Logo text, the four nav labels, footer text, socials, and the search-result title and description.                                                     |
| **Orders**    | Every purchase: items, totals, payment status, private notes.                                                                                          |
| **Store**     | Merch, music and beats — price, artwork, description, preview, stock, sizes, licences. Plus the store page copy and the currency.                      |
| **Events**    | Dates, venue, poster, ticket price, capacity and tickets sold. Plus the events page copy.                                                              |
| **Blackouts** | Days the booking form refuses.                                                                                                                         |
| **Account**   | Your password.                                                                                                                                         |

Nothing about layout, colour, type or the hero animation is editable — that is
by design, and it is why the site cannot be knocked out of shape by an edit.

---

## 3. Adding a release

`/admin/releases` → **New release**.

| Field            | Notes                                                                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Title            | The name of the record.                                                                                                                    |
| Slug             | Fills itself in from the title. It is the web address — leave it alone unless you have a reason.                                           |
| Artist           | Pick from your roster. Add the artist first if they are not there yet.                                                                     |
| Type             | Album, EP or single. This drives the filters on `/music`.                                                                                  |
| Cover artwork    | Square. Upload anything up to 8 MB — it is resized and converted for you. **Alt text is required.** Describe the sleeve in a short phrase. |
| Release date     | Sets the year shown on the card and the order on the home page.                                                                            |
| Catalogue number | e.g. `MLPHL-010`. Shown in the mono type. Keep the sequence going — it is part of why the label looks like it has been running a while.    |
| Description      | The long text in the detail view. Supports **bold**, _italic_, links, headings and lists.                                                  |
| Tracklist        | Add a row per track: number, title, duration (`4:12`). The total runtime is worked out for you.                                            |
| Credits          | Who played and who engineered. Same formatting as the description.                                                                         |
| Streaming links  | Add only the platforms you are actually on. Blank ones do not appear.                                                                      |
| Featured         | Pins it to the front of the home page's music row.                                                                                         |
| Status           | **Draft** while you work. **Published** puts it live.                                                                                      |

Press **Save changes**. The public site updates immediately — no deploy.

The four most recent published releases appear on the home page automatically.
To show more, change **Featured count** in `/admin/home` (anything from 4 to 8).

---

## 4. Adding an artist

`/admin/artists` → **New artist**.

- **Name**, **Role or genre** (e.g. "Bass, composer — jazz and broken beat")
- **Photo** — portrait shape, 4:5. Alt text required.
- **Short description** — this is what appears when someone clicks their photo.
  Nothing about an artist shows on the `/artists` grid except the photo; that was
  the point of the design.
- **Links** — label plus address, one per row.
- **Status** — Draft until you are happy.

**"Appears on" writes itself.** Once a release names this artist, it shows up in
their panel. You never enter a release twice.

Use the **Move up / Move down** buttons on the list to set the order of the grid.

---

## 5. Swapping the About photos in later

`/about` is built to work with **no photos at all**, which is how it ships. The
prose sits in one centred column and there is no gap where pictures would go.

When you have photographs:

1. Go to **`/admin/about`**.
2. You will see three labelled, empty photo slots. They are visible and fillable
   here even though they show nothing on the public page.
3. Drop an image into a slot, write the alt text, add a caption if you want one.
4. Save.

The public page reflows into two columns the moment the first photo exists. Add
**Another slot** if you want more than three; remove a slot to take one away.
An empty slot never appears on the live site — no broken image, no grey box.

Rewriting the story itself is the same screen: one text field, the whole page.

---

## 6. Reading booking requests

`/admin/bookings`. New requests are at the top with a **NEW** badge and a count in
the sidebar.

Mark each one **Confirmed**, **Declined** or **Done** as you work through it.
There is an internal note field the public never sees.

**Watch for the "Not notified" flag.** A booking is always saved to the database
first and the email is attempted second. If the email failed, the request is still
here and safe, and the row tells you why it did not send. You will never be told
something was emailed when it was not.

To turn on email notifications, set these in `.env.local`:

```
RESEND_API_KEY=...
BOOKING_NOTIFY_TO=bookings@yourdomain.com
BOOKING_NOTIFY_FROM=site@yourdomain.com
```

Until then, every notification is written to `data/outbox/` as a text file, and
the booking still arrives in the admin. Nothing is lost either way.

**Blocking out dates:** `/admin/blackouts`. Days you list there are refused by the
booking form, both in the browser and on the server.

---

## 7. Tuning the hero animation

Everything is in one file:

**`src/components/hero/timeline.ts`**

The `TIMELINE` object at the top is the whole choreography in milliseconds.
Change a number and the sequence moves with it — nothing else in the codebase
hard-codes a hero duration.

```ts
export const TIMELINE = {
  inputEnd: 620, // how long the wordmark stays untuned
  delayStart: 620, // the echo taps begin
  delayEnd: 2280,
  delayTap: 90, // ms between echoes — bigger = wider spread
  delayFeedback: 0.62, // how fast the echoes fade. 0.5 = short, 0.8 = long
  sweepStart: 760, // the filter sweep starts crossing the letters
  sweepEnd: 2100, // ...and finishes. Widen this to slow the resolve.
  crushStart: 2050, // the distortion burst
  crushEnd: 2170,
  lock: 2280, // THE TRANSIENT. Everything lands here.
  overshootEnd: 2450, // the bounce back from the overshoot
  settleEnd: 2600, // hands over to the calm idle state
  duration: 3100, // total, before rest
}
```

Useful adjustments:

- **Too slow overall?** Scale every number down by the same factor. Keep `lock`
  between roughly 2000 and 2800 or the transient stops feeling like an arrival.
- **Want the untuned phase to last longer?** Raise `inputEnd` and `sweepStart`
  together.
- **Want the letters to resolve more slowly, one at a time?** Widen the gap
  between `sweepStart` and `sweepEnd`.
- **Effect intensities** (how far the colour channels split, how blurred the
  unresolved letters are) live in `src/styles/hero.css`, in the
  `.mark__chan--r/g/b` and `.mark__solid .mark__char` rules.
- **The needle's weight** is `VU_TAU_MS` in `timeline.ts`. 65ms is real VU
  ballistics. Larger is lazier, smaller is twitchier.

Other things worth knowing about the hero:

- Press **Replay** under it to watch the sequence again.
- **Sound** is off by default. Turn it on and the oscilloscope reads real
  frequency data instead of the synthesised envelope. Nothing is downloaded —
  the sound is generated in the browser.
- On phones it drops the echo count and the distortion burst rather than dropping
  frames. The sweep and the colour split never degrade — they are the signature.
- With "reduce motion" turned on in the operating system, the wordmark arrives in
  its finished state with a single gentle fade, and the animation loop never runs.
- The loop pauses when the hero scrolls out of view or the tab is in the
  background, so it is not quietly draining a battery.
- `IN → EQ → COMP → OUT` is instrumentation, not content, so it is the one
  user-visible text on the site that is **not** editable. Same reasoning as
  colour and layout: nothing about the animation is editable.

---

## 8. Where things live

```
src/app/                  the pages. One folder per route.
src/app/admin/            the editor. Never linked publicly, never indexed.
src/components/hero/      the wordmark animation. timeline.ts is the tuning file.
src/components/site/      shared furniture: nav, footer, dialog, images
src/styles/tokens.css     EVERY colour, size, space and duration on the site
src/db/schema.ts          the content model
src/lib/data.ts           every read the public pages make
data/melophile.db         your content. Back this up.
public/uploads/           your images. Back these up too.
```

**Backup is copying two folders:** `data/` and `public/uploads/`. That is the whole
site's content. There is no external service holding any of it.

---

## 9. Two things to know before you deploy

**Uploads need a writable disk.** Images are written to `public/uploads/`, which
works on a normal server or a VPS but _not_ on read-only serverless hosting
(Vercel's default, for instance). If you deploy there, images will fail to save.
The fix is one file: `src/lib/storage.ts` defines a `Storage` interface with a
single local-disk implementation. Add an S3/R2/Vercel Blob class next to it and
change the last line. Nothing else in the codebase touches the filesystem.

**The database is a file.** SQLite is the right choice for one label running one
site, and it means no database server to pay for or patch. If you outgrow it,
Drizzle speaks Postgres too — `src/db/schema.ts` changes dialect and the queries
stay as they are.

---

## 10. Starter content

Everything loaded by `npm run setup` is placeholder content for you to replace:

- **6 artists** with generated portrait art
- **9 releases** (`MLPHL-001` to `MLPHL-009`) with generated sleeve art, tracklists
  and credits
- **6 services**, the About story, and the contact details
- **3 sample booking requests** — delete them once you have seen how the list works
- **3 blackout dates**

The generated artwork is flagged **"Placeholder — replace this"** in the admin so
you can see at a glance what still needs a real image. It never says "placeholder"
on the public site.

The social links and email addresses in the starter content are made up. Replace
them in `/admin/settings` and `/admin/contact` before you go live.

---

## 8. The store and events

The store has three sections and they all live in one place, `/admin/store`:

- **Merch** — clothing. Sizes go in the variants table; the stock column is free
  text ("In stock", "2 left", "Sold out") because that is what a customer reads.
- **Music** — albums, EPs, mixtapes and singles, sold as downloads.
- **Beats** — lease and exclusive licences. An exclusive should have its stock
  set to 1: it is sold once and comes off the store when it sells.

Prices are typed in pounds and stored in pence, so they can never drift by a
penny. Leave stock blank for unlimited; 0 marks something sold out.

`/admin/events` runs the dates. Set a capacity and the site counts tickets down;
leave it blank and it never claims a number it does not have. Set **External
URL** on an event and the page links out to the venue's box office instead of
selling tickets here.

### How payment works

Checkout redirects to **Stripe's own hosted page**, so no card number ever
reaches this server, this database or these logs.

**It works before you have a Stripe account.** With `STRIPE_SECRET_KEY` blank,
an order is still recorded, still appears in `/admin/orders`, and still holds
the stock — the customer is told plainly that no card was taken and that you
will be in touch about payment. Nothing is ever lost and nothing is ever
claimed that did not happen.

Paste a key into `.env.local` and the same checkout starts taking payment. No
other change.

Cancelling or refunding an order in the admin **puts the stock back** — one
click, and it cannot double-count if you press it twice.

---

## 9. Customer accounts (Supabase)

Customers sign in with email and password or with Google, get a profile, an
address book, order history and an activity trail. **This is separate from your
admin login** — the admin still uses its own password on port 4100, and no
customer can ever reach it.

### One-time setup

1. **Run the migration.** Supabase dashboard → **SQL Editor** → New query →
   paste all of `supabase/migrations/0001_accounts_and_orders.sql` → Run.
   It is safe to run twice.
2. **Keys** go in `.env.local` at the project root (not in `src/`):
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`. No spaces around the `=`.
3. **Google sign-in**: create an OAuth client in Google Cloud with the redirect
   `https://<project-ref>.supabase.co/auth/v1/callback`, then paste the client
   id and secret into Supabase → Authentication → Providers → Google.
4. Restart the server.

**The service-role key must never be shared or prefixed with `NEXT_PUBLIC_`.**
It bypasses every security rule in the database by design.

### What the customer gets

`/signup`, `/login`, `/forgot-password`, and once signed in `/account` with
Profile, Orders, Addresses, Activity and Settings. Avatar and account menu
appear in the navbar. They can change their password, delete their account, and
download an invoice for any order.

### What you get in the admin

Two new sections: **Customers** and **Customer orders**.

- **Customers** — search by name, email or username; filter by status; open
  anyone to see their profile, addresses, orders, spend and full login history;
  suspend, ban, reinstate (a reason is required) or delete.
- **Customer orders** — the Postgres orders, with payment status, tracking
  number, tracking URL and delivery date.
- The dashboard gains a panel: total and new customers, active users, orders,
  revenue and average order value.

**Two order lists, on purpose.** `Orders` is the original SQLite store — every
order taken before accounts existed. `Customer orders` is the new one. Neither
is a copy of the other, so both are shown rather than hiding real money.

### Security

Row level security is on for every table: a signed-in customer can read and
write their own rows and nothing else, enforced by Postgres itself rather than
by application code being careful. Passwords are hashed by Supabase. Password
reset and sign-up never reveal whether an address is registered. A suspended or
banned account cannot sign in by password _or_ by Google. The activity trail is
append-only — nobody can edit it, including the person it belongs to. Deleting
an account keeps the orders as a financial record and removes the personal link.

### If the keys are missing

The site works exactly as it did before: shop, catalogue, events and admin are
untouched, and the account pages say plainly that accounts are not set up yet
rather than breaking.

---

## Commands

|                               |                                                         |
| ----------------------------- | ------------------------------------------------------- |
| `npm run dev`                 | public site on :3000                                    |
| `npm run admin`               | admin on :4100 (needs `dev` running as well)            |
| `npm run dev:admin`           | both of those, in one terminal                          |
| `npm run admin:password`      | reset the admin password from the server                |
| `npm run art:regen`           | redraw the placeholder artwork (after a palette change) |
| `npm run build` / `npm start` | production                                              |
| `npm run setup`               | create the database and load starter content            |
| `npm run db:reset`            | **wipes everything** and starts over                    |
| `npm run typecheck`           | check the code compiles                                 |
| `npm run check`               | smoke-test the text renderer and the booking rules      |
| `npm run format`              | tidy the formatting                                     |

`npm run check` is worth running after any change to `src/lib/markdown.tsx` or
`src/lib/validation.ts`. It pins the things the type checker cannot see: that
author text can never become HTML, that dangerous links are refused, that the
renderer cannot hang, and that the booking form still rejects what it should.

`npm run db:seed` refuses to run over an existing catalogue. You have to pass
`-- --force` to overwrite, which is the safety catch on the one command that
could delete your releases.
