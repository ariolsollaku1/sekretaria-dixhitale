# ADR-0006 — Academic year as the main time axis

- **Status:** Accepted (2026-10-03)

## Context

SRC-001: "the system is structured by academic years (the financial module by calendar years)".
Most lists in the source are "per academic year" (registrations, deregistrations, suspensions,
scholarships, approved plans and diploma formats).

## Decision

- `AcademicYear` is a first-class entity with exactly one `CURRENT` year at a time; others are
  `PLANNED` or `CLOSED`.
- Year-dependent records carry `academicYearId` (see [../domain-model.md](../domain-model.md)).
- The UI has a global **academic-year selector** (defaults to current); lists and reports filter by
  it. Closed years are read-only except for explicitly allowed corrections (e.g. grade corrections
  with reason and audit).
- Finance: installments and payments are dated; finance reports group by **calendar year** of the
  date, while each payment plan still references the academic year it pays for.
- Rolling over to a new year (creating groups, registrations, copying calendar templates) is an
  explicit, audited operation (ORG-01).

## Consequences

- Queries almost always include an academic-year filter — index `academicYearId` everywhere.
- History is naturally preserved per year (SRC-112: past approved plans/formats stay accessible).

## Implementation notes (ORG-01)

- Switching the current year is one transaction that closes the previous year and sets the new one
  (reason required, both audited); the database allows at most one `CURRENT` row.
- Other modules call `assertYearWritable(yearId)` before writing year-bound records; closed years
  are read-only except through audited corrections owned by the respective module.
