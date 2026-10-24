# HR-04 — Lecturer attendance & delivered hours

| | |
|---|---|
| **Phase** | P6 |
| **Depends on** | ATT-01 (builds on CUR-04, HR-01, PLT-10 — all done) |
| **Questions** | Q-22 (delivered = sessions marked held; head of department approves monthly), Q-131 (approval rules), Q-132 (adjustments), Q-133 (who sees what) — all non-blocking |
| **Source** | SRC-061, SRC-066 |
| **Brief** | [../modules/hr.md](../modules/hr.md) |

> Spec lifecycle: write → review → `specced` → build → tick tasks → `done`.

## 1. Context

SRC-061 asks for a lecturer attendance list; SRC-066 for a record of the hours delivered by
internal (PAE) and external (PAK) lecturers per month and semester, for each course. ATT-01 already
stores class sessions per teaching assignment with whole `hours`, and a lecturer marks a session
`HELD` when saving attendance (Q-22). This feature turns held sessions into **delivered hours**:
a monthly summary per lecturer (the attendance list), approval by the head of department,
adjustments with a reason, and reports. Finance reads the approved figures for payment (FIN-06
later).

## 2. Requirements

### User stories

- As a **lecturer**, I want to see the sessions I held each month and their hours, and whether the head has approved them.
- As a **head of department**, I want to review the hours of the lecturers of my department for a month, correct them with a reason and approve the month.
- As **HR / Finance**, I want reports of delivered hours per lecturer, course, month and semester, PAE versus PAK.

### Acceptance criteria (EARS)

| ID | Criterion |
|---|---|
| AC-1 | THE SYSTEM SHALL count as delivered the `hours` of every `HELD` class session of a teaching assignment, in the month of the session date (Europe/Tirane), grouped by lecturer, assignment (course, kind, group, plan semester) and month; `PLANNED` and `CANCELLED` sessions count for nothing. |
| AC-2 | THE SYSTEM SHALL give a user with `hr.hours.self` a page `/hr/hours/mine` with their own months of the selected academic year (sessions, held hours, adjustments, total, approval state, sessions still unrecorded) and, per month, the list of their sessions with date, time, hours, course and status; every query is keyed on the signed-in user's own staff record. |
| AC-3 | THE SYSTEM SHALL give a user with `hr.hours.read` a table `/hr/hours` (PLT-10) with one row per lecturer and month (lecturer, category, department, month, sessions, held hours, adjustments, total, state), filterable by month, category, department code, lecturer and state, sorted by month then lecturer, exportable, and limited to the lecturers in the user's scope. |
| AC-4 | THE SYSTEM SHALL give readers a table `/hr/hours/report` (PLT-10) with one row per course assignment and month (lecturer, category, course, kind, group, semester, month, sessions, held hours, adjustments, total), filterable by month, semester, category (PAE / PAK / volunteer), department code, course and lecturer, exportable, with totals of the filtered rows per category. |
| AC-5 | THE SYSTEM SHALL give readers a detail page `/hr/hours/[staffId]?month=YYYY-MM` with the lecturer's assignments, sessions, adjustments and approval state for that month; a lecturer outside the reader's scope answers not found. |
| AC-6 | WHEN a holder of `hr.hours.approve` for the lecturer (head of department of the lecturer's department) approves a month that has ended, THE SYSTEM SHALL store the approval with the held hours and adjustment hours at that moment, the approver and the time, and audit it; WHEN the month has not ended yet, or has no hours and no adjustments, THE SYSTEM SHALL refuse. |
| AC-7 | THE SYSTEM SHALL show an approval as `APPROVED` while the stored figures equal the current ones, as `CHANGED` when sessions were corrected afterwards (the month needs a new approval), as `OPEN` after a reopen, and as `PENDING` when never approved. |
| AC-8 | WHEN an approver reopens an approved month with a written reason, THE SYSTEM SHALL set it `OPEN` (the approval row is kept) and audit the reason. |
| AC-9 | WHEN a holder of `hr.hours.adjust` for the lecturer adds an adjustment (assignment of that lecturer, month inside the assignment's academic year, non-zero whole hours between -100 and 100, reason 3–300 characters), THE SYSTEM SHALL store it, add it to the month's total and audit it; adjustments are never edited or deleted (a correction is a new, opposite adjustment). |
| AC-10 | IF the month is `APPROVED` or `CHANGED`, the academic year is closed, or the assignment belongs to another lecturer, THEN THE SYSTEM SHALL refuse the adjustment; the approver must reopen first. |
| AC-11 | THE SYSTEM SHALL restrict reading to `hr.hours.read` (HR, Finance, Secretariat, sysadmin institution-wide; head of department by department), the own view to `hr.hours.self` (lecturer), approval and reopening to `hr.hours.approve` (head of department) and adjustments to `hr.hours.adjust` (head of department, HR), re-checking the lecturer's scope in the service, and audit every change without personal data (ids only). |
| AC-12 | THE SYSTEM SHALL work at 360 px width: the own-hours page is a vertical list of cards. |

### Out of scope

Payment amounts, payroll and Finance 5 data (FIN-06, INT-02); contracts (HR-02); attendance of students
(ATT-01/02); automatic notification of the head when a month ends; per-course approval.

### Assumptions

Q-22 and Q-131…Q-133. A "month" is a calendar month (Europe/Tirane); the semester of a row is the plan
semester (1 or 2) of its assignment (as CUR-05).

## 3. Design

### Data model

```prisma
// prisma/schema/hours.prisma
enum HoursApprovalStatus { APPROVED OPEN }

/// Monthly approval of a lecturer's delivered hours (HR-04); rows are kept when reopened.
model HoursApproval {
  id, staffId, month String (YYYY-MM), status, heldHours, adjustmentHours,
  decidedAt, decidedById, createdAt, updatedAt
  @@unique([staffId, month])
}
/// A signed correction of delivered hours with a reason (HR-04); append-only.
model HoursAdjustment {
  id, staffId, assignmentId, month, hours (non-zero), reason, createdAt, createdById
  @@index([staffId, month]) @@index([assignmentId])
}
```
Checks: `month ~ '^\d{4}-(0[1-9]|1[0-2])$'`, `hours <> 0`.

### Permissions

| Permission | Granted to |
|---|---|
| `hr.hours.read` | hr, finance, secretary, sysadmin, head_of_department (by department) |
| `hr.hours.self` | lecturer |
| `hr.hours.approve` | head_of_department |
| `hr.hours.adjust` | head_of_department, hr |

A target resolver `staff` (HR) maps a staff id to its department and faculty for the checks.

### Server

| Kind | Name | Purpose |
|---|---|---|
| domain | `domain/hours-rules.ts`, `domain/hours-schemas.ts` | month helpers, aggregation of sessions and adjustments, approval state, validation; Zod |
| service | `server/hours.service.ts` | approve, reopen, adjust (+ audit) |
| queries | `server/hours.queries.ts` | month rows, assignment rows, detail, own months |
| tables | `server/hours.tables.tsx` | `hr.hours`, `hr.hours-report` |
| ui | `ui/hours-detail.tsx`, `ui/hours-actions.tsx`, `ui/own-hours.tsx` | pages and the approve / reopen / adjust forms |
| cross-module | ATT sessions are read from the `ClassSession` table through HR-owned queries; CUR `getAssignmentContext`, ORG `getYear` | |

### UI

| Route | Who | What |
|---|---|---|
| `/hr/hours/mine` | self | own months and sessions |
| `/hr/hours` | read | monthly table |
| `/hr/hours/report` | read | per course report |
| `/hr/hours/[staffId]` | read | month detail with approve / reopen / adjust |

## 4. Tasks

- [x] **T1** — Model, migration, permissions, staff target resolver, nav. (AC-11)
- [x] **T2** — Pure rules and schemas with unit tests. (AC-1, AC-6, AC-7, AC-9)
- [x] **T3** — Queries and service; integration tests. (AC-1..AC-11)
- [x] **T4** — Tables, pages, forms, i18n sq/en. (AC-2..AC-5, AC-12)
- [x] **T5** — Seed, e2e (main flow + forbidden), docs. (all)

## 5. Test plan

| AC | Test |
|---|---|
| AC-1, AC-7, AC-9 (rules) | unit `hours-rules.test.ts` |
| AC-1..AC-11 | integration `hours.service.int.test.ts` (aggregation, scope, approve / changed / reopen, adjustments, foreign head refused, month not ended) |
| AC-2..AC-5, AC-11, AC-12 | e2e: lecturer sees own hours; head approves; student and lecturer refused on `/hr/hours` |

## 6. Definition of done

- [x] All tasks ticked, all ACs covered by tests
- [x] `pnpm lint && pnpm typecheck && pnpm i18n:check && pnpm test` pass; E2E pass
- [x] i18n keys added (`en` and `sq`)
- [x] Docs updated (domain model, FEATURES.md `done`, `node scripts/features.mjs --write`)
