# STU-03 — Student portal home

| | |
|---|---|
| **Phase** | P2 |
| **Depends on** | STU-01 (builds on CUR-02, CAL-01/02, NTF-01, PLT-11 — all done) |
| **Questions** | Q-55 (no correction flow yet), Q-56 (current-year courses of the cohort's non-draft plan), Q-57 (status shown; former students still see their record), Q-58 (counts and horizon), Q-59 (`/stu/home` + dashboard widget) — all non-blocking |
| **Source** | SRC-036, SRC-036c, SRC-036d |
| **Brief** | [../modules/stu.md](../modules/stu.md) |

## 1. Context

SRC-036: students get online access to their results, absences, the academic calendar and the
timetable. Grades (EXM) and absences (ATT) do not exist yet, so the portal home shows only what
exists today: the student's studies (program, cohort, year of study, group, status), the courses of
their plan year (CUR-02), today's classes (CAL-02), upcoming calendar events (CAL-01), the latest
announcements (NTF-01) and notifications (PLT-11). Later modules add their widgets (grades,
absences, requests, obligations) through the dashboard widget registry or sections of this page.

## 2. Requirements

### User stories

- As a **student**, I want one page with my studies, today's classes, upcoming dates, announcements
  and notifications, so that I do not search the system for them.
- As a **student**, I want shortcuts to my record, timetable, calendar, announcements and
  notifications.

### Acceptance criteria (EARS)

| ID | Criterion |
|---|---|
| AC-1 | THE SYSTEM SHALL give a user with `stu.student.self` a page `/stu/home` and a "My studies" dashboard widget, and show both to nobody else (403 view on the page). |
| AC-2 | THE SYSTEM SHALL show, for each open (ACTIVE or SUSPENDED) enrollment of the signed-in student: program, cycle, cohort, status and, for the current academic year, year of study and group; and the number of closed enrollments with a link to the full record. |
| AC-3 | WHERE the student's current-year registration exists and the cohort's plan is not a draft, THE SYSTEM SHALL list the courses of that year of study from the plan, by semester, with credits and an elective mark; otherwise it SHALL say why nothing is listed. |
| AC-4 | THE SYSTEM SHALL list today's classes (Europe/Tirane) of the student's groups of the current year, from the timetable entries valid today, ordered by start time, with room, lecturer and kind; WHEN there are none it SHALL say so. |
| AC-5 | THE SYSTEM SHALL list the next 5 active calendar events of the current year that end today or later and are visible to the student by audience, soonest first. |
| AC-6 | THE SYSTEM SHALL show the latest 3 live announcements visible to the student (pinned first, as NTF-01) and the latest 5 notifications of the student with the unread count. |
| AC-7 | THE SYSTEM SHALL show shortcuts only to pages that exist and the student may open (record, timetable, calendar, announcements, notifications). |
| AC-8 | THE SYSTEM SHALL never show another student's data: every query is keyed on the signed-in user's own person; a user without a student record sees an empty state. |
| AC-9 | WHILE the student has no ACTIVE enrollment, THE SYSTEM SHALL show the status and past enrollments but no plan courses, classes or events (Q-57). |
| AC-10 | THE SYSTEM SHALL show personal data read-only with a note to contact the Secretariat for corrections (Q-55), and log no personal data. |
| AC-11 | THE SYSTEM SHALL register the audience resolver CAL-01/NTF-01 left to STU: a student's cycles and programs are those of their ACTIVE enrollments, so events and announcements for a cycle or program reach them. |

### Out of scope

Grades (EXM-06), absences (ATT-02), requests (STU-07), obligations/installments (FIN), exam
schedule (CAL-03), correction requests (Q-55), changing the post-login landing page (Q-59).

### Assumptions

See Q-55..Q-59.

## 3. Design

### Data model

No new tables or migrations.

### Permissions

Reuses `stu.student.self` (role student). Cross-module data is read through each module's `index.ts`
(`listEvents`, `studentEntries`, `feed`, `bellData` via `@/lib/notify`).

### Server

| Kind | Name | Purpose |
|---|---|---|
| resolver | `server/audience.ts` | `registerAudienceResolver` for ACTIVE enrollments (AC-11) |
| domain | `domain/home-rules.ts` | pure: pick the open enrollments, the current-year registration, today's classes filter, upcoming events filter, group plan courses by semester |
| query | `server/home.queries.ts` | `getPortalHome(user)` assembling the sections |
| ui | `ui/portal-home.tsx` | server component with the sections, reused by the page and the widget |
| widget | `server/home-widget.tsx` | registers `stu.studies` into the dashboard registry |

### UI

| Route | Who | What |
|---|---|---|
| `/stu/home` | student | portal home |
| `/` widget | student | "My studies" card with status line and a link to `/stu/home` |

### Edge cases & errors

- No current academic year: studies shown without year/group; classes, events and courses say there is no current year.
- Several open enrollments: one block each; classes/events cover all of them.

## 4. Tasks

- [x] **T1** — Pure rules with unit tests. (AC-2..AC-5, AC-9)
- [x] **T2** — `getPortalHome` query + integration tests (own data only, plan, timetable, events, announcements, notifications). (AC-2..AC-9, AC-11)
- [x] **T3** — Page, widget, nav, i18n sq/en. (AC-1, AC-7, AC-10)
- [x] **T4** — E2E (main flow + forbidden), seed check, docs. (all)

**Implementation notes:**
- Page `/stu/home` (nav item first in the student group), widget `stu.studies` on the dashboard.
- Today's classes use Europe/Tirane; events are those of the CURRENT academic year.
- Integration tests need a database named `*_test`; the per-agent `sekretari_test_<id>` names fail that guard, so they were run on `sekretari_test`.

## 5. Test plan

| AC | Test type | Test |
|---|---|---|
| AC-2..AC-5, AC-9 | unit | `home-rules.test.ts` |
| AC-2..AC-6, AC-8, AC-9, AC-11 | integration | `home.queries.int.test.ts` against Postgres |
| AC-1, AC-7, AC-10 | e2e | student opens `/stu/home`, sees sections, axe; lecturer gets forbidden |

## 6. Definition of done

- [x] All tasks ticked, all ACs covered by tests
- [x] `pnpm lint && pnpm typecheck && pnpm test` pass; E2E pass
- [x] Security checklist satisfied
- [x] i18n keys added (`en` and `sq`)
- [x] Docs updated
- [x] FEATURES.md Status → `done`; `node scripts/features.mjs --write`
