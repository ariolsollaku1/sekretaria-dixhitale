# CUR-03 — Syllabi

| | |
|---|---|
| **Phase** | P1 |
| **Depends on** | CUR-02, PLT-08 |
| **Questions** | Q-41 (non-blocking): PDF in v1, coordinator / head of department / sysadmin upload and approve, versions, carry forward as a draft, approved syllabi readable by everyone who sees the plan |
| **Source** | SRC-055, SRC-110, SRC-112 |
| **Brief** | [../modules/cur.md](../modules/cur.md) |

> Spec lifecycle: write from this template → review with the user → set Status `specced` in
> FEATURES.md → build task by task → tick tasks → Status `done`.

## 1. Context

SRC-055: the curriculum plan with credits and the **syllabi** of each program for each academic year
(students ask for them later, for further studies or employment). SRC-110/SRC-112: the current
syllabi, and those approved in past years, are kept. CUR-02 holds the plan and its courses; this
feature attaches a syllabus document to each course of a plan **for an academic year**, with a
draft → approved → archived life and a kept history. It is also the source CUR-06 (package for
students) and CUR-07 (approved documents archive) will read.

## 2. Requirements

### User stories

- As a **program coordinator or head of department**, I want to upload the syllabus of each course of
  a plan for an academic year and approve it, so that the approved one is the official one.
- As a **coordinator**, I want to carry last year's syllabi forward and only change what changed.
- As a **student, lecturer or staff member**, I want to open the approved syllabus of a course.
- As **quality or the secretariat**, I want to see which courses still have no approved syllabus and the history.

### Acceptance criteria (EARS)

| ID | Criterion |
|---|---|
| AC-1 | THE SYSTEM SHALL store syllabi per `planCourseId` and `academicYearId` with an incrementing `version`, `status` (`DRAFT`, `APPROVED`, `ARCHIVED`), the PDF (a PLT-08 file, purpose `syllabus`), notes, who created and who approved it and when. |
| AC-2 | WHEN an authorized user uploads a PDF for a course of an **approved** plan in a year that is not closed, THE SYSTEM SHALL create a `DRAFT` with the next version and attach the file; IF the plan is not approved, the year is closed, or the file is not the user's own pending file of purpose `syllabus` THEN it SHALL refuse. |
| AC-3 | WHILE a syllabus is a draft, THE SYSTEM SHALL let an authorized user replace its file, edit its notes, or delete it (drafts are technical rows; the file is soft-removed). |
| AC-4 | WHEN an authorized user approves a draft, THE SYSTEM SHALL mark it `APPROVED`, archive the previously approved version of the same course and year, and audit both. |
| AC-5 | THE SYSTEM SHALL freeze an approved or archived syllabus in the database: nothing changes except `APPROVED → ARCHIVED`, and it is never deleted. |
| AC-6 | THE SYSTEM SHALL show the full version history of a course and year (version, status, file name, who, when, notes) to staff. |
| AC-7 | WHEN an authorized user carries forward into a year, THE SYSTEM SHALL, for each course of the chosen plan that has no draft or approved syllabus in that year, create a `DRAFT` whose file is a copy of the latest approved syllabus of the same course in the same program in an earlier year, skip the others, report the counts, and audit each created syllabus. |
| AC-8 | THE SYSTEM SHALL show, for a plan and academic year, each plan course with the state of its syllabus (approved version, draft, or missing) and the number of courses without an approved syllabus. |
| AC-9 | THE SYSTEM SHALL serve a syllabus file only through the files route: an approved one to whoever holds `cur.syllabus.view`, a draft or archived one to `cur.syllabus.read` holders (inside their scope). |
| AC-10 | THE SYSTEM SHALL restrict writing (upload, replace, edit, delete, approve, carry forward) to `cur.syllabus.write` checked against the plan's program (coordinator: their program; head of department: their department's programs; sysadmin), and audit every change. |

### Out of scope

A structured syllabus form (Q-41), editing PDFs, per-student packages (CUR-06), the cross-year archive
view (CUR-07), lecturer self-service upload, notifications on approval.

### Assumptions

- Only plans in status `APPROVED` take syllabi (a draft plan's courses can still change).
- "Same course in the same program" is matched by `courseId` through any plan of the program, so a
  new plan version can inherit the syllabi of the old one.
- PDF only, up to the platform limit (Q-27).

## 3. Design

### Data model

```prisma
enum SyllabusStatus { DRAFT APPROVED ARCHIVED }

model Syllabus {
  id, planCourseId, academicYearId, version Int, status SyllabusStatus,
  fileId String @unique, notes String?, approvedAt?, approvedById?,
  createdAt, updatedAt, createdById, updatedById
  @@unique([planCourseId, academicYearId, version])
  @@index([planCourseId, academicYearId, status])
}
```

DB: a partial unique index allows **one `APPROVED`** per `(plan_course_id, academic_year_id)`; a
trigger freezes non-draft rows (only `APPROVED → ARCHIVED`, `updated_at`, `updated_by_id` may change)
and forbids deleting them.

### Permissions

| Permission | Granted to |
|---|---|
| `cur.syllabus.view` | every role that has `cur.plan.view` (approved syllabi) |
| `cur.syllabus.read` | sysadmin, head_of_department, program_coordinator, secretary, student_affairs, hr, quality (drafts, archive; scoped like plans) |
| `cur.syllabus.write` | sysadmin, head_of_department, program_coordinator (scoped to the plan's program) |

### Server

| Kind | Name | Purpose |
|---|---|---|
| domain | `domain/syllabus-rules.ts`, `syllabus-schemas.ts` | cell state, carry-forward planning, Zod |
| service | `syllabus.service.ts` | upload, replace, edit, delete, approve, carry forward (+ audit) |
| queries | `syllabus.queries.ts` | board for a plan × year, history |
| purpose | `syllabus.purposes.ts` | file purpose `syllabus` (upload `cur.syllabus.write`, read rule) |

### UI

| Route | Who | What |
|---|---|---|
| `/cur/syllabi` | view | pick program, plan and (selected) academic year; table of plan courses with state; upload / approve / carry forward for writers; download links |
| `/cur/syllabi/[planCourseId]` | read | history of the course for the selected year |

### Edge cases & errors

- Two uploads at once get versions 1 and 2 (unique key; the second retries once).
- Approving twice, or approving a non-draft → conflict.
- Carry forward with nothing to copy reports `0 created`.
- A source file missing on the volume is skipped and reported, not fatal.

## 4. Tasks

- [x] **T1** — `syllabus.prisma` + migration (partial unique, freeze trigger); permissions; file purpose; nav. (AC-1, AC-5, AC-9, AC-10)
- [x] **T2** — Pure rules and schemas with unit tests. (AC-2, AC-4, AC-7, AC-8)
- [x] **T3** — Service and queries; integration tests. (AC-2..AC-10)
- [ ] **T4** — Board, history page, upload / approve / carry-forward UI, i18n. (AC-6..AC-8)
- [ ] **T5** — E2E, seed, docs. (all)

## 5. Test plan

| AC | Test type | Test |
|---|---|---|
| AC-1, AC-5 | integration | columns, unique approved, freeze trigger, no delete |
| AC-2, AC-3 | integration | upload gates (plan status, closed year, foreign file); replace, edit, delete a draft |
| AC-4 | integration | approve archives the previous |
| AC-6, AC-8 | integration | history; board states and missing count |
| AC-7 | unit + integration | planning by course; copies bytes; skips; counts |
| AC-9, AC-10 | integration + e2e | read rules per state; coordinator inside / outside scope; student sees approved only |

## 6. Definition of done

- [ ] All tasks ticked, all ACs covered by tests
- [ ] `pnpm lint && pnpm typecheck && pnpm test` pass; E2E for user-facing flows pass
- [ ] Security checklist in [conventions.md](../../02-architecture/conventions.md#security-checklist-every-feature) satisfied
- [ ] i18n keys added (`en` and `sq`)
- [ ] Docs updated (domain model, brief)
- [ ] FEATURES.md Status → `done`; `node scripts/features.mjs --write`
