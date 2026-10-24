# HR-07 — Lecturer workspace

| | |
|---|---|
| **Phase** | P4 |
| **Depends on** | CUR-04, CAL-02 (builds on ATT-01, NTF-01, PLT-11 — all done) |
| **Questions** | Q-80 (lecturer role only), Q-81 (roster: number and name, own assignments), Q-82 (all semesters of the year), Q-83 (attendance progress now, grade links later), Q-84 (`/hr/teaching` + dashboard card) — all non-blocking |
| **Source** | SRC-070 |
| **Brief** | [../modules/hr.md](../modules/hr.md) |

## 1. Context

SRC-070: lecturers get online access to grades, absences and so on. Grades (EXM) do not exist yet,
so the "My teaching" hub gathers what exists today for the signed-in lecturer: assignments of the
selected academic year (CUR-04) with roster size and attendance progress (ATT-01), today's classes
(CAL-02), shortcuts to attendance, timetable and calendar, announcements (NTF-01) and notifications
(PLT-11), and a roster page per assignment. EXM-02/05 add grade shortcuts later.

## 2. Requirements

### User stories

- As a **lecturer**, I want one page with my courses, today's classes and what attendance is still to be recorded, so that I start my day from one place.
- As a **lecturer**, I want to see the roster of each group I teach.

### Acceptance criteria (EARS)

| ID | Criterion |
|---|---|
| AC-1 | THE SYSTEM SHALL give a user with `hr.workspace.self` a page `/hr/teaching` and a "My teaching" dashboard card, and show both to nobody else (403 view on the page). |
| AC-2 | THE SYSTEM SHALL list the signed-in lecturer's teaching assignments of the selected academic year grouped by semester, with course, kind, group, planned hours and the number of students on the roster. |
| AC-3 | THE SYSTEM SHALL show per assignment the sessions held, the sessions still to record (planned, dated today or earlier) and the absences marked, with a link to record attendance. |
| AC-4 | THE SYSTEM SHALL list today's classes (Europe/Tirane) of the lecturer from the timetable entries valid today, ordered by start time, or say there are none. |
| AC-5 | THE SYSTEM SHALL show the latest 3 live announcements visible to the lecturer and the unread notification count with the latest 5. |
| AC-6 | THE SYSTEM SHALL give each assignment a roster page `/hr/teaching/[assignmentId]` with student number and name of the students registered in the group for the year, only to the lecturer holding that assignment; any other assignment id answers not found. |
| AC-7 | THE SYSTEM SHALL show shortcuts only to pages that exist and the lecturer may open (attendance, timetable, calendar, announcements, notifications, assignments list). |
| AC-8 | THE SYSTEM SHALL never show another lecturer's data: every query is keyed on the signed-in user's own staff record; a user without one sees an empty state. |
| AC-9 | THE SYSTEM SHALL log no personal data. |

### Out of scope

Grades and exam results (EXM-02/05/06), absence statistics (ATT-02), semester dates, evaluations.

### Assumptions

See Q-80..Q-84.

## 3. Design

### Data model

No new tables or migrations.

### Permissions

New `hr.workspace.self`, granted to `lecturer` (Q-80). Cross-module data is read through
`index.ts` (`ownAssignments` CUR, `staffEntries` CAL, `ownSessions`/`rosterOf` ATT, `feed` NTF,
`bellData` platform).

### Server

| Kind | Name | Purpose |
|---|---|---|
| domain | `domain/teaching-rules.ts` | pure: classes of a day, session progress per assignment, group by semester |
| query | `server/teaching.queries.ts` | `getTeachingHub(user, yearId)`, `getAssignmentRoster(user, yearId, assignmentId)` |
| ui | `ui/teaching-hub.tsx` | hub sections + dashboard summary |
| widget | `server/teaching-widget.tsx` | registers `hr.teaching` |

### UI

| Route | Who | What |
|---|---|---|
| `/hr/teaching` | lecturer | hub |
| `/hr/teaching/[assignmentId]` | lecturer owning it | roster |

## 4. Tasks

- [x] **T1** — Permission, pure rules with unit tests. (AC-1, AC-2, AC-3, AC-4)
- [x] **T2** — Queries + integration tests (own data only, roster ownership). (AC-2..AC-6, AC-8)
- [x] **T3** — Pages, widget, nav, i18n sq/en. (AC-1, AC-7)
- [x] **T4** — E2E (main flow + forbidden), seed check, docs. (all)

## 5. Test plan

| AC | Test type | Test |
|---|---|---|
| AC-2..AC-4 | unit | `teaching-rules.test.ts` |
| AC-2..AC-6, AC-8 | integration | `teaching.queries.int.test.ts` against Postgres |
| AC-1, AC-6, AC-7 | e2e | lecturer opens hub and roster, axe; student/secretary refused |

## 6. Definition of done

- [x] All tasks ticked, all ACs covered by tests
- [x] `pnpm lint && pnpm typecheck && pnpm test` pass; E2E pass
- [x] Security checklist satisfied
- [x] i18n keys added (`en` and `sq`)
- [x] Docs updated
- [x] FEATURES.md Status → `done`; `node scripts/features.mjs --write`
