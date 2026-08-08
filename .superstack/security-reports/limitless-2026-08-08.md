# Limitless / Melophile Security Review

Date: 2026-08-08  
Branch reviewed: `main`  
Mode: full repository audit and remediation  
Reviewer: Codex CSO workflow

## Executive summary

The review confirmed ten security weaknesses. The most serious were plaintext
server credentials copied into a generated OpenNext/Cloudflare source module and
an insecure direct-object-reference on guest order confirmation pages that could
expose customer contact, address, item, and payment-status data to anyone who
guessed a short order reference.

All ten findings have code-level remediations in this change. Two operational
follow-ups remain for the deployment owner:

1. Apply `supabase/migrations/0004_security_hardening.sql` to every existing
   Supabase environment.
2. Rotate `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_PASSWORD`, `SESSION_SECRET`, and
   any other server credentials that were present during an OpenNext build if an
   unsanitized `.open-next` artifact was ever uploaded, shared, or deployed.

This local repository review found no tracked secret files, no credential-like
values in Git history, and no server-secret fingerprints in the regenerated
Next/OpenNext artifacts after remediation. It cannot establish whether a real
production breach occurred because production provider logs, Cloudflare account
history, Supabase audit logs, and deployed artifacts were outside the available
scope.

## Scope and architecture

- Next.js 15 application with public storefront, customer accounts, checkout,
  order confirmations, invoices, and a separate administrator interface.
- Supabase Auth, Postgres, Row Level Security, and Storage for customer data.
- SQLite fallback data and filesystem mail outbox for local/single-host use.
- Stripe checkout and Resend email integration.
- Deployment configuration for Cloudflare/OpenNext, Vercel, and Railway.
- GitHub Actions CI and npm dependency supply chain.

The review covered tracked source and configuration, migration policy, auth and
authorization boundaries, upload/invoice/order routes, local sensitive files,
dependency advisories, CI action integrity, ignored files, Git history, and
generated build output.

## Sensitive data inventory

| Data | Classification | Principal stores/flows |
| --- | --- | --- |
| Customer name, email, phone, address | Restricted PII | Supabase orders/profiles, SQLite, mail outbox, order/invoice views |
| Authentication state and account status | Restricted | Supabase Auth, `public.users`, cookies |
| Admin password hashes and session identifiers | Restricted | SQLite and HTTP-only cookie |
| Supabase service role, database URL, admin bootstrap password, session secret | Secret | environment configuration and deployment bindings |
| Profile photographs | Private customer content | Supabase Storage |
| Order/payment identifiers and status | Confidential | Postgres/SQLite, Stripe, confirmation/invoice routes |

## Attack surface and trust boundaries

- Anonymous browser to public Next.js routes and server actions.
- Authenticated customer browser to Supabase through RLS and Storage policies.
- Administrator browser to the independent SQLite-backed admin session.
- Next.js server to Supabase using a service-role credential.
- Checkout server to Stripe and notification server to Resend.
- Build/deployment workers and GitHub Actions to source, dependencies, and
  production credentials.
- Local OS users/processes to SQLite and filesystem outbox artifacts.

## Findings

### SEC-001 — Server credentials embedded in generated Worker source

- Severity: Critical
- Confidence: 10/10
- Status: Fixed in build pipeline; credential rotation is conditionally required
- Evidence: `.open-next/cloudflare/next-env.mjs` contained exact fingerprints of
  server-only environment values, including administrator and Supabase
  privileged credentials. No values are reproduced in this report.
- Exploit scenario: A person or system with access to an unsanitized build
  artifact or uploaded Worker source retrieves a service-role credential, then
  bypasses Supabase RLS and reads or changes customer data. A recovered bootstrap
  admin credential could also be reused wherever it remained active.
- Remediation: `backend/scripts/scrub-opennext-env.mjs` now removes every value
  except `NEXT_PUBLIC_*` from the generated OpenNext environment module.
  Cloudflare build, preview, and deploy commands run that scrubber, and deploy
  preserves encrypted runtime bindings with `--keep-vars`. `.dev.vars*` is now
  ignored.
- Validation: Fingerprint scanning of `.next`, `backend/.next`, and `.open-next`
  found no server-secret values after the fix. The scrubber also asserts all
  three generated modes contain public keys only.
- Residual risk: Rotate affected credentials if any old unsanitized artifact left
  the machine; repository evidence cannot answer that operational question.

### SEC-002 — Guest order confirmation IDOR exposed customer PII

- Severity: High
- Confidence: 10/10
- Status: Fixed
- Evidence: `/order/[reference]` authorized access using only a short,
  human-readable order reference and rendered customer/order detail.
- Exploit scenario: An anonymous attacker enumerates or obtains short references
  and opens confirmation pages belonging to other customers, exposing names,
  email, phone, delivery addresses, order contents, totals, and payment state.
- Remediation: Checkout now issues a per-reference HMAC bearer token derived with
  `SESSION_SECRET`. Guest pages require the token; an active signed-in order owner
  or fully initialized administrator is the only bypass. Denials return 404.
  Token-bearing pages are private/no-store, excluded from indexing, and use a
  no-referrer policy. Stripe and local checkout redirects preserve the token.
- Validation: Tests confirmed valid access, cross-order rejection, and tamper
  rejection. The production route build succeeded.

### SEC-003 — Suspended or banned customer sessions retained access

- Severity: High
- Confidence: 9/10
- Status: Fixed
- Evidence: Account status was enforced at sign-in/callback time, while existing
  Supabase Auth sessions and several password/profile flows trusted `getUser()`
  without rechecking application status.
- Exploit scenario: A customer is suspended after signing in but continues using
  the existing refresh session to view account data or invoke account actions.
- Remediation: Middleware, server-side current-user resolution, client account
  loading, profile actions, password reset, password change, sign-in, and OAuth
  callback now fail closed unless the `public.users` row exists and is `active`.
  Blocked sessions are signed out.
- Validation: The protected middleware and all changed auth paths compiled in the
  production build.

### SEC-004 — Customer role had table-wide update privilege on identity metadata

- Severity: Medium
- Confidence: 10/10
- Status: Fixed in migrations; deployment migration required
- Evidence: RLS limited updates to a customer's own row, but `authenticated` had
  table-level update privilege and the policy preserved only selected fields.
  Direct API clients could alter server-owned metadata such as verification,
  deletion, audit, and public identifier fields on their own row.
- Exploit scenario: A signed-in user bypasses the application form and sends a
  direct Supabase update that falsifies verification/audit state or corrupts the
  identity record while satisfying the row policy.
- Remediation: Revoke table update from `authenticated`; grant only
  `UPDATE(username)`. Both the bootstrap migration and forward hardening
  migration carry the restriction.
- Validation: SQL policy and privilege statements were reviewed together.
- Residual risk: Existing Supabase projects remain exposed until migration 0004
  is applied.

### SEC-005 — Profile photographs were publicly readable

- Severity: Medium
- Confidence: 9/10
- Status: Fixed in code and migrations; deployment migration required
- Evidence: The avatars bucket was public and application code constructed
  permanent public object URLs despite profiles themselves being private.
- Exploit scenario: Anyone who discovers or receives an avatar object path can
  retrieve a customer's profile photograph without an authenticated profile
  read, and the permanent URL can be retained or redistributed.
- Remediation: The bucket is private with owner-select policy. Customer and admin
  views resolve short-lived signed URLs; insecure external `http://` avatar
  values are not rendered.
- Validation: Public URL construction was removed from client, server, and admin
  data paths.
- Residual risk: Existing Supabase projects remain public until migration 0004 is
  applied; already copied images cannot be recalled.

### SEC-006 — Known npm dependency advisories

- Severity: High (advisory maximum)
- Confidence: 10/10
- Status: Fixed
- Evidence: Initial npm audit reported a high-severity `nanoid` advisory and a
  moderate `esbuild` advisory in the installed graph.
- Exploit scenario: A reachable vulnerable transitive code path could allow
  resource exhaustion or expose development-server responses. Reachability was
  not established, but known vulnerable packages in build/runtime supply chains
  are unnecessary risk.
- Remediation: Workspace overrides and lockfile deduplication select patched
  versions.
- Validation: `npm audit` and `npm audit --omit=dev` both report zero known
  vulnerabilities.

### SEC-007 — Local secrets and customer artifacts were readable by other users

- Severity: Medium
- Confidence: 10/10
- Status: Fixed
- Evidence: Local environment files, SQLite database/WAL files, and mail outbox
  files containing customer/order information had mode `0644`; data directories
  had mode `0755`.
- Exploit scenario: Another local OS account or process can read credentials,
  customer addresses, order detail, or database pages on a shared host.
- Remediation: Existing sensitive files are `0600` and directories `0700`.
  Outbox creation now enforces those modes even when directories already exist,
  and writes use exclusive creation to avoid overwriting or following an existing
  filename.
- Validation: Filesystem mode inspection confirmed the owner-only modes.

### SEC-008 — GitHub Actions used mutable release tags

- Severity: Medium
- Confidence: 10/10
- Status: Fixed
- Evidence: CI referenced `actions/checkout@v4` and `actions/setup-node@v4`.
- Exploit scenario: If a mutable upstream tag is moved or the publisher is
  compromised, CI executes different code with repository and workflow token
  access without a repository change.
- Remediation: Both official actions are pinned to resolved full commit SHAs,
  with the release major retained as a comment for maintainability.
- Validation: Remote tag targets were resolved from the official repositories
  before pinning.

### SEC-009 — Bootstrap administrator could use the full admin before rotating password

- Severity: Medium
- Confidence: 9/10
- Status: Fixed
- Evidence: The initial environment-provided administrator was created with
  `mustChangePassword=false`; the flag also did not gate admin pages, uploads,
  invoices, or order access.
- Exploit scenario: A bootstrap password retained in deployment configuration or
  shared during setup remains a long-lived full-admin credential.
- Remediation: New bootstrap administrators must change their password. The admin
  guard redirects flagged sessions to the password page, and non-page admin
  checks deny access until rotation is complete.
- Validation: All admin pages and server actions were enumerated for the shared
  guard; the production build succeeded.

### SEC-010 — Payment return URL trusted attacker-controlled proxy headers

- Severity: High
- Confidence: 9/10
- Status: Fixed
- Evidence: When `NEXT_PUBLIC_SITE_URL` was absent, checkout constructed Stripe
  success and cancellation URLs from `X-Forwarded-Host` or `Host`. The success
  URL includes the private guest-order credential after SEC-002's remediation.
- Exploit scenario: On a proxy or deployment that forwards an unvalidated host,
  an attacker submits checkout with their domain in the host header. Stripe then
  returns the customer and the order bearer token to the attacker's domain.
- Remediation: Payment URLs now come only from a configured, parsed site origin.
  Production payment checkout requires HTTPS and rejects credentials, paths,
  queries, and fragments. No request header can influence the destination, and
  validation happens before the order is written.
- Validation: The changed checkout path passed formatting and the production
  build; all request-header origin fallback code was removed.

## STRIDE summary

| Threat | Principal controls after remediation |
| --- | --- |
| Spoofing | HMAC admin sessions, Supabase token verification, active-status checks, trusted payment origin |
| Tampering | Zod validation, restricted column grants, RLS, admin guards |
| Repudiation | Account activity and order/payment records; production log review remains operational |
| Information disclosure | Private order tokens, signed avatars, no-store/referrer headers, private file modes, scrubbed build env |
| Denial of service | Rate limits and patched dependency graph; in-memory limits remain per-instance |
| Elevation of privilege | Service-role server boundary, mandatory bootstrap rotation, pinned CI actions |

## Verification performed

- Production backend build: passed.
- `npm audit`: zero vulnerabilities.
- `npm audit --omit=dev`: zero vulnerabilities.
- Order bearer-token behavior: passed valid, cross-reference, and tamper checks.
- Generated environment scrub invariant: passed.
- Server-secret fingerprint scan of generated Next/OpenNext artifacts: no hits.
- Git tracked-file and history secret review: no committed credential material found.
- Sensitive local file permissions: confirmed `0600` files and `0700` directories.
- `git diff --check`: passed.

The repository-wide formatter still reports four pre-existing files and the
repository type-check has pre-existing failures in unrelated database/cart/release
code. Next.js is configured to skip type validation during build. These are
engineering-quality and verification gaps worth fixing, but no new error was
attributable to the security changes.

## Recommended operational follow-up

1. Apply Supabase migration 0004 in staging and production, then verify the
   avatars bucket is private and an authenticated client can update only
   `public.users.username`.
2. Determine whether an unsanitized `.open-next` bundle was ever uploaded or
   deployed. If uncertain, rotate the privileged credentials listed in the
   executive summary and invalidate existing admin sessions.
3. Review Cloudflare deployment/source access logs and Supabase service-role/API
   logs for unusual access during the period the old bundle may have existed.
4. Repair the baseline type-check and formatter failures so CI can enforce both.
5. Add regression tests around order authorization, disabled-session behavior,
   and Supabase privilege/storage policy in the next test-suite investment.

## Calibration

Only findings with confidence at least 8/10 are included. Lower-confidence
patterns and non-reachable scanner matches were excluded. False-positive and
non-actionable candidates filtered during triage: 18.
