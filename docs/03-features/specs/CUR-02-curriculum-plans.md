# CUR-02 — Curriculum plans

| | |
|---|---|
| **Phase** | P1 |
| **Depends on** | CUR-01, ORG-01 (ORG-03 programs) |
| **Questions** | Q-32 (non-blocking): 30 credits per semester and the program total as warnings only; a course once per plan; approval records who and when; immutable once approved |
| **Source** | SRC-013, SRC-026, SRC-110 (SRC-111/112 for the archive of approved plans) |
| **Brief** | [../modules/cur.md](../modules/cur.md) |

> Spec lifecycle: write from this template → review with the user → set Status `specced` in
> FEATURES.md → build task by task → tick tasks → Status `done`.

## 1. Context

SRC-013/026: each cohort follows the 1-, 2- or 3-year curriculum plan of its program, listing
courses with category, credits and the hours to be delivered. CUR-01 supplies the course catalog
and categories, ORG-03 the programs (cycle, duration, total credits). Plans are versioned per
program, approved by the academic side and then frozen; cohorts (ORG-04) will reference approved
plans, syllabi (CUR-03) hang off plan courses, and teaching assignments (CUR-04) name the lecturer
of each plan course.

## 2. Requirements

### User stories

- As a **program coordinator or head of department**, I want to build a plan year by year and
  semester by semester from the course catalog and see the totals, so that the plan is complete
  before it is approved.
- As a **coordinator**, I want to start a new version from an existing plan, so that I only change
  what changed.
- As **secretariat, quality and other staff**, I want to read approved plans and print them; as a
  **lecturer or student**, I want to read the approved plans.

### Acceptance criteria (EARS)

| ID | Criterion |
|---|---|
| AC-1 | THE SYSTEM SHALL store curriculum plans per program with an incrementing `version`, `validFromAcademicYearId`, `status` (`DRAFT`, `APPROVED`, `ARCHIVED`), optional notes, and who/when approved. |
| AC-2 | THE SYSTEM SHALL store plan courses with the catalog `course`, `yearOfStudy` (1 to the program's duration), `semester` (1 or 2), whole `credits` 0–60, optional `category`, lecture/seminar/lab hours 0–500 and an `isElective` flag, and SHALL fill credits, category and hours from the catalog when a course is added. |
| AC-3 | IF a course is already in the plan, the year or semester is out of range, the credits or hours are out of range, or the course is inactive, THEN THE SYSTEM SHALL refuse with a field error. |
| AC-4 | WHILE a plan is `DRAFT`, THE SYSTEM SHALL allow adding, changing and removing plan courses and changing its valid-from year and notes; WHILE it is `APPROVED` or `ARCHIVED`, THE SYSTEM SHALL reject every such change, in the application and in the database. |
| AC-5 | THE SYSTEM SHALL show totals of credits and hours per semester, per year and for the whole plan, and warnings (never blockers) where a semester's credits differ from the configured credits per semester (setting `cur.plan.creditsPerSemester`, default 30) or the plan total differs from the program's total credits. |
| AC-6 | WHEN an authorized user starts a plan for a program, THE SYSTEM SHALL create a `DRAFT` with the next version, optionally copied from an existing plan of that program (all courses and settings), with a valid-from year. |
| AC-7 | WHEN an authorized user approves a draft that has at least one course, THE SYSTEM SHALL set `APPROVED`, record who and when, freeze it, and audit it; IF it has no courses, THEN THE SYSTEM SHALL refuse. |
| AC-8 | WHEN an authorized user archives an approved plan with a reason, THE SYSTEM SHALL set `ARCHIVED` (kept for reference), unless a registered dependent (cohorts, ORG-04) blocks it; THE SYSTEM SHALL let an author delete a `DRAFT` plan (technical row) with an audit entry, and never delete approved or archived plans. |
| AC-9 | THE SYSTEM SHALL block deactivating a course that is in a draft or approved plan, and deactivating a program that has a draft or approved plan, through the existing dependents registries. |
| AC-10 | THE SYSTEM SHALL list plans (PLT-10 table: program, version, valid from, status, total credits, courses, approved on) limited to the user's scope, with filters on program code and status, and a detail page that is the editor for drafts and a printable read view otherwise. |
| AC-11 | THE SYSTEM SHALL restrict writes to `cur.plan.write` (sysadmin, head of department, program coordinator) on programs inside the user's scope, reading of all statuses to `cur.plan.read` (sysadmin, secretary, student affairs, HR, quality, head of department, program coordinator; scoped), and reading of approved plans only to `cur.plan.view` (lecturer, student). |
| AC-12 | THE SYSTEM SHALL audit every plan and plan-course change with before/after. |

### Out of scope

Cohorts that reference plans (ORG-04), the lecturer per course (CUR-04), syllabi (CUR-03), elective
grouping rules ("choose N of M"), prerequisites, server-side PDF (PLT-09; printing uses the browser),
diploma-supplement forms.

### Assumptions

- A course appears once per plan (Q-32); a two-semester course is two catalog entries.
- Warnings do not block approval; approval is a recorded decision, not a workflow with several steps.
- The valid-from year may be any year (past, current or planned).

## 3. Design

### Data model

```prisma
// prisma/schema/curriculum.prisma
enum PlanStatus { DRAFT APPROVED ARCHIVED }

model CurriculumPlan {
  id, programId, version Int, validFromAcademicYearId, status @default(DRAFT), notes?,
  approvedAt?, approvedById?, archivedAt?, createdAt, updatedAt, createdById, updatedById
  courses PlanCourse[]
  @@unique([programId, version])
}

model PlanCourse {
  id, planId, courseId, yearOfStudy Int, semester Int, credits Int, categoryId?,
  hoursLecture Int, hoursSeminar Int, hoursLab Int, isElective Boolean @default(false), createdAt, updatedAt
  @@unique([planId, courseId])
}
```

Migration: range checks; trigger `plan_courses_frozen` (insert/update/delete only while the plan is
`DRAFT`) and `plans_frozen` (an approved or archived plan may only change `status`, `archived_at`,
`updated_*`).

### Permissions

| Permission | Granted to |
|---|---|
| `cur.plan.read` | sysadmin, secretary, student_affairs, hr, quality, head_of_department, program_coordinator |
| `cur.plan.view` | everyone who may look at plans: the `read` roles plus lecturer and student (lecturer and student see approved plans only; `read` adds drafts and the archive) |
| `cur.plan.write` | sysadmin, head_of_department, program_coordinator |

Scope comes from the assignment; the target resolver `plan` maps a plan to its program.

### Server

| Kind | Name | Purpose |
|---|---|---|
| domain | `domain/plan-rules.ts` | pure: totals, warnings, ranges, next version |
| domain | `domain/plan-schemas.ts` | Zod |
| service | `plan.service.ts` | create/copy, meta, add/update/remove course, approve, archive, delete draft (+ audit) |
| queries | `plan.queries.ts` | scope filter, plan with courses and totals, course options |
| dependents | `plan-dependents.ts` | registrations for courses and programs; `registerPlanDependent` for ORG-04 |
| table | `plan.table.tsx` | PLT-10 table `cur.plans` |

### UI

| Route | Who | What |
|---|---|---|
| `/cur/plans` | read / view | table; "New plan" for writers |
| `/cur/plans/new` | write | program, valid-from year, optionally copy from a plan |
| `/cur/plans/[id]` | read | editor (draft + write) or printable plan; totals and warnings; approve / archive / delete |

### Edge cases & errors

- A program shortened after a plan exists is blocked by the dependents registry (AC-9), so
  `yearOfStudy` never exceeds the duration of a live plan.
- Two people editing the same draft: last write wins per row; totals are recomputed on every load.
- Copying a plan whose courses were deactivated since: inactive courses are skipped and counted.
- Approving requires the plan to belong to a program inside the approver's scope.

## 4. Tasks

- [x] **T1** — `curriculum.prisma` + migration (checks, freeze triggers); permissions; target resolver; nav. (AC-1, AC-4, AC-11)
- [x] **T2** — Pure plan rules and schemas with unit tests. (AC-2, AC-3, AC-5)
- [x] **T3** — Service and queries (create/copy, courses, approve, archive, delete) with integration tests incl. DB freeze. (AC-3, AC-4, AC-6..AC-8, AC-12)
- [x] **T4** — Dependents registrations and plan registry for ORG-04; tests. (AC-8, AC-9)
- [ ] **T5** — Table, list, new page, editor/read view, totals, print, i18n. (AC-5, AC-10)
- [ ] **T6** — E2E, seed, docs. (all)

## 5. Test plan

| AC | Test type | Test |
|---|---|---|
| AC-2, AC-3 | unit + integration | ranges; duplicate course; inactive course; defaults from catalog |
| AC-4 | integration | draft edits ok; approved plan changes refused by the service and by direct SQL |
| AC-5 | unit | totals per semester/year/plan; warnings table |
| AC-6, AC-7 | integration | versions increment per program; copy; approve needs courses; audit with actor |
| AC-8 | integration | archive with reason; blocked by a dependent; draft delete; approved delete refused |
| AC-9 | integration | course and program deactivation blocked by plans |
| AC-10, AC-11 | e2e | coordinator builds and approves a plan; secretary reads; lecturer sees approved only; student cannot write |
| AC-12 | integration | audit rows for each change |

## 6. Definition of done

- [ ] All tasks ticked, all ACs covered by tests
- [ ] `pnpm lint && pnpm typecheck && pnpm test` pass; E2E for user-facing flows pass
- [ ] Security checklist in [conventions.md](../../02-architecture/conventions.md#security-checklist-every-feature) satisfied
- [ ] i18n keys added (`en` and `sq`)
- [ ] Docs updated (domain model, brief)
- [ ] FEATURES.md Status → `done`; `node scripts/features.mjs --write`
