# ORG-01 — Academic years & semesters

| | |
|---|---|
| **Phase** | P1 |
| **Depends on** | PLT-06, PLT-07 |
| **Questions** | none blocking. Working assumptions: two semesters per year (brief), the year code is derived from the dates, switching the current year closes the previous one |
| **Source** | SRC-001 |
| **Brief** | [../modules/org.md](../modules/org.md) |

> Spec lifecycle: write from this template → review with the user → set Status `specced` in
> FEATURES.md → build task by task → tick tasks → Status `done`.

## 1. Context

SRC-001: the system is structured by academic years (finance by calendar years).
[ADR-0006](../../02-architecture/adr/0006-academic-year-scoping.md) makes `AcademicYear` the main
time axis: exactly one year is `CURRENT`, the UI has a global selector, closed years are read-only,
and rolling over to a new year is an explicit, audited operation. PLT-06 already ships the selector
slot and the `registerAcademicYearProvider` hook (hidden until a provider exists). ORG-01 supplies
the data, the provider, the rules, and the "start a new year" checklist; the actual rollover steps
(groups, fee schedules, calendar copies) belong to the features that own them and plug into the
checklist.

## 2. Requirements

### User stories

- As a **sysadmin**, I want to define academic years with their two semesters, so that every other
  record can be tied to the right period.
- As a **sysadmin**, I want to make the next year current and close the previous one in one
  deliberate, audited step, so that the system moves to the new year cleanly.
- As any **staff member or student**, I want the year selector in the header to default to the
  current year and let me look at other years, so that lists show the period I care about.

### Acceptance criteria (EARS)

| ID | Criterion |
|---|---|
| AC-1 | THE SYSTEM SHALL store academic years with `startDate`, `endDate`, a unique `code` derived from them (`<start year>-<end year>`, e.g. `2026-2027`) and a `status` of `PLANNED`, `CURRENT` or `CLOSED`. |
| AC-2 | THE SYSTEM SHALL keep each year's two semesters (number 1 and 2, each with start and end date), and SHALL create both together with the year. |
| AC-3 | IF a year's dates are not ordered, overlap another year (end dates inclusive), or its semesters are not inside the year, in order, and non-overlapping, THEN THE SYSTEM SHALL refuse to save it with field errors. |
| AC-4 | THE SYSTEM SHALL guarantee at the database level that at most one year is `CURRENT`. |
| AC-5 | WHEN a sysadmin makes a `PLANNED` year current and confirms with a reason, THE SYSTEM SHALL, in one transaction, close the previous current year (if any), set the chosen year `CURRENT`, and write one audit entry per changed year. |
| AC-6 | IF the year is not `PLANNED`, THEN THE SYSTEM SHALL refuse to make it current; a `CURRENT` year can only be closed by making another year current; a `CLOSED` year can never be reopened. |
| AC-7 | WHILE a year is `CLOSED`, THE SYSTEM SHALL reject edits to its dates and semesters, and SHALL expose `isYearWritable(yearId)` / `assertYearWritable(yearId)` for other modules (writes to closed-year records allowed only through explicitly audited corrections). |
| AC-8 | WHEN a sysadmin edits a `PLANNED` or `CURRENT` year, THE SYSTEM SHALL validate as in AC-3 and audit the change with before/after. |
| AC-9 | THE SYSTEM SHALL register an academic-year provider with PLT-06, so the header selector lists all years (newest first), defaults to the current year, and `getSelectedAcademicYear()` returns a valid id; `getCurrentAcademicYear()` returns the current year or null. |
| AC-10 | THE SYSTEM SHALL list years in a PLT-10 table (code, dates, status, semesters) and show a detail page with the semesters, actions and the change history. |
| AC-11 | THE SYSTEM SHALL provide a "start a new year" checklist page that shows the steps modules registered (`registerYearChecklistItem`: id, label key, link, permission), in order, only those the user may use; WHILE none are registered it SHALL say that steps appear as modules are added. |
| AC-12 | THE SYSTEM SHALL restrict writes to `org.year.write` (sysadmin) and reads to `org.year.read` (sysadmin, secretary, student affairs, lecturer, finance, HR, quality, head of department, program coordinator). |
| AC-13 | THE SYSTEM SHALL seed three demo years for development (previous closed, current, next planned). |

### Out of scope

The rollover steps themselves (groups ORG-04, fee schedules FIN-01, calendar CAL-01), deleting years
(no hard deletes; a mistaken `PLANNED` year is edited), more than two semesters, reopening a
closed year, per-semester closing.

### Assumptions

- Two semesters per year comes from the brief; their dates are entered, not computed.
- Code `YYYY-YYYY` from the year of `startDate` and of `endDate`; no rule forces the end year to be
  start + 1 (a non-standard year stays possible).
- "Exactly one CURRENT": at most one is enforced by the database; the header and checklist warn when
  none is current (first setup, before the first year is made current).
- Closing a year needs the sysadmin's reason; it is not blocked by open records (those rules belong
  to the owning features).

## 3. Design

### Data model

```prisma
// prisma/schema/org.prisma
enum AcademicYearStatus { PLANNED CURRENT CLOSED }

model AcademicYear {
  id        String             @id @default(cuid(2))
  code      String             @unique
  startDate DateTime           @map("start_date") @db.Date
  endDate   DateTime           @map("end_date") @db.Date
  status    AcademicYearStatus @default(PLANNED)
  createdAt DateTime           @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt DateTime           @updatedAt @map("updated_at") @db.Timestamptz(3)
  createdById String?          @map("created_by_id")
  updatedById String?          @map("updated_by_id")
  semesters Semester[]
  @@map("academic_years")
}

model Semester {
  id             String       @id @default(cuid(2))
  academicYearId String       @map("academic_year_id")
  number         Int          // 1 or 2
  startDate      DateTime     @map("start_date") @db.Date
  endDate        DateTime     @map("end_date") @db.Date
  academicYear   AcademicYear @relation(fields: [academicYearId], references: [id])
  @@unique([academicYearId, number])
  @@map("semesters")
}
```

Migration adds `CREATE UNIQUE INDEX one_current_academic_year ON academic_years (status) WHERE status = 'CURRENT'`
and `CHECK (number IN (1, 2))`, `CHECK (start_date < end_date)`.

### Permissions

| Permission | Granted to |
|---|---|
| `org.year.read` | sysadmin, secretary, student_affairs, lecturer, finance, hr, quality, head_of_department, program_coordinator |
| `org.year.write` | sysadmin |

### Server

| Kind | Name | Purpose |
|---|---|---|
| domain | `src/modules/org/domain/year-rules.ts` | pure: `deriveCode`, `validateYear(input, others)`, `canMakeCurrent`, date helpers |
| domain | `src/modules/org/domain/schemas.ts` | Zod for create/update/set-current |
| service | `year.service.ts` | `createYear`, `updateYear`, `makeCurrent` (+ audit) |
| query | `year.queries.ts` | `getYear`, `getCurrentAcademicYear`, `isYearWritable`, `assertYearWritable` |
| provider | `year.provider.ts` | registers the PLT-06 provider |
| table | `year.table.tsx` | PLT-10 table `org.years` |
| registry | `rollover.ts` | `registerYearChecklistItem`, `listChecklist(user)` |
| actions | `year.actions.ts` | wrapper-based |
| seed | `prisma/seed/academic-years.ts` | AC-13 |

### UI

| Route | Who | What |
|---|---|---|
| `/org/years` | `org.year.read` | table + "New academic year" (write) |
| `/org/years/new` | write | year dates + two semester date pairs |
| `/org/years/[id]` | read | details, semesters, edit (write, not closed), "Make current" dialog with reason, history |
| `/org/years/rollover` | read | checklist from the registry |

### Edge cases & errors

- Two years created concurrently with overlapping dates → the second validation sees the first
  (transaction + overlap query); the unique `code` is the last guard.
- Making a year current when the previous one is missing (first setup) works; nothing to close.
- Editing the dates of a `CURRENT` year is allowed (with validation); changing them so that today
  falls outside is allowed — the status, not the dates, defines "current".
- Cookie `ay` pointing to a deleted/unknown year falls back to the current year (PLT-06 behaviour).
- Dates are pure calendar dates (`@db.Date`), displayed without time zone shifts.

## 4. Tasks

- [ ] **T1** — `org.prisma` models + migration (partial unique index, checks); permissions and grants. (AC-1, AC-2, AC-4, AC-12)
- [ ] **T2** — Pure year rules + Zod schemas with unit tests. (AC-1, AC-3, AC-6)
- [ ] **T3** — Services (`createYear`, `updateYear`, `makeCurrent`), queries, writability helpers, provider registration; integration tests. (AC-5..AC-9)
- [ ] **T4** — Table, list and create pages. (AC-10, AC-12)
- [ ] **T5** — Detail/edit page, make-current dialog, history. (AC-8, AC-10)
- [ ] **T6** — Checklist registry and rollover page. (AC-11)
- [ ] **T7** — Seed, nav, i18n (`org.*`), e2e, docs. (AC-13 and all)

## 5. Test plan

| AC | Test type | Test |
|---|---|---|
| AC-1, AC-3 | unit | `deriveCode`; table-driven validation: unordered dates, overlap (touching end/start days), semester outside year, semester overlap/order |
| AC-2 | integration | create writes the year and exactly two semesters atomically |
| AC-4 | integration | a second `CURRENT` insert is rejected by the database |
| AC-5 | integration | `makeCurrent` closes the previous, sets the new one, one audit row each, reason stored; rollback leaves both unchanged |
| AC-6 | unit + integration | transition matrix; closed year cannot be made current or edited |
| AC-7 | integration | `isYearWritable`/`assertYearWritable` for each status |
| AC-8 | integration | update audited with diff; invalid update refused |
| AC-9 | integration + e2e | provider lists newest first and defaults to current; header selector visible and persists a choice |
| AC-10 | e2e | list filters/sorts, detail shows semesters and history |
| AC-11 | unit + e2e | registry filters by permission and orders; empty message |
| AC-12 | e2e | sysadmin writes; secretary reads but has no write controls; lecturer reads; student gets 403 |
| AC-13 | integration | seed idempotent, exactly one current |

## 6. Definition of done

- [ ] All tasks ticked, all ACs covered by tests
- [ ] `pnpm lint && pnpm typecheck && pnpm test` pass; E2E for user-facing flows pass
- [ ] Security checklist in [conventions.md](../../02-architecture/conventions.md#security-checklist-every-feature) satisfied
- [ ] i18n keys added (`en` and `sq`)
- [ ] Docs updated (domain model, ADR-0006 consequences, brief)
- [ ] FEATURES.md Status → `done`; `node scripts/features.mjs --write`
