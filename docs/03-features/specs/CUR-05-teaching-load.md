# CUR-05 — Teaching load report

| | |
|---|---|
| **Phase** | P6 |
| **Depends on** | CUR-04 |
| **Questions** | Q-35 (non-blocking): planned hours per assignment; delivered hours wait for HR-04 |
| **Source** | SRC-113 |
| **Brief** | [../modules/cur.md](../modules/cur.md) |

> Spec lifecycle: write → review → `specced` → build → tick tasks → `done`.

## 1. Context

SRC-113: the annual teaching load of internal and external lecturers, by semester. CUR-04 holds the
planned hours per lecturer; delivered hours (HR-04) do not exist yet.

## 2. Requirements

### Acceptance criteria (EARS)

| ID | Criterion |
|---|---|
| AC-1 | THE SYSTEM SHALL compute, for the selected academic year, per lecturer the planned hours by semester (1, 2) and by kind (lecture, seminar, laboratory), the total, and the number of distinct courses. |
| AC-2 | THE SYSTEM SHALL show the result in a PLT-10 table (lecturer, category, department, courses, semester 1, semester 2, lecture, seminar, lab, total) limited to the user's program scope, with filters on category, department code, program code and semester, sorted by total hours by default, and exportable. |
| AC-3 | THE SYSTEM SHALL count only assignments of groups in the selected academic year and, when a semester filter is given, only that semester. |
| AC-4 | THE SYSTEM SHALL restrict the report to `cur.teaching.read` and show no personal identifiers. |

### Out of scope

Delivered hours and the PAE/PAK payroll basis (HR-04, HR-05), load limits beyond the CUR-04 warning.

## 3. Design

No new tables. Pure `domain/load-rules.ts` aggregates rows; table `cur.teaching-load` (`server/load.table.tsx`); route `/cur/teaching/load`.

## 4. Tasks

- [x] **T1** — Pure aggregation with unit tests. (AC-1, AC-3)
- [x] **T2** — Table, page, nav, i18n, integration and e2e tests, docs. (AC-2, AC-4)

## 5. Test plan

| AC | Test |
|---|---|
| AC-1, AC-3 | unit (aggregation); integration (year and semester filtering) |
| AC-2, AC-4 | integration (scope); e2e (HR-visible lecturer row, student refused) |

## 6. Definition of done

- [x] Tasks ticked, ACs tested; lint, typecheck, tests, e2e pass; i18n; FEATURES.md `done`
