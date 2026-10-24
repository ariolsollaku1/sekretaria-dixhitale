# ATT-02 — Attendance reports & student absences view

| | |
|---|---|
| **Phase** | P4 |
| **Depends on** | ATT-01, STU-03 |
| **Questions** | Q-90…Q-94 (all non-blocking): percentage in hours, excused counts as absent; 75 % threshold per student and assignment; only held classes; students see their own percentage; readers by scope, selected year with optional dates |
| **Source** | SRC-036b, SRC-042 |
| **Brief** | [../modules/att.md](../modules/att.md) |

> Spec lifecycle: write → review → `specced` → build → tick tasks → `done`.

## 1. Context

ATT-01 records who was absent. SRC-042 asks for a report on student attendance and SRC-036b for
students to see their absences. ATT-02 turns the marks into figures: per student and course the
classes held, the hours present/absent/excused and the attendance percentage (Q-90), a summary per
group and course, and the list of students below the threshold (Q-91; 75 % is the Q-12 research
finding). Both reports are PLT-10 tables, so filters and Excel/CSV/print exports come for free. The
student's own page (`/att/absences`) gains a per-course summary. The eligibility decision for exams
stays in EXM-03 (Q-12); it will reuse the same pure function.

## 2. Requirements

### User stories

- As a **secretary, head of department or program coordinator**, I want a list of students with their
  attendance percentage per course, filtered to those below the threshold, and exportable.
- As the same reader, I want a summary per group and course with the number of students below.
- As a **student**, I want to see my attendance per course next to my absences.

### Acceptance criteria (EARS)

| ID | Criterion |
|---|---|
| AC-1 | THE SYSTEM SHALL compute, per student and teaching assignment (course and kind), over `HELD` sessions the student has a mark for: classes, hours held, hours present, absent and excused, and the attendance percentage `present hours / held hours` rounded to one decimal, excused counting as absent (Q-90, Q-92); planned and cancelled sessions never count. |
| AC-2 | THE SYSTEM SHALL read the threshold from the setting `att.thresholdPercent` (whole number 0–100, default 75) and flag a row whose percentage is strictly below it (Q-91); a row without held hours has no percentage and no flag. |
| AC-3 | THE SYSTEM SHALL offer a table `att.report` (page `/att/report`) of those rows for the selected academic year, filterable by program code, group name, course code/name, kind, "below threshold only" and from/to dates, sortable, and exportable (Excel, CSV, print) with the PLT-10 audit. |
| AC-4 | THE SYSTEM SHALL offer a table `att.summary` (page `/att/summary`): per assignment its program, group, course, kind, lecturer, held classes, held hours, students, average attendance (`sum present / sum held` hours) and students below the threshold, with the same filters. |
| AC-5 | THE SYSTEM SHALL show these tables only to users with `att.attendance.read` or `att.attendance.correct`, limited to the programs in the user's scope; a user outside the scope sees nothing of other programs and a user without the permission gets the 403 view and a 403 export (Q-94). |
| AC-6 | THE SYSTEM SHALL show the signed-in student, on `/att/absences`, a summary per course and kind for the selected year: held hours, absent and excused hours, percentage and a note when under the threshold, and their absences list as before; it SHALL show nothing about other students (Q-93). |
| AC-7 | THE SYSTEM SHALL add an absences shortcut to the student portal home. |
| AC-8 | THE SYSTEM SHALL keep the report pages usable at 360 px and accessible (PLT-10 table), with all text through next-intl (sq complete, en), and log no personal data. |

### Out of scope

Exam eligibility decision (EXM-03), attendance certificate (DOC-03), course register (EXM-09),
lecturer reports (HR-04), notifications to students below the threshold, semester filter, a setting
to count excused as present.

### Assumptions

See Q-90…Q-94.

## 3. Design

### Data model

No new tables. One new setting row `att.thresholdPercent` = 75 in the settings seed (default also in code).

### Permissions

Reuses `att.attendance.read`, `att.attendance.correct` (scoped by program) and `att.attendance.self`.

### Server

| Kind | Name | Purpose |
|---|---|---|
| domain | `domain/report-rules.ts` | pure: `summarize`, `percentOf`, `isBelow`, `resolveThreshold`, `groupSummary` |
| query | `server/report.queries.ts` | `attendanceRows(user, filters)` (scope-filtered aggregation), `assignmentSummaries`, `ownSummary(userId, yearId)`, `getThreshold` |
| tables | `server/report.tables.tsx` | `attReportTable`, `attSummaryTable` registered for PLT-10 |
| ui | `ui/own-summary.tsx` | the student's per-course cards |

Scope: `grantScopes(user, "att.attendance.read")` united with `att.attendance.correct`; the
program of the assignment's group must be in the programs, departments or faculties granted.

### UI

| Route | Who | What |
|---|---|---|
| `/att/report` | read, correct | student attendance table |
| `/att/summary` | read, correct | group/course summary table |
| `/att/absences` | self | summary + absences |

## 4. Tasks

- [ ] **T1** — Pure rules + unit tests, threshold setting in seed. (AC-1, AC-2)
- [ ] **T2** — Queries and tables, registered; integration tests (figures, scope, own summary). (AC-1..AC-6)
- [ ] **T3** — Pages, nav, student summary, portal shortcut, i18n. (AC-3..AC-8)
- [ ] **T4** — e2e, docs. (all)

## 5. Test plan

| AC | Test |
|---|---|
| AC-1, AC-2 | unit (percent, excused, no hours, threshold boundary) + integration (held only, date range) |
| AC-3, AC-4 | integration (filters, summary figures) |
| AC-5 | integration (scoped head sees own program only; lecturer/student denied) + e2e 403 |
| AC-6, AC-7 | integration (only own marks) + e2e |
| AC-8 | e2e at phone width + axe |

## 6. Definition of done

- [ ] Tasks ticked, ACs tested; lint, typecheck, tests, e2e pass; i18n sq+en; FEATURES.md `done`
