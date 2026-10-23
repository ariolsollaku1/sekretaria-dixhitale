# STU-06 — Secretariat student lists

| | |
|---|---|
| **Phase** | P2 |
| **Depends on** | STU-02 |
| **Questions** | Q-36 (non-blocking): lists are built from the status history |
| **Source** | SRC-051, SRC-053, SRC-054 |
| **Brief** | [../modules/stu.md](../modules/stu.md) |

> Spec lifecycle: write → review → `specced` → build → tick tasks → `done`.

## 1. Context

The Secretariat produces three yearly lists: students registered at the start of the academic
year by type — first registration, second program, transfer (SRC-051); students deregistered
during the year by cycle, program and faculty (SRC-053); students who suspended their studies in
the year (SRC-054). STU-01 stores year registrations and enrollment types; STU-02 the status events.

## 2. Requirements

### Acceptance criteria (EARS)

| ID | Criterion |
|---|---|
| AC-1 | THE SYSTEM SHALL provide a PLT-10 table with a `list` filter: `registered` (default), `deregistered`, `suspended`, for the academic year selected in the header. |
| AC-2 | WHERE the list is `registered`, THE SYSTEM SHALL show the students with a yearly registration in the selected year, with the registration type (first, second program, transfer) and year of study, and filter by type. |
| AC-3 | WHERE the list is `deregistered` or `suspended`, THE SYSTEM SHALL show the students with a status event of that kind whose effective date falls within the selected academic year (start and end dates inclusive), with the date, reason and document reference. |
| AC-4 | THE SYSTEM SHALL filter all three lists by program code, faculty code and cycle, limit them to the user's scope, and show no national ID, birth date or address. |
| AC-5 | THE SYSTEM SHALL restrict the lists to `stu.student.read` and be exportable to Excel/CSV (PLT-10). |

### Out of scope

Statistics and pivots (STU-04), graduation lists, per-faculty subtotal rows (counts come from the filters and the export).

## 3. Design

Table `stu.lists` (`server/lists.table.tsx`), route `/stu/lists`; no new tables.

## 4. Tasks

- [x] **T1** — Table, page, nav, i18n, e2e, docs. (all)

## 5. Test plan

| AC | Test |
|---|---|
| AC-1..AC-4 | e2e: seeded registered student appears; a created and deregistered/suspended student appears in the right list and not in the others; year boundaries via integration test of the date window |
| AC-5 | e2e: student refused |

## 6. Definition of done

- [x] Task ticked, ACs tested; lint, typecheck, tests, e2e pass; i18n; FEATURES.md `done`
