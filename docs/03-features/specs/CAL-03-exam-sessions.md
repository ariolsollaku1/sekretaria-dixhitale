# CAL-03 — Exam sessions & exam schedule

| | |
|---|---|
| **Phase** | P4 |
| **Depends on** | CAL-01, CUR-04 |
| **Questions** | Q-75 (one session per kind and year), Q-76 (mini-session = final year of the program), Q-77 (one sitting per plan course and session; clash rules), Q-78 (publish per session), Q-79 (examiners, free-text rooms) — all non-blocking, working assumptions used |
| **Source** | SRC-014, SRC-034, SRC-036d, SRC-052 |
| **Brief** | [../modules/cal.md](../modules/cal.md) |

> Spec lifecycle: write → review → `specced` → build → tick tasks → `done`.

## 1. Context

The Secretariat defines the exam sessions of an academic year (winter, summer, autumn and the
mini-session for final-year students, SRC-052), schedules each exam of a plan course inside a
session (date, time, room, examiners) and publishes the schedule to students and lecturers
(SRC-034, SRC-036d). EXM-04 (registration and rosters, SRC-014) builds on the sessions and sittings
defined here. CAL-02 provides the clash approach; CUR-04 and ORG-04 tell which groups follow which plan.

## 2. Requirements

### User stories

- As the **Secretariat**, I want to define the sessions of the year and put each exam into one, and be stopped when it clashes.
- As a **student**, I want to see when my exams are, in the portal and in my calendar app.
- As a **lecturer**, I want to see the exams where I am an examiner.
- As **staff**, I want to read the schedule, also before it is published.

### Acceptance criteria (EARS)

| ID | Criterion |
|---|---|
| AC-1 | THE SYSTEM SHALL store exam sessions per academic year with a `type` (WINTER, SUMMER, AUTUMN, MINI), a start and an end date (start not after end, both inside the year), at most one session per type and year, and a `publishedAt` marker. |
| AC-2 | THE SYSTEM SHALL store exam sittings per session and plan course with `date`, start and end time (minutes from midnight, end after start), optional `room` (≤ 50), optional note (≤ 300) and 0–6 distinct examiners (staff), at most one sitting per plan course and session. |
| AC-3 | IF a sitting's date is outside its session's dates THEN THE SYSTEM SHALL refuse it. |
| AC-4 | IF the session is MINI and the plan course is not in the final year of study of its program (`yearOfStudy` ≠ the program's `durationYears`) THEN THE SYSTEM SHALL refuse it (SRC-052). |
| AC-5 | IF a sitting overlaps another of the same academic year on the same date and times for the same plan and year of study (the same groups), the same examiner, or the same room (case-insensitive, when a room is given) THEN THE SYSTEM SHALL refuse it and name each clash. |
| AC-6 | THE SYSTEM SHALL let a writer create and change sessions, and add, change and remove sittings (audited) while the academic year is not closed, re-running all checks on every change; changing session dates SHALL be refused when a sitting would fall outside them. |
| AC-7 | WHEN a writer publishes a session THE SYSTEM SHALL mark it published (audited) and show its sittings to the students of the groups concerned and to the examiners; WHEN unpublished, it SHALL hide them again; drafts are visible only to staff with `cal.exam.read`. |
| AC-8 | THE SYSTEM SHALL show a session's schedule (sittings by date and time with course, program, room, examiners) to staff, and "my exams" to a student (sittings of published sessions for the plan and year of study of the group of their active yearly registration in the selected year) and a lecturer (published sittings where they are an examiner). |
| AC-9 | THE SYSTEM SHALL include the published sittings a user may see (students: own, lecturers: as examiner, staff: all) with date and time in their iCal feed (CAL-01). |
| AC-10 | THE SYSTEM SHALL restrict writes to `cal.exam.write` (sysadmin, secretary), the full schedule to `cal.exam.read` (staff roles) and "my exams" to `cal.exam.self` (lecturer, student), and audit every change. |

### Out of scope

Exam registration, rosters and the exam record (EXM-04, EXM-01), eligibility (EXM-03), room master
data and capacity, automatic scheduling, notifications on publication (NTF-02), several sittings of
one course in a session, per-group sittings.

### Assumptions

- Times are local (Europe/Tirane) wall-clock times; iCal events use floating local time.
- Q-75..Q-79 working assumptions apply; sessions are never deleted (they can be edited).

## 3. Design

```prisma
enum ExamSessionType { WINTER SUMMER AUTUMN MINI }
model ExamSession {
  id, academicYearId, type, startDate @db.Date, endDate @db.Date, publishedAt DateTime?, audit columns
  @@unique([academicYearId, type])
}
model ExamSitting {
  id, sessionId, planCourseId, date @db.Date, startMinute, endMinute, room?, note?, audit columns
  examiners ExamSittingExaminer[]
  @@unique([sessionId, planCourseId])
}
model ExamSittingExaminer { sittingId, staffId  @@id([sittingId, staffId]) }
```
Checks: `start_date <= end_date`, `0 <= start_minute < end_minute <= 1440`.

Permissions: `cal.exam.read`, `cal.exam.write`, `cal.exam.self` (same role split as the timetable).
Routes `/cal/exams` (sessions of the selected year), `/cal/exams/[sessionId]` (schedule + editor), `/cal/exams/mine`.
Audit: `cal.exam_session.create|update|publish|unpublish`, `cal.exam_sitting.create|update|remove`.

**Implementation notes:**
- Pure rules in `domain/exam-rules.ts` (validation, containment, mini-session eligibility, clashes);
  services in `server/exam.service.ts`; visibility in `server/exam.queries.ts`.
- CUR index adds `getPlanCourseContext` and `listExamCourses(yearId)` (plan courses followed by an
  active group of the year) ; ORG's `getGroupContext` gives a student's plan and year of study.
- The iCal renderer gains optional start/end minutes and a location.

## 4. Tasks

- [ ] **T1** — Models, migration, permissions, nav. (AC-1, AC-2, AC-10)
- [ ] **T2** — Pure rules with unit tests. (AC-1..AC-5)
- [ ] **T3** — CUR lookups, services, queries; integration tests. (AC-2..AC-10)
- [ ] **T4** — Sessions list, session page with editor, my exams, i18n; iCal feed. (AC-6..AC-9)
- [ ] **T5** — E2E, seed, docs. (all)

## 5. Test plan

| AC | Test |
|---|---|
| AC-1, AC-2 | unit + DB checks and uniqueness |
| AC-3, AC-4, AC-5 | unit matrix; integration refusals with the clash list |
| AC-6, AC-10 | integration (closed year, permissions, audit) |
| AC-7, AC-8 | integration (publish/unpublish visibility for student, lecturer, staff) + e2e |
| AC-9 | unit (ics with times) + integration (feed events) |

## 6. Definition of done

- [ ] Tasks ticked, ACs tested; lint, typecheck, tests, e2e pass; i18n; FEATURES.md `done`
