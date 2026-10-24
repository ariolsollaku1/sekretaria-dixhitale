# STU-05 — Entry qualifications report

| | |
|---|---|
| **Phase** | P2 |
| **Depends on** | ADM-04 |
| **Questions** | Q-148 (non-blocking): population, bands and visibility of the high-school average |
| **Source** | SRC-022 |
| **Brief** | [../modules/stu.md](../modules/stu.md) |

> Spec lifecycle: write → review → `specced` → build → tick tasks → `done`.

## 1. Context

SRC-022: a report of the results each student brings when enrolling in the first year, based on the
high-school average. The average is captured once, in the online application (ADM-02,
`Application.averageGrade`), and stays linked to the enrollment that ADM-04 creates
(`Application.enrollmentId`). No new data is entered and no table is added.

## 2. Requirements

### Acceptance criteria (EARS)

| ID | Criterion |
|---|---|
| AC-1 | THE SYSTEM SHALL list the first-registration enrollments (`FIRST_TIME`) of the students the user may see, whose cohort starts in the academic year selected in the header, filtered by program code, faculty code and cycle, each with student number, name, program, cohort, school, graduation year and the entry average (Q-148). |
| AC-2 | THE SYSTEM SHALL show a summary: enrollments counted, with a recorded average, without one (no application), and the mean, lowest and highest average. |
| AC-3 | THE SYSTEM SHALL show the distribution of the averages in the bands under 6, 6-6.99, 7-7.99, 8-8.99 and 9-10 with count and share. |
| AC-4 | THE SYSTEM SHALL show per program the number with an average, the mean, the lowest and the highest, rounded to two decimals. |
| AC-5 | WHERE an enrollment has no application, THE SYSTEM SHALL show it without an average and never infer or invent a value. |
| AC-6 | THE SYSTEM SHALL let the user download the name list and the per-program summary as Excel or CSV (formula-injection guarded), and restrict page and downloads to `stu.student.read` inside the user's scope. |

### Out of scope

Typing an average by hand; ranking candidates (ADM-03); averages of later years (EXM).

## 3. Design

Pure `domain/entry-rules.ts` (bands, summary, per-program, distribution). Query
`server/entry.queries.ts` reads enrollments through `scopeWhere` and the `application` relation of the
enrollment (a read of the ADM-02 column; `stu` does not import `adm`). Page `/stu/entry-qualifications`,
download route `/stu/entry-qualifications/export?kind=list|programs`. Nav item under Students.
No migration. Audit: read-only, nothing to record.

## 4. Tasks

- [x] **T1** — Pure rules with unit tests. (AC-2..AC-5)
- [x] **T2** — Query with scope, integration test. (AC-1, AC-5, AC-6)
- [x] **T3** — Page, export route, nav, i18n, seed-free e2e, docs. (AC-1..AC-6)

## 5. Test plan

| AC | Test |
|---|---|
| AC-2..AC-5 | unit: bands at the edges, mean/min/max rounding, empty input, missing averages |
| AC-1, AC-5, AC-6 | integration: counted by year/filters, scope filter, enrollment without application |
| AC-1..AC-6 | e2e: report shows a linked average, CSV download; a lecturer is refused |

## 6. Definition of done

- [x] Tasks ticked, ACs tested; lint, typecheck, tests, e2e pass; i18n; FEATURES.md `done`
