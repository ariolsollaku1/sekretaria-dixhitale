# PLT-09 — PDF document engine

| | |
|---|---|
| **Phase** | P3 |
| **Depends on** | PLT-08 |
| **Questions** | Q-40 (non-blocking): number format, QR verification, cancellation. The layouts themselves wait for Q-07…Q-10 |
| **Source** | SRC-012, SRC-059 (decision in [ADR-0007](../../02-architecture/adr/0007-pdf-gotenberg.md)) |
| **Brief** | [../modules/plt.md](../modules/plt.md) |

> Spec lifecycle: write → review → `specced` → build → tick tasks → `done`.

## 1. Context

Certificates, transcripts, exam records, contracts and diplomas are official documents with exact
layouts (SRC-012, SRC-059). ADR-0007: HTML/CSS templates, versioned, rendered to PDF by Gotenberg
(already in the stack), every issued document numbered, stored (PLT-08) with its SHA-256, and
reprinted from the stored file. The engine is not blocked; the real templates are (Q-07…Q-10).

## 2. Requirements

### User stories

- As a **sysadmin**, I want to write, preview, publish and replace the HTML template of each document type.
- As a **module** (certificates, exams, contracts…), I want one call that renders data into a numbered, stored PDF.
- As **anyone with a printed document**, I want to scan its QR code and see that it is genuine.

### Acceptance criteria (EARS)

| ID | Criterion |
|---|---|
| AC-1 | THE SYSTEM SHALL store templates per document `type` with an incrementing `version`, `language` (`sq`, `en`), validity from/to dates, status (`DRAFT`, `PUBLISHED`, `ARCHIVED`) and the HTML, and SHALL freeze a published or archived template in the database. |
| AC-2 | THE SYSTEM SHALL render a template with data using `{{path}}` (HTML-escaped), `{{{path}}}` (raw, for trusted markup such as the QR code), `{{#if path}}…{{/if}}` and `{{#each path}}…{{/each}}` (with `{{this}}` and `{{@index}}`), and SHALL escape every value by default; a missing value renders empty. |
| AC-3 | THE SYSTEM SHALL select, for a type, language and date, the published template valid on that date (latest version wins); IF none exists THEN issuing SHALL fail with `NO_TEMPLATE`. |
| AC-4 | THE SYSTEM SHALL convert the rendered HTML to PDF through Gotenberg (A4, print CSS honoured) and, IF Gotenberg is unreachable or answers with an error, SHALL fail with `UNAVAILABLE` without issuing a number. |
| AC-5 | WHEN a module issues a document, THE SYSTEM SHALL, in one transaction, allocate the next number of the type in the calendar year (`PREFIX-YYYY-NNNNN`, atomic, no duplicates under concurrency), store the PDF as a file (PLT-08, purpose `issued-document`) with its SHA-256, create the `IssuedDocument` with a random verification code, and audit it. |
| AC-6 | THE SYSTEM SHALL offer the template variables `{{number}}`, `{{issuedDate}}`, `{{verifyUrl}}` and `{{{qr}}}` (an inline SVG QR code of the verification URL) to every template. |
| AC-7 | THE SYSTEM SHALL serve reprints from the stored file only, readable by whoever the document type's `canRead` rule allows (registered by the owning module) and by the sysadmin. |
| AC-8 | THE SYSTEM SHALL answer `/verify/<code>` without login with the type label, number, issue date and status (`valid` or `cancelled`), nothing else, rate limited, and 404 for unknown codes. |
| AC-9 | WHEN an authorized user cancels an issued document with a reason, THE SYSTEM SHALL mark it cancelled (the file and number stay), audit it, and show it as cancelled on the verification page. |
| AC-10 | THE SYSTEM SHALL let a sysadmin list templates and issued documents, create a draft, edit it, preview it with the type's sample data as a PDF, publish and archive it, and issue a test document of the sample type, each audited; WHERE no module registered a type, only the sample type `plt.sample` exists. |
| AC-11 | THE SYSTEM SHALL restrict template management and the issued-documents list to `plt.document.manage` (sysadmin). |

### Out of scope

The real layouts (Q-07…Q-10), digital signatures, bulk issuing, e-mailing documents, a visual
template designer, fonts beyond what the Gotenberg image ships (Albanian ë and ç are covered).

### Assumptions

- Template authors are trusted staff (the sysadmin); output is still escaped by default.
- Gotenberg is reached at `GOTENBERG_URL`; tests run against a fake client, plus one real conversion when it is up.

## 3. Design

### Data model

```prisma
model DocumentTemplate { id, type, version Int, language, validFrom @db.Date, validTo? @db.Date,
  status, html String, notes?, createdAt…, publishedAt?  @@unique([type, version, language]) }
model DocumentCounter  { type, year Int, last Int  @@id([type, year]) }
model IssuedDocument   { id, type, number @unique, templateId, language, fileId @unique, sha256,
  verifyCode @unique, subjectType?, subjectId?, issuedAt, issuedById, cancelledAt?, cancelledById?, cancelReason? }
```

### Server (`src/lib/documents`)

`template.ts` (pure renderer), `types.ts` (registry: type, label key, number prefix, sample data, `canRead`), `gotenberg.ts` (client + injectable transport), `qr.ts`, `template.service.ts`, `issue.service.ts`, `queries.ts`, purposes + `/verify` page + admin pages.

### Permissions

`plt.document.manage` → sysadmin.

## 4. Tasks

- [x] **T1** — Models, migration (counter, frozen templates), permission, nav, env. (AC-1, AC-11)
- [ ] **T2** — Pure template renderer and number format with unit tests; type registry. (AC-2, AC-5, AC-6)
- [ ] **T3** — Gotenberg client, QR, template service, issue service, cancel; integration tests. (AC-3..AC-7, AC-9)
- [ ] **T4** — Admin pages (templates, preview, issued list, test document), verify page, i18n. (AC-8, AC-10)
- [ ] **T5** — E2E, docs. (all)

## 5. Test plan

| AC | Test |
|---|---|
| AC-1 | integration: version, freeze trigger |
| AC-2, AC-6 | unit: escaping, if/each, missing values, injection attempts |
| AC-3 | integration: validity windows, latest version, language |
| AC-4 | integration: fake transport failure issues nothing; a real conversion when Gotenberg is reachable |
| AC-5 | integration: numbering sequence, year rollover, concurrent issuing, rollback on failure |
| AC-7, AC-8, AC-9 | integration + e2e: readers, verify page content, cancel |
| AC-10, AC-11 | e2e: sysadmin flow; secretary refused |

## 6. Definition of done

- [ ] Tasks ticked, ACs tested; lint, typecheck, tests, e2e pass; i18n; docs (ADR-0007 note); FEATURES.md `done`
