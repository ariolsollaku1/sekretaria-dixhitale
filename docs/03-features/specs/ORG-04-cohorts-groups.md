# ORG-04 — Cohorts & student groups

| | |
|---|---|
| **Phase** | P1 |
| **Depends on** | ORG-01, CUR-02 (ORG-03 programs) |
| **Questions** | Q-33 (non-blocking): free cohort and group names, informational capacity, sysadmin/secretary/student affairs write, plan change with a reason |
| **Source** | SRC-011, SRC-013 |
| **Brief** | [../modules/org.md](../modules/org.md) |

> Spec lifecycle: write from this template → review with the user → set Status `specced` in
> FEATURES.md → build task by task → tick tasks → Status `done`.

## 1. Context

SRC-011: the structure module covers "the division of students into groups"; SRC-013: the curriculum
plan applies to "the respective cohort". A **cohort** is the intake of a program in one academic
year and follows one **approved** curriculum plan (CUR-02); each academic year the cohort's students
sit in **groups** per year of study (the unit for timetables, attendance and teaching assignments
later). STU-01 will place students in cohorts and groups; CUR-04 and CAL-02 attach lecturers and
timetables to groups.

## 2. Requirements

### User stories

- As the **Secretariat**, I want to define each program's intake and the plan it follows, so that
  students can be enrolled against the right curriculum.
- As the **Secretariat**, I want to create the groups for a new year in one step, so that the start
  of the year is quick.
- As a **program coordinator or head of department**, I want to read the cohorts and groups of my
  programs.

### Acceptance criteria (EARS)

| ID | Criterion |
|---|---|
| AC-1 | THE SYSTEM SHALL store cohorts with `programId`, `startAcademicYearId`, `curriculumPlanId`, `name` (≤ 100, unique per program and start year) and `active`, never deleting them. |
| AC-2 | IF the chosen plan is not `APPROVED` or belongs to another program, or the program is inactive, THEN THE SYSTEM SHALL refuse to create the cohort or change its plan, with a field error. |
| AC-3 | WHEN a writer changes a cohort's plan, THE SYSTEM SHALL require a reason, apply AC-2, block the change while a registered dependent (students, STU-01) reports students in the cohort, and audit it. |
| AC-4 | THE SYSTEM SHALL block archiving an approved plan while an active cohort follows it (plan dependent `org.cohorts`). |
| AC-5 | WHEN a writer deactivates or reactivates a cohort, THE SYSTEM SHALL require a reason and audit it; a cohort with active groups in a non-closed year, or students (dependent registry), SHALL NOT be deactivated. |
| AC-6 | THE SYSTEM SHALL store groups with `cohortId`, `academicYearId`, `yearOfStudy` (1 to the program's duration), `name` (≤ 100, unique per cohort, year and year of study), optional informational `capacity` (1–1000) and `active`. |
| AC-7 | IF the group's academic year starts before the cohort's start year, or is `CLOSED`, or the name is taken, or the year of study or capacity is out of range, THEN THE SYSTEM SHALL refuse with field errors. |
| AC-8 | WHEN a writer deactivates or reactivates a group, THE SYSTEM SHALL require a reason and audit it; a group with students (dependent registry) SHALL NOT be deactivated. |
| AC-9 | WHEN a writer runs the "start of year" tool for an academic year, THE SYSTEM SHALL list, for every active cohort whose expected year of study in that year is within the program's duration and that has no active group for it, the group it would create (default name from the setting `org.defaultGroupName`, default "Grupi 1"), and WHEN confirmed SHALL create them in one transaction with one audit entry per group; running it again SHALL create nothing. |
| AC-10 | THE SYSTEM SHALL compute the expected year of study as the number of academic years from the cohort's start year (by start date) plus one. |
| AC-11 | THE SYSTEM SHALL list cohorts and groups in PLT-10 tables (cohort: program, start year, name, plan version, groups, status; group: program, cohort, year, year of study, name, capacity, status) limited to the user's program scope, with filters, and a cohort page showing its plan and its groups by academic year. |
| AC-12 | THE SYSTEM SHALL restrict writes to `org.cohort.write` and `org.group.write` (sysadmin, secretary, student affairs) and reads to `org.cohort.read` / `org.group.read` (those and lecturer, finance, HR, quality, head of department, program coordinator; program-scoped for the last two) and register a "create the groups" step in the new-year checklist. |

### Out of scope

Placing and moving students (STU-01), teaching assignments (CUR-04), timetables (CAL-02), capacity
enforcement, splitting a year into lecture/seminar/lab groups, merging cohorts.

### Assumptions

- A group with a year of study out of step with the expected one (a repeating student's group) is
  allowed; only the bulk tool uses the expected year (AC-10).
- Capacity is informational until STU-01 defines enrollment limits.

## 3. Design

### Data model

```prisma
// prisma/schema/cohorts.prisma
model Cohort {
  id, programId, startAcademicYearId, curriculumPlanId, name, active @default(true),
  createdAt, updatedAt, createdById, updatedById
  groups StudentGroup[]
  @@unique([programId, startAcademicYearId, name])
}

model StudentGroup {
  id, cohortId, academicYearId, yearOfStudy Int, name, capacity Int?, active @default(true),
  createdAt, updatedAt, createdById, updatedById
  @@unique([cohortId, academicYearId, yearOfStudy, name])
}
```

Checks: `year_of_study >= 1`, `capacity BETWEEN 1 AND 1000`.

### Permissions

| Permission | Granted to |
|---|---|
| `org.cohort.read`, `org.group.read` | sysadmin, secretary, student_affairs, lecturer, finance, hr, quality, head_of_department, program_coordinator |
| `org.cohort.write`, `org.group.write` | sysadmin, secretary, student_affairs |

### Server

| Kind | Name | Purpose |
|---|---|---|
| domain | `domain/cohort-rules.ts`, `domain/cohort-schemas.ts` | expected year, bulk plan, Zod |
| service | `cohort.service.ts` | cohorts (create, rename, change plan, status) |
| service | `group.service.ts` | groups (create, update, status), bulk start-of-year |
| registry | `cohort-dependents.ts` | `registerCohortDependent` / `registerGroupDependent` for STU-01; plan dependent for CUR-02 |
| queries | `cohort.queries.ts` | scope filter, details |
| tables | `cohort.table.tsx`, `group.table.tsx` | PLT-10 tables `org.cohorts`, `org.groups` |

### UI

| Route | Who | What |
|---|---|---|
| `/org/cohorts` | read | table; "New cohort" for writers |
| `/org/cohorts/new` | write | program, start year, plan (approved plans of the program), name |
| `/org/cohorts/[id]` | read | plan link, groups by academic year, edit / change plan / status, add group |
| `/org/groups` | read | table across cohorts |
| `/org/groups/start-of-year` | write | choose year → preview → create |

### Edge cases & errors

- A program with no approved plan: the new-cohort form says so and links to the plans.
- The bulk tool for a year before any cohort started creates nothing and says why.
- Two writers creating the same group at once: the unique key makes the second fail with the name error.

## 4. Tasks

- [x] **T1** — `cohorts.prisma` + migration; permissions; nav. (AC-1, AC-6, AC-12)
- [x] **T2** — Pure rules (expected year, bulk plan) and schemas with unit tests. (AC-6, AC-9, AC-10)
- [ ] **T3** — Cohort and group services and queries; integration tests. (AC-1..AC-3, AC-5..AC-8)
- [ ] **T4** — Dependents (plan archive, students), bulk start-of-year with checklist step; tests. (AC-4, AC-5, AC-8, AC-9)
- [ ] **T5** — Tables, pages, forms, i18n. (AC-11)
- [ ] **T6** — E2E, seed, docs. (all)

## 5. Test plan

| AC | Test type | Test |
|---|---|---|
| AC-1, AC-2 | integration | create; unique name; unapproved or foreign plan refused |
| AC-3 | integration | plan change needs reason; student dependent blocks; audit |
| AC-4 | integration | archive of an approved plan blocked by an active cohort |
| AC-5, AC-8 | integration | deactivate needs reason; blocked by groups / dependents |
| AC-6, AC-7 | unit + integration | ranges; year before cohort start; closed year; duplicate name |
| AC-9, AC-10 | unit + integration | expected year; preview lists what is missing; idempotent run |
| AC-11, AC-12 | e2e | secretary creates cohort and runs the tool; coordinator reads his program only; student forbidden |

## 6. Definition of done

- [ ] All tasks ticked, all ACs covered by tests
- [ ] `pnpm lint && pnpm typecheck && pnpm test` pass; E2E for user-facing flows pass
- [ ] Security checklist in [conventions.md](../../02-architecture/conventions.md#security-checklist-every-feature) satisfied
- [ ] i18n keys added (`en` and `sq`)
- [ ] Docs updated (domain model, brief)
- [ ] FEATURES.md Status → `done`; `node scripts/features.mjs --write`
