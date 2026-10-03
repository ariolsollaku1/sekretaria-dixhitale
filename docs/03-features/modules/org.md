# ORG — Academic structure

Code: `src/modules/org`. Entities: [domain model](../../02-architecture/domain-model.md#org--structure).

### ORG-01 — Academic years & semesters
- **Goal:** the academic year is the main axis of the system (SRC-001, ADR-0006).
- **Users:** sysadmin, secretary (read for others).
- **Scope:** CRUD academic years (`2026-2027`, start/end) and their two semesters; exactly one
  `CURRENT` year; close a year (read-only afterwards except audited corrections); global year
  selector source (PLT-06); "start new year" checklist screen (links to group creation, fee
  schedules, calendar) — the actual rollover steps live in the owning features.
- **Rules:** years don't overlap; semesters inside their year; closing requires confirmation and
  is audited.

### ORG-02 — Faculties & departments
- **Goal:** manage faculties and their departments (SRC-011).
- **Scope:** CRUD with code + name, deactivate instead of delete, assign head of department
  (staff link, optional until HR-01 exists), list/detail pages.
- **Rules:** codes unique; a department belongs to exactly one faculty; can't deactivate a faculty
  with active departments.

### ORG-03 — Study cycles & programs
- **Goal:** manage study programs by cycle (SRC-011).
- **Scope:** cycles fixed enum (FIRST = Bachelor, SECOND = Master; Master subtypes configurable,
  e.g. professional/science); CRUD programs: department, cycle, code, name (sq/en), duration
  (1/2/3 years), total credits, program coordinator (optional), active flag.
- **Rules:** duration consistent with cycle (Bachelor 3; Master 1 or 2 — configurable); code unique.

### ORG-04 — Cohorts & student groups
- **Goal:** cohorts follow a curriculum plan version; groups divide students for teaching (SRC-011, SRC-013).
- **Scope:** cohort = program + starting academic year + approved curriculum plan; per academic
  year create groups for each year of study of each cohort (name, capacity); bulk-create groups
  when a year starts; move students between groups (audited) once STU-01 exists.
- **Rules:** a cohort can only reference an **approved** plan of the same program; groups belong to
  one academic year.
