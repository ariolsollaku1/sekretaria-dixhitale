# CUR-06 — Curriculum & syllabi package for students

| | |
|---|---|
| **Phase** | P5 |
| **Depends on** | CUR-03, PLT-09 |
| **Questions** | Q-114 (non-blocking): secretariat issues, student self-service with a limit; Q-115: which syllabus per course; Q-116: courses without a syllabus; Q-117: number, layout and readers |
| **Source** | SRC-055 |
| **Brief** | [../modules/cur.md](../modules/cur.md) |

> Spec lifecycle: write from this template → review with the user → set Status `specced` in
> FEATURES.md → build task by task → tick tasks → Status `done`.

## 1. Context

SRC-055: students and graduates ask, at different times and for different purposes (further studies,
employment), for the curriculum plan with credits and the syllabi. CUR-02 holds the plan, CUR-03 the
approved syllabi (PDF files), PLT-09 the numbered, stored, verifiable PDF documents. This feature
builds, for one enrollment, **one PDF**: a cover and plan table rendered from an HTML template
(credits per course, per semester and in total) followed by the approved syllabi of the plan's courses,
and issues it through the document engine as the type `cur.study-package`. No new table: the package is
an `IssuedDocument` whose subject is the enrollment.

## 2. Requirements

### User stories

- As a **secretary or student-affairs officer**, I want to find a student and issue their plan-and-syllabi
  package in Albanian or English, so that I can hand it over when they ask.
- As a **student**, I want to generate and download the package of my own enrollment, so that I do not need
  to ask the secretariat.
- As a **secretary**, I want to see which packages were issued, and how many syllabi each contained.

### Acceptance criteria (EARS)

| ID | Criterion |
|---|---|
| AC-1 | THE SYSTEM SHALL register the document type `cur.study-package` (prefix `PLN`) with PLT-09, so that numbering, storage, SHA-256, the QR code and the verification page apply. |
| AC-2 | WHEN an authorized user requests a package for an enrollment in `sq` or `en`, THE SYSTEM SHALL take the plan of the enrollment's cohort, collect every plan course with its credits (grouped by year of study and semester, with totals) and, per course, the syllabus chosen by AC-3, and issue one PDF: the rendered template followed by the chosen syllabus PDFs in plan order. |
| AC-3 | THE SYSTEM SHALL choose per plan course the **approved** syllabus of the academic year in which the student was registered for that course's year of study; IF there is none THEN the approved syllabus of the most recent academic year; drafts and archived versions are never used. |
| AC-4 | IF a course has no approved syllabus, or its file is missing or not a readable PDF, THEN THE SYSTEM SHALL still issue the package, mark the course "no syllabus" in the plan table and report the count in the result. |
| AC-5 | IF the cohort's plan is not `APPROVED`, or the enrollment does not exist, or the plan has no courses, THEN THE SYSTEM SHALL refuse and issue no number. |
| AC-6 | WHEN issuing fails (no published template for the language and date, PDF conversion unavailable) THE SYSTEM SHALL issue nothing and use no number (PLT-09 AC-4/5). |
| AC-7 | THE SYSTEM SHALL let `cur.package.issue` holders issue and list packages for students enrolled in programs within their scope, and `cur.package.self` holders issue and list packages **only for their own enrollments**; anyone else is refused. |
| AC-8 | WHILE a student issues for themselves, THE SYSTEM SHALL allow at most 3 new packages per hour per student; a further request is refused with a message. |
| AC-9 | THE SYSTEM SHALL serve a reprint only from the stored file through the files route, readable by the student of the enrollment, by `cur.package.issue` holders in scope, and by the sysadmin (PLT-09 AC-7). |
| AC-10 | THE SYSTEM SHALL audit every issue with the enrollment, the plan version, the language and the counts of courses and included syllabi (ids and numbers only, no personal data). |
| AC-11 | THE SYSTEM SHALL offer staff a page to search a student by number or name (within scope), see the enrollments with a preview (courses, syllabi available, missing), issue a package and list the packages issued; and the student a page with their own enrollments, the same preview, a "generate" button and their issued packages. |

### Out of scope

The final layout of the cover (the template is edited by the sysadmin in PLT-09; a default is seeded
for development), a signature or stamp, e-mailing the package, bulk issuing for a whole cohort, a
package limited to some years of study, a request form that triggers it automatically (STU-07 may
call the service later), grades and transcripts (EXM/GRD).

### Assumptions (Q-114…Q-117, all non-blocking)

- Secretary and student affairs issue for students in scope; students may issue their own, at most
  3 per hour (Q-114).
- The syllabus per course follows AC-3 (Q-115); a missing syllabus does not block (Q-116).
- Prefix `PLN`; cover content (program, student, cohort, plan version, table, totals) is a working
  proposal; the package is informational and carries no signature (Q-117).
- The template for `cur.study-package` must be published by the sysadmin per language; in production
  without one, issuing fails with `NO_TEMPLATE` and the page says so.

## 3. Design

### Data model

No new table or migration. `IssuedDocument`: `type = "cur.study-package"`, `subjectType = "Enrollment"`,
`subjectId = enrollmentId`, `issuedById` the staff member or the student. `domain-model.md` gets a note.

### Engine change (PLT-09)

`IssueInput` gets an optional `finalize(pdf) => Promise<Uint8Array>` that runs after the HTML is converted
and before the SHA-256 and storage, so the stored hash is that of the final bundle. Dependency:
`pdf-lib` (pure JavaScript, merges pages).

### Permissions

| Permission | Granted to |
|---|---|
| `cur.package.issue` | sysadmin, secretary, student_affairs (scoped to the enrollment's program) |
| `cur.package.self` | student (own enrollments only) |

### Server (`src/modules/cur`)

| Kind | Name | Purpose |
|---|---|---|
| domain | `domain/package-rules.ts` | pick the syllabus per course (AC-3), group semesters, totals, template data, self-service limit |
| service | `package.service.ts` | `issuePackage(ctx, {enrollmentId, language})`: gates, collect, merge, `issueDocument`, audit |
| queries | `package.queries.ts` | preview, student search within scope, issued list, own enrollments |
| doc type | `package.document.ts` | register `cur.study-package` and its `canRead` |
| actions | `package.actions.ts` | `issuePackageAction` (issue or self, decided by the enrollment) |

### UI

| Route | Who | What |
|---|---|---|
| `/cur/packages` | `cur.package.issue` | search box, enrollments of the matches with preview and an issue button (language), list of recent packages |
| `/cur/my-package` | `cur.package.self` | own enrollments with preview, generate button, own issued packages |

### Edge cases & errors

- Two cohorts' plans differ per enrollment; the package always follows the enrollment's cohort plan.
- A student with several enrollments (second program) gets one package per enrollment.
- A deregistered or graduated student can still be issued a package (graduates ask, SRC-055).
- A syllabus PDF that cannot be parsed is treated as missing (AC-4), not as a failure.

## 4. Tasks

- [x] **T1** — Permissions, navigation, `finalize` hook in the engine, `pdf-lib`. (AC-1, AC-7)
- [x] **T2** — Pure rules and unit tests. (AC-3, AC-8)
- [x] **T3** — Document type, service, queries; integration tests. (AC-2..AC-10)
- [x] **T4** — Staff and student pages, i18n, default template, seed. (AC-11)
- [x] **T5** — E2E, docs. (all)

## 5. Test plan

| AC | Test type | Test |
|---|---|---|
| AC-3, AC-8 | unit | syllabus choice by year/fallback, drafts ignored, grouping and totals, hourly limit |
| AC-1, AC-2, AC-4 | integration | issues a merged PDF (page count = cover + syllabi), missing and corrupt syllabus counted, hash of the stored bundle |
| AC-5, AC-6 | integration | draft plan, unknown enrollment, no template: nothing issued, counter unchanged |
| AC-7, AC-8, AC-9 | integration | staff in/out of scope, student own/other, limit, reprint readers |
| AC-10 | integration | audit row content |
| AC-11 | e2e | secretary issues and downloads; student generates own; student cannot open the staff page |

## 6. Definition of done

- [x] All tasks ticked, all ACs covered by tests
- [x] `pnpm lint && pnpm typecheck && pnpm test` pass; E2E for user-facing flows pass
- [x] Security checklist in [conventions.md](../../02-architecture/conventions.md#security-checklist-every-feature) satisfied
- [x] i18n keys added (`en` and `sq`)
- [x] Docs updated (domain model, brief)
- [x] FEATURES.md Status → `done`; `node scripts/features.mjs --write`
