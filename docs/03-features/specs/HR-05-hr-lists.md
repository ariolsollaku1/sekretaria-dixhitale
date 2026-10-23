# HR-05 — HR lists & reports

| | |
|---|---|
| **Phase** | P6 |
| **Depends on** | HR-01, CUR-04 |
| **Questions** | Q-31 (non-blocking): age is shown, birth date is not |
| **Source** | SRC-063, SRC-064, SRC-067, SRC-068, SRC-069 |
| **Brief** | [../modules/hr.md](../modules/hr.md) |

> Spec lifecycle: write → review → `specced` → build → tick tasks → `done`.

## 1. Context

Finance and management need standard lists of lecturers: by department, faculty and semester with
degree and title (SRC-063); by title, degree, gender and age (SRC-064); external lecturers with their
primary employer (SRC-067); retired external lecturers (SRC-068); volunteer lecturers by department,
faculty, semester and program (SRC-069). One filterable table covers them all, with ready-made links.

## 2. Requirements

### Acceptance criteria (EARS)

| ID | Criterion |
|---|---|
| AC-1 | THE SYSTEM SHALL list academic staff in a PLT-10 table (lecturer, category, faculty, department, degree, title, gender, age, primary employer, retired, employed) limited to the user's scope, exportable, sorted by name. |
| AC-2 | THE SYSTEM SHALL filter by category, faculty code, department code, retired, gender, title, degree, employment status and age range (from, to). |
| AC-3 | THE SYSTEM SHALL, with the filters `semester` and/or `program`, keep only lecturers who have a teaching assignment in the selected academic year in that semester and/or program. |
| AC-4 | THE SYSTEM SHALL show the age in whole years as of today and never the birth date, national ID or address. |
| AC-5 | THE SYSTEM SHALL provide a page with links to the standard lists (SRC-063, 064, 067, 068, 069) as pre-filled filters, and restrict everything to `hr.staff.read`. |

### Out of scope

Delivered-hours records (HR-04), evaluations (HR-06), payroll.

## 3. Design

`domain/age.ts` (pure age), table `hr.lecturers` (`server/lecturers.table.tsx`), route `/hr/lists`.

## 4. Tasks

- [x] **T1** — Pure age with unit tests. (AC-4)
- [x] **T2** — Table, page with preset links, nav, i18n, e2e, docs. (AC-1..AC-5)

## 5. Test plan

| AC | Test |
|---|---|
| AC-4 | unit: birthdays around today, leap day |
| AC-1..AC-3, AC-5 | e2e: seeded lecturer appears; semester/program filters; preset link; student refused |

## 6. Definition of done

- [x] Tasks ticked, ACs tested; lint, typecheck, tests, e2e pass; i18n; FEATURES.md `done`
