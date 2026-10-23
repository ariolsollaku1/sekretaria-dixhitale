# ATT-01 — Attendance recording

| | |
|---|---|
| **Phase** | P4 |
| **Depends on** | CUR-04, STU-01 (CAL-02 for generating sessions, ORG-04 groups) |
| **Questions** | Q-60…Q-64 (all non-blocking): whole hours, 45-minute academic hour; 7-day edit window then Secretariat with reason; present/absent/excused without documents; sessions generated from the timetable on request; visibility by ownership and scope |
| **Source** | SRC-036b, SRC-043 |
| **Brief** | [../modules/att.md](../modules/att.md) |

> Spec lifecycle: write → review → `specced` → build → tick tasks → `done`.

## 1. Context

Lecturers enter the absences of their classes online and students later see their own (SRC-036b);
absences are stored and may be corrected in case of error (SRC-043). A **class session** is one
meeting of a teaching assignment (CUR-04) on a date; its roster is the students of the assignment's
group (STU-01 yearly registrations, ORG-04 groups). Sessions can be generated from the timetable
(CAL-02) or added by hand. Marking a session *held* with its hours feeds HR-04 (delivered hours).
Reports and the percentage rule are ATT-02 (Q-12); this feature records.

## 2. Requirements

### User stories

- As a **lecturer**, I want to open a class, mark who is absent and save, from my phone.
- As a **secretary**, I want to correct attendance after the window with a recorded reason.
- As a **head of department or program coordinator**, I want to look at the sessions of my programs.
- As a **student**, I want to see my own absences.

### Acceptance criteria (EARS)

| ID | Criterion |
|---|---|
| AC-1 | THE SYSTEM SHALL store class sessions per teaching assignment with `date`, `startMinute`, `endMinute`, whole `hours` (1–12), optional `topic` (≤ 300), a status `PLANNED`, `HELD` or `CANCELLED`, and the timetable entry it came from when generated; one session per assignment, date and start time. |
| AC-2 | WHEN the owner lecturer of an assignment (or the Secretariat) asks for a date range of at most 120 days inside the academic year, THE SYSTEM SHALL create a `PLANNED` session for every date on which a timetable entry of that assignment is valid and falls on its weekday, with hours `max(1, round(minutes / 45))`, skip existing ones and report the counts. |
| AC-3 | WHEN the owner lecturer (or the Secretariat) adds an extra class by hand, THE SYSTEM SHALL create it from date, times, hours and topic, inside the assignment's academic year, and refuse a duplicate. |
| AC-4 | THE SYSTEM SHALL show a session's roster: the students with an `ACTIVE` enrollment whose yearly registration of the session's academic year is in the assignment's group, with their saved marks (`PRESENT`, `ABSENT`, `EXCUSED`, optional note ≤ 200). |
| AC-5 | WHEN the owner lecturer saves a session's attendance, THE SYSTEM SHALL store one mark per roster student (all must be given, none for others), set the session `HELD` with its hours and topic, and audit before/after. |
| AC-6 | IF the session date is in the future (Europe/Tirane), the session is cancelled, the academic year is closed, or the lecturer does not own the assignment, THEN THE SYSTEM SHALL refuse the lecturer's save. |
| AC-7 | IF more than `att.editWindowDays` (default 7) days have passed since the session date, THEN THE SYSTEM SHALL refuse the lecturer's save and let only the Secretariat (`att.attendance.correct`) save, and only with a written reason, which is audited. |
| AC-8 | WHEN the owner lecturer (or the Secretariat) cancels a `PLANNED` session, or the Secretariat cancels a `HELD` one with a reason, THE SYSTEM SHALL mark it `CANCELLED` (sessions and marks are never deleted) and keep its marks. |
| AC-9 | THE SYSTEM SHALL list a lecturer's own sessions of the selected academic year with status, hours and counts of absent/excused, and, for readers, the sessions of a group within the reader's scope. |
| AC-10 | THE SYSTEM SHALL show a student only their own `ABSENT` and `EXCUSED` marks of held sessions for the selected year (course, kind, date, status; no notes), nothing of others. |
| AC-11 | THE SYSTEM SHALL restrict recording to `att.attendance.record` (lecturer, own assignments), correction to `att.attendance.correct` (secretary), reading to `att.attendance.read` (secretary, head of department, program coordinator; by scope) and the student view to `att.attendance.self`, and audit every change. |
| AC-12 | THE SYSTEM SHALL work at 360 px width: the roster is a vertical list with large status buttons and an "all present" shortcut. |

### Out of scope

Reports, percentages and thresholds, exports (ATT-02); eligibility for exams (EXM-03); delivered
hours report (HR-04); notifications to students; attendance by QR/self check-in; late arrivals.

### Assumptions

- See Q-60…Q-64. The edit window is the setting `att.editWindowDays`.
- "Today" is the date in Europe/Tirane.

## 3. Design

### Data model

```prisma
// prisma/schema/attendance.prisma
enum SessionStatus { PLANNED HELD CANCELLED }
enum AttendanceStatus { PRESENT ABSENT EXCUSED }

model ClassSession {
  id, assignmentId, date @db.Date, startMinute, endMinute, hours, topic?, status,
  timetableEntryId? , heldAt?, createdAt, updatedAt, createdById, updatedById
  @@unique([assignmentId, date, startMinute])  @@index([date])
}
model AttendanceMark {
  id, sessionId, studentId, status, note?, markedById?, createdAt, updatedAt
  @@unique([sessionId, studentId])  @@index([studentId])
}
```
Checks: `hours BETWEEN 1 AND 12`, `0 <= start < end <= 1440`.

### Permissions

| Permission | Granted to |
|---|---|
| `att.attendance.record` | lecturer (own assignments only, checked in the service) |
| `att.attendance.correct` | secretary |
| `att.attendance.read` | secretary, head of department, program coordinator (scoped to the group's program) |
| `att.attendance.self` | student |

### Server

| Kind | Name | Purpose |
|---|---|---|
| domain | `session-rules.ts`, `schemas.ts` | dates of a range, default hours, window, mark validation, summaries; Zod |
| service | `session.service.ts` | generate, add, update, cancel, save attendance (+ audit) |
| queries | `session.queries.ts` | own sessions, group sessions, roster, student absences |
| cross-module | CUR `getAssignmentContext`, `listStaffAssignments`, `listGroupAssignments`; CAL `groupEntries`; HR `getOwnStaffId`; ORG `listGroupsForYear`, `getYear` | |

### UI

| Route | Who | What |
|---|---|---|
| `/att/mine` | record | own assignments: generate / add forms, sessions list |
| `/att/sessions` | read, correct | group picker, sessions list, forms for correctors |
| `/att/sessions/[id]` | record, read | the roster form (editable when allowed) |
| `/att/absences` | self | student's own absences |

**Implementation notes:**
- Marks are saved in one transaction, replacing the session's set; the audit entry carries the
  counts and the changed students (ids only, no names).
- Persons are shown by name only in pages; logs carry ids.

## 4. Tasks

- [ ] **T1** — Model, migration, permissions, setting, nav. (AC-1, AC-11)
- [ ] **T2** — Pure rules and schemas with unit tests. (AC-1..AC-3, AC-5, AC-7)
- [ ] **T3** — Service and queries; integration tests. (AC-2..AC-11)
- [ ] **T4** — Pages and forms (mobile-first), i18n. (AC-4, AC-9, AC-10, AC-12)
- [ ] **T5** — Seed, e2e, docs. (all)

## 5. Test plan

| AC | Test |
|---|---|
| AC-1..AC-3 | unit (range dates, hours default) + integration (generation, duplicates, year bounds) |
| AC-4, AC-5 | integration (roster, complete marks, held, audit) |
| AC-6, AC-7 | unit (window) + integration (future, closed year, foreign lecturer, secretary reason) |
| AC-8 | integration |
| AC-9, AC-10, AC-11 | integration (scope, student sees only own) + e2e |
| AC-12 | e2e at phone width |

## 6. Definition of done

- [ ] Tasks ticked, ACs tested; lint, typecheck, tests, e2e pass; i18n sq+en; FEATURES.md `done`
