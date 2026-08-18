# Limitless / Melophile Security Review

Date: 2026-08-18

Branch reviewed: `main`

Mode: full repository and live Supabase configuration audit

Reviewer: Codex CSO workflow

## Executive summary

This review confirmed five medium-severity security gaps. Four are remediated
in the repository: overly broad Supabase browser-role privileges and exposed
trigger functions, untrusted external profile-picture URLs loaded by
administrator pages, and login limits that could be bypassed by rotating the
guessed account, plus customer avatar uploads trusted from browser MIME labels.
The forward database migration is prepared but has not been
applied to the live `Limitless Records` Supabase project because production data
and access-control changes require explicit deployment approval.

Supabase's leaked-password protection is disabled and must be enabled in the
project's Authentication settings. The repository cannot change this hosted
Auth setting.

No tracked credentials, credential-like Git history, server-secret fingerprints
in generated build artifacts, known npm advisories, public avatar bucket, or
unprotected application tables were found. This is not proof that no historical
breach occurred: provider audit logs, deployment history, access logs and old
artifacts were not available for incident forensics.

## Scope and architecture

- Next.js 15 public storefront, account area, checkout, invoice and independent
  administrator interface.
- PostgreSQL/Drizzle application data plus local SQLite artifacts.
- Supabase Auth, Postgres, Row Level Security and private Storage.
- Stripe and Resend server integrations.
- Railway, Vercel, Cloudflare/OpenNext and GitHub Actions configuration.
- Source, migrations, generated output, local sensitive file permissions,
  dependency graph, ignored files and Git history.
- Live read-only inspection of the `Limitless Records` Supabase project's
  tables, policies, grants, functions, extensions, Storage and security
  advisors.

## Sensitive data and trust boundaries

| Data                                                               | Classification | Main boundary                                      |
| ------------------------------------------------------------------ | -------------- | -------------------------------------------------- |
| Names, email, phone, addresses and profile images                  | Restricted PII | Browser → Next/Supabase → private database/storage |
| Password and session state                                         | Restricted     | Browser → Supabase Auth or admin session cookie    |
| Orders, payment attempts and invoices                              | Confidential   | Browser → Next → Postgres/Stripe                   |
| Service-role key, admin password, session secret and provider keys | Secret         | Deployment environment → server only               |
| Administrator activity and customer account status                 | Confidential   | Admin browser → guarded server paths               |

The main attacker-controlled boundaries are anonymous forms, sign-in endpoints,
direct Supabase Data API requests, profile content, uploaded images, cart and
checkout inputs, order/invoice identifiers, and external URLs entered through
the administrator.

## Findings

### SEC-011 — Supabase browser roles retained broad table privileges

- Severity: Medium
- Confidence: 10/10
- Repository status: Fixed
- Live status: Migration pending explicit approval
- Evidence: Live grants gave `anon` and `authenticated` roles insert, update,
  delete, truncate, references and trigger privileges across nearly every table.
  RLS currently prevented unwanted row access, but grants and policies are
  independent controls. Live security advisors also reported mutable function
  search paths, `citext` in the exposed `public` schema, and browser execution
  access to two `SECURITY DEFINER` trigger functions.
- Exploit scenario: A later RLS policy mistake becomes immediately writable or
  destructive because the underlying role already has the table privilege. An
  unnecessarily exposed definer function also increases the impact of a future
  function bug.
- Remediation: `20260818051748_security_least_privilege.sql` revokes implicit
  browser privileges, grants only the operations the application uses, makes
  future objects private by default, fixes function search paths, restricts
  trigger execution to the Auth service and moves `citext` out of `public`.
  Policies now explicitly target `authenticated` and use init-plan-safe
  `(select auth.uid())` checks.
- Residual risk: The live project keeps its current grants until the migration
  is applied. Supabase recommends RLS together with only the necessary role
  privileges: <https://supabase.com/docs/guides/auth/managing-user-data>.

### SEC-012 — Customer-controlled avatar URL contacted an attacker from admin pages

- Severity: Medium
- Confidence: 10/10
- Repository status: Fixed
- Live status: Database constraint and cleanup pending explicit approval
- Evidence: OAuth metadata was copied into `profiles.profile_picture`, and an
  authenticated customer could update that field directly to any HTTPS URL.
  Customer and administrator views rendered such URLs without proxying them.
- Exploit scenario: A customer saves a unique tracking URL as their avatar. When
  an administrator opens the customer list or detail page, the administrator's
  browser contacts the attacker's host, disclosing the visit time, network
  address and browser metadata and allowing persistent admin-view tracking.
- Remediation: Application reads now accept only owner-scoped private Storage
  paths. New signups no longer import OAuth avatar URLs. The migration clears
  existing external values and adds a database check requiring
  `<user UUID>/<safe filename>`. Storage remains private and images use
  short-lived signed URLs.
- Residual risk: Existing external values can still be present in production
  until the migration runs. Supabase documents private Storage access through
  RLS and signed URLs: <https://supabase.com/docs/guides/storage/security/access-control>.

### SEC-013 — Login work limits were bypassable by account rotation

- Severity: Medium
- Confidence: 9/10
- Status: Fixed
- Evidence: The administrator limiter was durable but keyed only by the
  combination of IP address and guessed email. The customer-side limiter had
  the same shape. Changing the email value bought a fresh allowance and could
  produce unbounded durable login-attempt rows while forcing repeated password
  hashing or upstream Auth work.
- Exploit scenario: One source sprays many email values to consume server CPU
  and grow the login-attempt table, or many sources concentrate guesses on one
  administrator account.
- Remediation: Administrator login now enforces independent per-account and
  per-IP ceilings, records both dimensions on failure, clears the account
  history after success and removes expired records through an indexed expiry
  path. Administrator login inputs are length-bounded. Customer sign-in now
  also has independent per-account and per-IP limits in front of Supabase's own
  controls and records only failed sign-in attempts.
- Residual risk: Customer-side limits are per application process; Supabase's
  hosted Auth rate limits remain the durable upstream control.

### SEC-014 — Supabase leaked-password protection is disabled

- Severity: Medium
- Confidence: 10/10
- Status: Open operational setting
- Evidence: The live Supabase Auth security advisor reports leaked-password
  protection disabled.
- Exploit scenario: A customer reuses a password disclosed in another breach,
  making credential-stuffing account takeover more likely even though the app
  limits repeated attempts.
- Remediation: Enable leaked-password protection in Supabase Authentication
  settings. Supabase documents that the feature rejects passwords found in the
  Pwned Passwords dataset and is available on Pro plans and above:
  <https://supabase.com/docs/guides/auth/password-security>.
- Residual risk: Existing users may retain previously chosen passwords; review
  the provider's behavior and communicate a reset if the setting flags them.

### SEC-015 — Customer avatar bytes were not decoded before storage

- Severity: Medium
- Confidence: 9/10
- Status: Fixed
- Evidence: Customer avatar upload enforced a browser-provided MIME type and a
  four-megabyte size limit, then stored the original bytes without proving that
  they were a supported image. Those bytes were later delivered through signed
  URLs to customer and administrator browsers.
- Exploit scenario: A customer uploads malformed, polyglot or exceptionally
  expensive compressed image data while labelling it as JPEG/PNG/WebP/AVIF,
  shifting parser and resource risk to every browser that displays the avatar.
- Remediation: The server now decodes the image with a pixel ceiling, applies
  orientation, limits dimensions, strips metadata and re-encodes a fresh WebP
  before upload. Unreadable or oversized-dimension inputs are rejected. Old
  avatar deletion is also restricted to the signed-in owner's folder.
- Residual risk: Image parsing still consumes bounded server resources; platform
  request-size and rate controls remain useful defense in depth.

## OWASP and STRIDE review

| Area                                | Result after repository remediation                                                                                                                |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Broken access control / elevation   | Admin guards, active-account checks, owner RLS, column grants and signed order credentials remain in place; live least-privilege migration pending |
| Cryptographic failures / disclosure | Scrypt admin hashes, HMAC sessions/order tokens, secure cookies, private files and scrubbed builds remain in place; no secret fingerprints found   |
| Injection / tampering               | Parameterized application queries, Zod validation, React text rendering and image decode/re-encode controls remain in place                        |
| Insecure design / spoofing          | Independent login limits added; hosted leaked-password setting remains open                                                                        |
| Security misconfiguration           | CI actions remain SHA-pinned, RLS enabled on every inspected table and avatars private; grants/functions migration pending                         |
| Vulnerable components               | `npm audit` and runtime-only audit report zero known vulnerabilities                                                                               |
| Logging / repudiation               | Account and order activity exists; production-provider log review was outside scope                                                                |
| SSRF / unsafe external content      | Stripe and Resend targets are fixed and time-bounded; arbitrary profile-picture fetches removed; avatars are re-encoded                            |

## Verification performed

- Production backend build: passed on Next.js 15.5.22.
- Repository content/security smoke checks: passed.
- Avatar normalization check: valid image emitted a fresh WebP and invalid bytes
  were rejected.
- Changed TypeScript files: Prettier check passed.
- `git diff --check`: passed.
- `npm audit`: zero vulnerabilities.
- `npm audit --omit=dev`: zero vulnerabilities.
- Generated Next/OpenNext artifact fingerprint scan: no configured server-secret
  values found.
- Tracked files and Git history: no committed environment file or credential
  pattern found; only `.env.example` appears in environment-file history.
- Sensitive local files remain mode `0600`; data/outbox directories remain
  `0700`.
- Live Supabase tables all have RLS; the avatars bucket is private.
- CI workflows remain least-privileged and use immutable action SHAs.

The repository type-check still reports pre-existing errors in the SQLite
import, checkout, cart, release and data-query modules. Next.js is configured to
skip type validation during production builds, so the production build passes.
No reported type error originates in the files changed by this review, but this
remains a general verification gap.

## Deployment actions required

1. Apply `supabase/migrations/20260818051748_security_least_privilege.sql` to
   the live `Limitless Records` project, preferably after a backup/staging run,
   then rerun Supabase security advisors and browser-role privilege checks.
2. Enable leaked-password protection in Supabase Authentication settings if the
   project plan supports it.
3. Establish Supabase migration tracking. The live project returned no recorded
   CLI migrations even though the schema exists, which makes drift and rollout
   verification harder.
4. For historical incident assurance, review Supabase Auth/Postgres logs,
   Railway/Vercel/Cloudflare deployment and access history, GitHub audit events,
   Stripe activity and any archived build artifacts. Repository inspection alone
   cannot prove that credentials or customer records were never accessed.
