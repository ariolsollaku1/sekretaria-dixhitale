# PLT — Platform

Cross-cutting foundation used by every module. Code lives in `src/lib/*`, infra in `infra/`.
Status, dependencies and blockers: [../FEATURES.md](../FEATURES.md).

### PLT-01 — Project scaffolding
- **Goal:** an empty but production-shaped Next.js repo that every later feature plugs into.
- **Scope:** Next.js App Router + TypeScript strict, pnpm, ESLint/Prettier, Vitest + Playwright,
  folder structure from [overview](../../02-architecture/overview.md), `.env.example`, CI workflow
  (lint, typecheck, test, `features.mjs --check`), `/api/health`.
- **Spec:** [../specs/PLT-01-scaffolding.md](../specs/PLT-01-scaffolding.md)

### PLT-02 — Docker Compose stack
- **Goal:** one command brings up Postgres, Keycloak, Gotenberg and Mailpit locally; the app can
  also run containerized.
- **Scope:** `docker-compose.yml` with profiles, app Dockerfile (standalone), Postgres init (two
  databases), health checks, volumes.
- **Spec:** [../specs/PLT-02-docker-stack.md](../specs/PLT-02-docker-stack.md)

### PLT-03 — Database layer & migrations
- **Goal:** Prisma wired up with the multi-file schema, conventions, seed mechanism and test DB.
- **Spec:** [../specs/PLT-03-database.md](../specs/PLT-03-database.md)

### PLT-04 — Authentication with Keycloak
- **Goal:** users sign in through Keycloak; no account is created implicitly.
- **Scope:** realm-as-code, Better Auth OIDC client, session, logout (incl. Keycloak SSO), "no
  access" page, bootstrap sysadmin.
- **Spec:** [../specs/PLT-04-authentication.md](../specs/PLT-04-authentication.md)

### PLT-05 — Authorization: roles, permissions, scopes
- **Goal:** every server action/query can ask "may this user do X on Y?" and lists are filtered by scope.
- **Spec:** [../specs/PLT-05-authorization.md](../specs/PLT-05-authorization.md)

### PLT-06 — App shell, UI kit & i18n
- **Goal:** logged-in layout with role-aware navigation, academic-year selector, locale switcher,
  shadcn/ui setup, next-intl catalogs.
- **Spec:** [../specs/PLT-06-app-shell.md](../specs/PLT-06-app-shell.md)

### PLT-07 — Audit log
- **Goal:** who changed what, when, from what to what — for every business mutation (SRC-043, SRC-152).
- **Spec:** [../specs/PLT-07-audit-log.md](../specs/PLT-07-audit-log.md)

### PLT-08 — File storage
- **Goal:** upload, store and serve files safely (ADR-0010).
- **Scope:** `Storage` interface + local-volume implementation, `StoredFile` model, upload component
  (size/MIME limits), permission-checked download route, SHA-256, orphan cleanup job hook.

### PLT-09 — PDF document engine
- **Goal:** turn versioned HTML templates + data into numbered, stored PDFs (ADR-0007).
- **Scope:** `DocumentTemplate` (type, version, validity, language), rendering to HTML, Gotenberg
  client, `IssuedDocument` numbering service (per type/year sequence), store file via PLT-08,
  optional QR verification code + public verify page, template preview for sysadmin.
- **Notes:** the engine is not blocked; individual templates are (Q-07…Q-10).

### PLT-10 — Data tables, filters & export
- **Goal:** one reusable list component for the dozens of lists in the source (SRC-021, SRC-082).
- **Scope:** server-side pagination/sort/filter (URL-synced), column chooser, saved filters per
  user, export current result to **Excel (xlsx)**, CSV and printable PDF; exports respect
  permissions and are audited.

### PLT-16 — Global search (menus & content)
- **Goal:** find any page or record from one box in the top bar (not in the source requirements; a
  usability feature on top of PLT-06/PLT-10).
- **Scope:** command palette (click or ⌘K). Menu pages are matched in the browser from the
  permission-filtered navigation; content is matched by per-module search sources that reuse each
  module's list permission and scope filter. v1 sources: students, applications, staff, programs,
  courses, issued documents, users.

### PLT-11 — Notifications (in-app + email)
- **Goal:** tell users when something needs them (SRC-037d "notification whenever something
  arrives", SRC-086 reminders).
- **Scope:** `Notification` (bell + list, mark read), templated emails through an `EmailOutbox`
  processed by a job, per-type user preferences (where allowed), i18n templates.
- **Mail transport (Q-20, answered):** LOGOS uses **Microsoft 365 / Exchange Online**. Implement a
  `MailTransport` interface with two adapters: **Microsoft Graph `sendMail`** (app registration,
  client credentials — preferred) and **SMTP** (Mailpit in dev; SMTP AUTH with OAuth 2.0 if Graph is
  not possible). Microsoft has been retiring Basic auth for SMTP AUTH, so don't rely on
  username/password SMTP; check current Microsoft guidance when implementing. **No SMS in v1** — the
  interface leaves room for an SMS channel later.

### PLT-12 — Background jobs & scheduler
- **Goal:** reliable async and scheduled work (ADR-0008).
- **Scope:** pg-boss setup, worker process, cron registration, idempotency keys, job dashboard
  for sysadmin (recent runs, failures, retry).

### PLT-13 — Backups, restore & full data export
- **Goal:** answer SRC-150/151: data are backed up, restorable, and exportable in open formats.
- **Scope:** `backup` service (nightly `pg_dump` of both DBs + files tarball, retention policy),
  restore script + runbook, CI test that restores a backup into a fresh DB, sysadmin "full export"
  (CSV per table + JSON + files, zipped, audited).

### PLT-14 — Personal data protection controls
- **Goal:** compliance features for the Albanian data protection law (SRC-152) — Law No. 124/2024,
  GDPR-aligned (research finding in Q-16, to confirm), so build to GDPR-level requirements.
- **Scope (to confirm with Q-16):** consent capture on public forms, retention rules + scheduled
  anonymization/deletion, data-subject export of a person's data, processing register export,
  access log for sensitive views.
- **Blocked by:** Q-16.

### PLT-15 — Forms engine
- **Goal:** one engine for ~20 forms, public and authenticated (ADR-0009, SRC-037, SRC-133).
- **Scope:** `FormDefinition` (versioned JSON: fields, validation, conditions, audience, workflow,
  notifications, handler key), renderer (RHF + Zod generated from definition), public route
  `/f/<key>` with rate limit + honeypot/CAPTCHA, file fields via PLT-08, submissions inbox per
  owning office (filter, assign, change state, comment), submitter notifications, handler hook on
  approval, form builder UI for sysadmin (JSON editor with preview is enough for v1).
