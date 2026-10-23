# ORG-03 — Study cycles & programs

| | |
|---|---|
| **Phase** | P1 |
| **Depends on** | ORG-02 |
| **Questions** | none blocking. Working assumptions: allowed durations per cycle (Bachelor 3; Master 1 or 2) and the Master subtypes are **settings** with those defaults (the brief says configurable); `totalCredits` is a positive integer with no relation enforced to the duration; the program coordinator is derived from role assignments until HR-01 |
| **Source** | SRC-011 (first and second study cycle, study programs), SRC-013 (1-, 2- or 3-year curriculum plans) |
| **Brief** | [../modules/org.md](../modules/org.md) |

> Spec lifecycle: write from this template → review with the user → set Status `specced` in
> FEATURES.md → build task by task → tick tasks → Status `done`.

## 1. Context

SRC-011 lists "study levels (first cycle and second cycle)" and "study programs"; SRC-013 says
curriculum plans last 3, 2 or 1 years. A study program belongs to a department, has a cycle, a
duration and total credits, and is the parent of cohorts and curriculum plans (CUR-02, ORG-04).
Program-scoped roles (program coordinator) need a `PROGRAM` scope resolver, which this feature
registers, completing the scope hierarchy that PLT-05 and ORG-02 started
(institution ⊃ faculty ⊃ department ⊃ program). Cycles are a fixed enum, so there is no cycle
management screen.

## 2. Requirements

### User stories

- As a **sysadmin**, I want to define study programs with their cycle, duration and credits, so
  that plans, cohorts and students can be tied to them.
- As a **sysadmin**, I want to scope a program coordinator to one program, so that they only work
  with their program's data.
- As a **secretary**, I want to look up programs by cycle, department and status.

### Acceptance criteria (EARS)

| ID | Criterion |
|---|---|
| AC-1 | THE SYSTEM SHALL offer exactly two cycles, `FIRST` (Bachelor) and `SECOND` (Master), as a fixed enum with translated labels. |
| AC-2 | THE SYSTEM SHALL store study programs: `departmentId` (fixed after creation, active department only), `cycle`, optional `subtype` (Master only), `code`, `name`, optional `nameEn`, `durationYears` (1, 2 or 3), `totalCredits` (integer 1–600), `active`. |
| AC-3 | WHEN a program is saved, THE SYSTEM SHALL check that `durationYears` is allowed for the cycle according to the setting `org.programDurations` (default: FIRST → 3; SECOND → 1 or 2), and that `subtype` is set only for `SECOND` and exists in the setting `org.programSubtypes` (default: `PROFESSIONAL`, `SCIENTIFIC`). |
| AC-4 | THE SYSTEM SHALL normalise program codes (trim, upper case; 2–20 characters from `A–Z 0–9 - _`) and refuse a code already used by another program with a field error. |
| AC-5 | WHEN a sysadmin creates or edits a program, THE SYSTEM SHALL validate it, save it in a transaction and audit it with before/after. |
| AC-6 | WHERE other modules registered *program dependents* (cohorts, curriculum plans), THE SYSTEM SHALL refuse to change a program's cycle or duration, and to deactivate it, while a dependent reports active records, naming the dependent and count. |
| AC-7 | WHEN a program is deactivated or reactivated, THE SYSTEM SHALL require a reason and audit it; programs are never deleted; an inactive department's programs cannot be reactivated until the department is. |
| AC-8 | THE SYSTEM SHALL register the `PROGRAM` scope resolver with PLT-05 (`exists` only for active programs, `options` for the role editor, `ancestors` returning department and faculty), so program-scoped roles can be assigned and a faculty- or department-scoped role contains its programs. |
| AC-9 | THE SYSTEM SHALL show on a program's page the people who currently hold the `program_coordinator` role scoped to it, derived from role assignments. |
| AC-10 | THE SYSTEM SHALL list programs in a PLT-10 table (code, name, cycle, duration, credits, department, status; filters by text, cycle, status and department code) with a detail page showing the history. |
| AC-11 | THE SYSTEM SHALL restrict writes to `org.program.write` (sysadmin) and reads to `org.program.read` (same readers as the other ORG reads). |
| AC-12 | THE SYSTEM SHALL seed neutral demo programs for development and give the dev program-coordinator user a program-scoped role. |

### Out of scope

Courses and curriculum plans (CUR-01/02), cohorts (ORG-04), a settings screen for durations and
subtypes (settings are data; a generic settings UI is later), staff records (HR-01 adds
`coordinatorStaffId`), moving a program to another department, deleting programs.

### Assumptions

- "Credits" are whatever the institution's curriculum uses; only a positive integer is enforced.
- The default durations/subtypes come from the ORG brief; they are `SystemSetting` rows so they
  can change without a deployment. Changing a setting never rewrites existing programs.
- Program codes are unique among programs (a separate space from faculty/department codes).

## 3. Design

### Data model

```prisma
// prisma/schema/org.prisma
enum StudyCycle { FIRST SECOND }

model StudyProgram {
  id            String     @id @default(cuid(2))
  departmentId  String     @map("department_id")
  cycle         StudyCycle
  subtype       String?
  code          String     @unique
  name          String
  nameEn        String?    @map("name_en")
  durationYears Int        @map("duration_years")
  totalCredits  Int        @map("total_credits")
  active        Boolean    @default(true)
  // createdAt / updatedAt / createdById / updatedById as the other ORG models
  department    Department @relation(fields: [departmentId], references: [id])
  @@index([departmentId])
  @@map("study_programs")
}
```

Check constraints: `duration_years BETWEEN 1 AND 3`, `total_credits BETWEEN 1 AND 600`,
`(subtype IS NULL OR cycle = 'SECOND')`.

### Permissions

| Permission | Granted to |
|---|---|
| `org.program.read` | sysadmin, secretary, student_affairs, lecturer, finance, hr, quality, head_of_department, program_coordinator |
| `org.program.write` | sysadmin |

### Server

| Kind | Name | Purpose |
|---|---|---|
| domain | `org/domain/program-rules.ts` | pure: `validateProgram(input, config)`, `programConfigSchema`, defaults |
| lib | `program-dependents.ts` | `registerProgramDependent({ id, labelKey, countActive })`, `blockingDependents(programId)` |
| service | `program.service.ts` | create, update, deactivate, reactivate (+ audit) |
| query | `program.queries.ts` | detail with coordinators, options, effective config from settings |
| resolver | `scope-resolvers.ts` | adds `PROGRAM` |
| table | `program.table.tsx` | PLT-10 table `org.programs` |

### UI

`/org/programs` (list), `/org/programs/new`, `/org/programs/[id]` (details, edit, deactivate/reactivate, coordinators, history). Nav: Administration → Programs.

### Edge cases & errors

- A department that becomes inactive keeps its programs; they stay readable but cannot be reactivated until it is active again.
- Changing the allowed durations in the setting does not invalidate existing programs; they are
  re-validated only when edited.
- A subtype removed from the setting stays on old programs; it cannot be chosen for new ones.

**Implementation notes:**
- Durations and Master subtypes are `SystemSetting` rows (`org.programDurations`,
  `org.programSubtypes`), seeded with the brief's defaults; a missing or malformed setting falls
  back to the defaults. There is no settings screen yet (a generic one is later); until then they are
  changed in the database or through `setSetting`.
- `registerProgramDependent({ id, labelKey, countActive })` is the hook cohorts (ORG-04) and plans
  (CUR-02) will use; a blocking dependent travels in the error message as
  `HAS_DEPENDENTS:<labelKey>=<count>,…` so the UI can name it.
- The program form limits the duration list to the cycle's allowed values and shows the subtype
  only for the second cycle; the server re-validates everything.
- `UnitStatusActions` now also serves programs; the programs table filters by department *code*.
- `PROGRAM` scope resolver completes the hierarchy: `expandTargetScope({ programId })` now yields
  the department and faculty, which the integration test proves for faculty- and department-scoped
  roles.
- Demo seed: `DEMO-BSC` (first cycle, 3 years, 180 credits) and `DEMO-MSC` (second cycle, 2 years,
  professional, 120 credits); numbers only illustrate the rules. The dev coordinator is scoped to
  `DEMO-BSC`.

## 4. Tasks

- [x] **T1** — Model + migration with checks; permissions; default settings seeded. (AC-1, AC-2, AC-11)
- [x] **T2** — Pure program rules and schemas (config-driven) with unit tests. (AC-2..AC-4)
- [x] **T3** — Dependents registry; services; queries; integration tests. (AC-5..AC-7, AC-9)
- [x] **T4** — `PROGRAM` scope resolver and role-editor integration test. (AC-8)
- [x] **T5** — Table, list/new/detail pages, status dialog. (AC-10)
- [x] **T6** — Nav, i18n (`org.program.*`), demo seed and dev coordinator role. (AC-12)
- [x] **T7** — E2E and docs. (all)

## 5. Test plan

| AC | Test type | Test |
|---|---|---|
| AC-3 | unit | durations per cycle with defaults and with a custom config; subtype only for SECOND and only known values |
| AC-4 | unit + integration | code normalisation/validation; duplicate refused; concurrent create has one winner |
| AC-5 | integration | create/update persist and audit; department fixed on update |
| AC-6 | integration | a registered dependent with active records blocks deactivation and cycle/duration change; zero count allows |
| AC-7 | integration | reason required; reactivation blocked under an inactive department |
| AC-8 | integration | `PROGRAM` resolver (exists/options/ancestors); a faculty-scoped role contains the program's target; role editor offers program scope |
| AC-9 | integration + e2e | coordinators listed from role assignments |
| AC-10, AC-11 | e2e | list filters; secretary read-only; student refused |
| AC-12 | integration | seed idempotent; dev coordinator scoped to the demo program |

## 6. Definition of done

- [x] All tasks ticked, all ACs covered by tests
- [x] `pnpm lint && pnpm typecheck && pnpm test` pass; E2E for user-facing flows pass
- [x] Security checklist in [conventions.md](../../02-architecture/conventions.md#security-checklist-every-feature) satisfied
- [x] i18n keys added (`en` and `sq`)
- [x] Docs updated (domain model, brief, auth.md scope resolvers)
- [x] FEATURES.md Status → `done`; `node scripts/features.mjs --write`
