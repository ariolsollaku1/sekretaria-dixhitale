# CAL-02 — Class timetable

| | |
|---|---|
| **Phase** | P4 |
| **Depends on** | CUR-04 |
| **Questions** | Q-21 (answered): the Secretariat enters or imports it, no automatic scheduling. Q-39 (non-blocking): rooms are free text, clashes are refused |
| **Source** | SRC-034, SRC-036d |
| **Brief** | [../modules/cal.md](../modules/cal.md) |

> Spec lifecycle: write → review → `specced` → build → tick tasks → `done`.

## 1. Context

The weekly class timetable is entered (or imported) by the Secretariat per teaching assignment
(CUR-04: lecturer, course, kind, group) and read by students, lecturers and staff (SRC-034, SRC-036d).
Clashes are the main risk: the same group, lecturer or room in two places at once.

## 2. Requirements

### User stories

- As the **Secretariat**, I want to put each lecture, seminar and lab of a group into the week and be stopped when it clashes.
- As a **student or lecturer**, I want to see my weekly timetable.
- As **staff**, I want to see a group's or a room's timetable and print it.

### Acceptance criteria (EARS)

| ID | Criterion |
|---|---|
| AC-1 | THE SYSTEM SHALL store timetable entries per teaching assignment with `weekday` (1 Monday … 7 Sunday), start and end time (minutes from midnight, end after start, 00:00–24:00), optional `room` (text ≤ 50), `validFrom` and `validTo` (inside the assignment's academic year) and an optional note. |
| AC-2 | IF an entry overlaps another on the same weekday with overlapping times and overlapping validity dates, for the same group, the same lecturer or the same room (case-insensitive, when a room is given), THEN THE SYSTEM SHALL refuse it and name each clash (kind, course, time). |
| AC-3 | WHEN no validity dates are given, THE SYSTEM SHALL use the dates of the assignment's semester (semester start to end). |
| AC-4 | THE SYSTEM SHALL let a writer add, change and delete entries (audited) while the academic year is not closed, and re-run the clash check on every change. |
| AC-5 | THE SYSTEM SHALL show the weekly grid (Monday–Sunday, entries in time order with course, kind, lecturer, room) for a group, for a room (text match), and "my timetable" for the signed-in lecturer (their assignments) and student (the group of their active yearly registration for the selected year), all printable, and for a chosen date show only entries valid on it. |
| AC-6 | WHEN a writer imports a CSV/XLSX with the columns `program, cohort, group, course, kind, weekday, start, end, room, valid_from, valid_to, lecturer_email`, THE SYSTEM SHALL resolve each row to a teaching assignment of the selected year, validate it, check clashes among the file and the existing entries, show a preview with row errors, and on confirmation create all rows in one transaction or none. |
| AC-7 | THE SYSTEM SHALL restrict writes to `cal.timetable.write` (sysadmin, secretary), group and room views to `cal.timetable.read` (staff roles) and "my timetable" to `cal.timetable.self` (lecturer, student), and audit every change. |

### Out of scope

Room master data and capacity, automatic scheduling, exam schedule (CAL-03), calendar-app subscription of timetables, substitutions for a single day.

### Assumptions

- Times are local (Europe/Tirane) wall-clock times; no time-zone arithmetic.
- A lecturer teaching two groups at the same time (a joint class) is a clash unless entered as one entry per assignment on different lecturers; joint classes are not modelled.

## 3. Design

```prisma
model TimetableEntry {
  id, assignmentId, weekday Int, startMinute Int, endMinute Int, room String?, validFrom @db.Date,
  validTo @db.Date, note String?, createdAt, updatedAt, createdById, updatedById
  @@index([assignmentId])
}
```
Checks: weekday 1–7, `0 <= start < end <= 1440`, `valid_from <= valid_to`.

Permissions: `cal.timetable.read`, `cal.timetable.write`, `cal.timetable.self`. Routes `/cal/timetable` (group picker + editor), `/cal/timetable/room`, `/cal/timetable/mine`, `/cal/timetable/import`.

## 4. Tasks

- [ ] **T1** — Model, migration, permissions, nav. (AC-1, AC-7)
- [ ] **T2** — Pure rules (time, clash, week grid) with unit tests. (AC-1..AC-3)
- [ ] **T3** — Service and queries; integration tests. (AC-2..AC-5, AC-7)
- [ ] **T4** — Group/room/my views and the editor, i18n. (AC-4, AC-5)
- [ ] **T5** — CSV/XLSX import. (AC-6)
- [ ] **T6** — E2E, seed, docs. (all)

## 5. Test plan

| AC | Test |
|---|---|
| AC-1, AC-3 | unit + DB checks; defaults from the semester |
| AC-2 | unit matrix (group, lecturer, room, touching times, disjoint dates); integration refusal with clash list |
| AC-4, AC-7 | integration (closed year, permissions, audit) |
| AC-5 | integration (my timetable lecturer/student) + e2e |
| AC-6 | integration (resolve, clashes in file, all-or-nothing) |

## 6. Definition of done

- [ ] Tasks ticked, ACs tested; lint, typecheck, tests, e2e pass; i18n; FEATURES.md `done`
