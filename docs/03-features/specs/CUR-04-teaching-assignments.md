# CUR-04 — Teaching assignments

| | |
|---|---|
| **Phase** | P1 |
| **Depends on** | ORG-04, HR-01 (CUR-02 plans) |
| **Questions** | Q-35 (non-blocking): lecture/seminar/lab assigned separately, several lecturers allowed, active academic staff only, load limit off by default, head of department + Secretariat assign |
| **Source** | SRC-026, SRC-027 |
| **Brief** | [../modules/cur.md](../modules/cur.md) |

> Spec lifecycle: write from this template → review with the user → set Status `specced` in
> FEATURES.md → build task by task → tick tasks → Status `done`.

## 1. Context

SRC-026: the curriculum plan names the lecturer of each course; SRC-027: the lecturers who deliver
each program's curriculum. The plan (CUR-02) says *what* is taught in each year of study, groups
(ORG-04) say *to whom* in an academic year, and staff (HR-01) say *by whom*. A **teaching
assignment** ties a lecturer to one kind (lecture, seminar, laboratory) of one plan course in one
group, with planned hours. It is the backbone for timetables (CAL-02), attendance (ATT-01),
exams (CAL-03), grades, the teaching-load report (CUR-05) and evaluations (QA-01).

## 2. Requirements

### User stories

- As a **head of department or secretary**, I want to assign lecturers to the courses of each
  group for an academic year and see what is still unassigned, so that every course has a teacher.
- As a **head of department**, I want to copy last year's assignments, so that I only change what changed.
- As a **lecturer**, I want to see my own assignments.

### Acceptance criteria (EARS)

| ID | Criterion |
|---|---|
| AC-1 | THE SYSTEM SHALL store teaching assignments with `groupId`, `planCourseId`, `staffId`, `kind` (`LECTURE`, `SEMINAR`, `LAB`), `plannedHours` (0–500) and the `semester` of the plan course. |
| AC-2 | IF the group is inactive or in a closed academic year, the plan course is not in the plan its cohort follows, the plan course's year of study differs from the group's, the staff member is inactive or not academic staff, or the same lecturer is already assigned that kind of that course in that group, THEN THE SYSTEM SHALL refuse with a field error. |
| AC-3 | WHEN an assignment is created without hours, THE SYSTEM SHALL use the plan course's hours for that kind. |
| AC-4 | THE SYSTEM SHALL let an authorized user change an assignment's lecturer and planned hours and remove it, with an audit entry carrying before/after (assignments are planning data; removing is allowed while the year is open). |
| AC-5 | WHEN an authorized user copies the assignments of one academic year into another, THE SYSTEM SHALL, for each target group, copy those of the source group with the same name in the same program and year of study for the same course, kind and lecturer, skip existing ones and inactive lecturers (reporting counts), and write one audit entry. |
| AC-6 | THE SYSTEM SHALL show, for an academic year, each active group with the courses of its plan for its year of study and the assignments per kind, and a warning list of courses without any assignment and (when `cur.teaching.maxPlannedHours` is set) of lecturers whose planned hours exceed it. |
| AC-7 | THE SYSTEM SHALL list assignments in a PLT-10 table (year, program, group, course, semester, kind, lecturer, hours) with filters, within the user's program scope, and exportable. |
| AC-8 | THE SYSTEM SHALL give every staff member a page with their own assignments (`cur.teaching.self`, every role but student), for the selected academic year, and nothing of anybody else's. |
| AC-9 | THE SYSTEM SHALL restrict writes to `cur.teaching.write` (sysadmin, secretary, head of department — for groups of programs inside their scope) and reads to `cur.teaching.read` (those and student affairs, HR, quality, program coordinator, finance; scoped), and audit every change. |

### Out of scope

Timetables, attendance, hours actually delivered (HR-04), approval workflow, contracts per
assignment, teaching assistants, a drag-and-drop planner.

### Assumptions

- A group's courses come from the plan its cohort follows and the group's year of study.
- Planned hours are per assignment; co-lecturers each carry what is entered (Q-35).

## 3. Design

### Data model

```prisma
// prisma/schema/teaching.prisma
enum TeachingKind { LECTURE SEMINAR LAB }

model TeachingAssignment {
  id, groupId, planCourseId, staffId, kind TeachingKind, semester Int, plannedHours Int,
  createdAt, updatedAt, createdById, updatedById
  @@unique([groupId, planCourseId, kind, staffId])
  @@index([staffId]) @@index([planCourseId])
}
```

Checks: `semester IN (1,2)`, `planned_hours BETWEEN 0 AND 500`.

### Permissions

| Permission | Granted to |
|---|---|
| `cur.teaching.read` | sysadmin, secretary, student_affairs, finance, hr, quality, head_of_department, program_coordinator |
| `cur.teaching.write` | sysadmin, secretary, head_of_department |
| `cur.teaching.self` | every role except student |

### Server

| Kind | Name | Purpose |
|---|---|---|
| domain | `domain/teaching-rules.ts`, `domain/teaching-schemas.ts` | kinds, hour defaults, load totals, copy planning, Zod |
| service | `teaching.service.ts` | create, update, remove, copy (+ audit) |
| queries | `teaching.queries.ts` | scope, board for a year, warnings, own assignments |
| table | `teaching.table.tsx` | PLT-10 table `cur.teaching` |
| cross-module | ORG: `getGroupContext`, target resolver `group`; HR: `listLecturerOptions`, `getOwnStaffId`, `getStaffBriefs` | |

### UI

| Route | Who | What |
|---|---|---|
| `/cur/teaching` | read | board for the selected year (filter program, semester), warnings, add / change / remove for writers; copy tool |
| `/cur/teaching/list` | read | PLT-10 table |
| `/cur/teaching/mine` | self | my assignments |

### Edge cases & errors

- A cohort whose plan has no courses for the group's year shows the group with "no courses".
- A lecturer removed from the staff register (deactivated) keeps past assignments; new ones are refused.
- Two writers assigning the same lecturer: the unique key makes the second fail with a clear message.

## 4. Tasks

- [x] **T1** — `teaching.prisma` + migration; permissions; ORG group target resolver; nav. (AC-1, AC-9)
- [ ] **T2** — Pure rules and schemas with unit tests. (AC-2, AC-3, AC-5, AC-6)
- [ ] **T3** — HR/ORG helpers, service and queries; integration tests. (AC-2..AC-6, AC-8, AC-9)
- [ ] **T4** — Board, copy tool, list table, my assignments, i18n. (AC-6..AC-8)
- [ ] **T5** — E2E, seed, docs. (all)

## 5. Test plan

| AC | Test type | Test |
|---|---|---|
| AC-1..AC-3 | unit + integration | validation matrix; defaults from the plan course; database checks |
| AC-4 | integration | update and remove with audit; closed year refuses |
| AC-5 | unit + integration | copy planning by group name, course, kind; skips |
| AC-6 | integration | board per group; unassigned warning; load warning only when configured |
| AC-7, AC-9 | e2e | head of department assigns within scope, not outside; secretary; lecturer reads |
| AC-8 | integration + e2e | own assignments only |

## 6. Definition of done

- [ ] All tasks ticked, all ACs covered by tests
- [ ] `pnpm lint && pnpm typecheck && pnpm test` pass; E2E for user-facing flows pass
- [ ] Security checklist in [conventions.md](../../02-architecture/conventions.md#security-checklist-every-feature) satisfied
- [ ] i18n keys added (`en` and `sq`)
- [ ] Docs updated (domain model, brief)
- [ ] FEATURES.md Status → `done`; `node scripts/features.mjs --write`
