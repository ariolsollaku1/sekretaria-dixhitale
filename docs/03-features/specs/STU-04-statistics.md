# STU-04 — Student statistics & demographic reports

| | |
|---|---|
| **Phase** | P2 |
| **Depends on** | STU-01 |
| **Questions** | Q-34 (non-blocking): residence is free text; age bands are fixed |
| **Source** | SRC-021 |
| **Brief** | [../modules/stu.md](../modules/stu.md) |

> Spec lifecycle: write → review → `specced` → build → tick tasks → `done`.

## 1. Context

SRC-021: reports (name lists and statistics) of students by study cycle, program and year of
study, with criteria such as place of residence, age and gender. Name lists already exist
(STU-01 table, STU-06); this adds cross-tab counts with Excel/CSV export.

## 2. Requirements

### Acceptance criteria (EARS)

| ID | Criterion |
|---|---|
| AC-1 | THE SYSTEM SHALL show a cross-tabulation of enrollments with a chosen row dimension and column dimension among: faculty, cycle, program, year of study, gender, residence, age band (<20, 20–24, 25–29, 30–39, 40+), enrollment status and registration type, with row totals, column totals and a grand total. |
| AC-2 | THE SYSTEM SHALL count enrollments of the students the user may see, for the academic year selected in the header (year of study comes from the yearly registration of that year; enrollments without one have an empty year of study), filtered by status (default `ACTIVE`; `all` counts every status), program code, faculty code and cycle. |
| AC-3 | THE SYSTEM SHALL let the user download the table as Excel or CSV, and SHALL guard text cells against formula injection. |
| AC-4 | THE SYSTEM SHALL show no personal identifiers, only counts, and restrict the page and the downloads to `stu.student.read`. |
| AC-5 | WHERE a row and a column dimension are equal, THE SYSTEM SHALL refuse the choice and fall back to a single count per value. |

### Out of scope

Charts, trends across years, name lists (STU-01/STU-06), entry qualifications (STU-05).

## 3. Design

Pure `domain/stat-rules.ts` (dimensions, age bands, `pivot`), query `server/stat.queries.ts`, page
`/stu/statistics`, download route `/stu/statistics/export`.

## 4. Tasks

- [x] **T1** — Pure pivot with unit tests. (AC-1, AC-5)
- [x] **T2** — Query, page, export route, nav, i18n, e2e, docs. (AC-2..AC-4)

## 5. Test plan

| AC | Test |
|---|---|
| AC-1, AC-5 | unit: counts, totals, empty values, equal dimensions, age bands |
| AC-2..AC-4 | e2e: seeded student counted; CSV download; student refused |

## 6. Definition of done

- [x] Tasks ticked, ACs tested; lint, typecheck, tests, e2e pass; i18n; FEATURES.md `done`
