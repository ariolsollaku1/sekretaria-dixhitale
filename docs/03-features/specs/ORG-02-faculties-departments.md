# ORG-02 — Faculties & departments

| | |
|---|---|
| **Phase** | P1 |
| **Depends on** | PLT-06, PLT-07 |
| **Questions** | none blocking. Working assumptions: codes unique across the institution, a department cannot move to another faculty, the head of department is derived from role assignments until HR-01 adds staff records |
| **Source** | SRC-011 |
| **Brief** | [../modules/org.md](../modules/org.md) |

> Spec lifecycle: write from this template → review with the user → set Status `specced` in
> FEATURES.md → build task by task → tick tasks → Status `done`.

## 1. Context

SRC-011 puts faculties and departments into the structure module. They are the units that scoped
roles point at ([auth.md](../../02-architecture/auth.md#authorization-model): a secretary can be
scoped to one faculty, a head of department to one department) and the parents of study programs
(ORG-03). PLT-05 already defines scope resolvers (`exists`, `ancestors`, `options`) that ORG must
register; IAM-01's role editor offers faculty/department scopes only once they exist. This feature
supplies the data, the screens, and those resolvers.

## 2. Requirements

### User stories

- As a **sysadmin**, I want to maintain the faculties and their departments, so that programs,
  roles and reports can refer to them.
- As a **sysadmin**, I want to deactivate a unit that no longer exists without losing its history,
  so that old records still show where they belonged.
- As a **sysadmin**, I want to scope a secretary to one faculty or a head of department to one
  department when I create a user, so that people only see their own area.

### Acceptance criteria (EARS)

| ID | Criterion |
|---|---|
| AC-1 | THE SYSTEM SHALL store faculties (`code`, `name`, optional English `nameEn`, `active`) and departments (`facultyId`, `code`, `name`, optional `nameEn`, `active`); a department belongs to exactly one faculty, which cannot be changed after creation. |
| AC-2 | WHEN a code is entered, THE SYSTEM SHALL normalise it (trim, upper case) and require 2–12 characters from `A–Z 0–9 - _`; IF it is already used by another faculty or department (case-insensitively), THEN THE SYSTEM SHALL refuse it with a field error. |
| AC-3 | WHEN a sysadmin creates or edits a faculty or department, THE SYSTEM SHALL validate it, save it in a transaction and write an audit entry with before/after. |
| AC-4 | IF a department is created under an inactive faculty, THEN THE SYSTEM SHALL refuse it. |
| AC-5 | WHEN a sysadmin deactivates a faculty or department, THE SYSTEM SHALL require a reason, set `active=false` (no delete exists) and audit it; reactivating requires a reason as well. |
| AC-6 | IF a faculty still has active departments, THEN THE SYSTEM SHALL refuse to deactivate it and name the count; IF a faculty is inactive, THEN its departments SHALL NOT be reactivated before it is. |
| AC-7 | THE SYSTEM SHALL register the `FACULTY` and `DEPARTMENT` scope resolvers with PLT-05: `exists` is true only for active units, `options` lists active units (code and name) for the role editor, `ancestors(department)` returns its faculty. |
| AC-8 | WHEN the IAM role editor opens, THE SYSTEM SHALL therefore offer faculty scope for secretary and department scope for head of department, and `assignRole` SHALL reject an unknown or inactive unit. |
| AC-9 | THE SYSTEM SHALL show on a department's page the people who currently hold the `head_of_department` role scoped to it (name, email, link to the user), derived from role assignments; HR-01 later adds a `headStaffId` link. |
| AC-10 | THE SYSTEM SHALL list faculties and departments in PLT-10 tables (code, name, counts / faculty, status; filters by status and, for departments, by faculty; search by code or name) with detail pages showing the change history. |
| AC-11 | THE SYSTEM SHALL restrict writes to `org.faculty.write` / `org.department.write` (sysadmin) and reads to `org.faculty.read` / `org.department.read` (the roles that read ORG structure per the access matrix). |
| AC-12 | THE SYSTEM SHALL seed neutral demo units for development (not the real LOGOS structure) and give the dev head-of-department user a department-scoped role. |

### Out of scope

Study programs (ORG-03), staff records and the `headStaffId` link (HR-01), moving a department to
another faculty, merging units, deleting units, per-unit contact data or addresses.

### Assumptions

- Codes are unique across faculties **and** departments so they can be used unambiguously in
  program codes and reports; the real code scheme is the client's to choose (format only is fixed
  here).
- An English name is optional because the UI is bilingual (Q-17) while the official name is Albanian.
- Deactivating a unit that still appears in role scopes is allowed; those assignments stay (history)
  but no new assignment can use the unit (AC-7).

## 3. Design

### Data model

```prisma
// prisma/schema/org.prisma
model Faculty {
  id          String   @id @default(cuid(2))
  code        String   @unique
  name        String
  nameEn      String?  @map("name_en")
  active      Boolean  @default(true)
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt   DateTime @updatedAt @map("updated_at") @db.Timestamptz(3)
  createdById String?  @map("created_by_id")
  updatedById String?  @map("updated_by_id")
  departments Department[]
  @@map("faculties")
}

model Department {
  id          String   @id @default(cuid(2))
  facultyId   String   @map("faculty_id")
  code        String   @unique
  name        String
  nameEn      String?  @map("name_en")
  active      Boolean  @default(true)
  // createdAt/updatedAt/createdById/updatedById as above
  faculty     Faculty  @relation(fields: [facultyId], references: [id])
  @@index([facultyId])
  @@map("departments")
}
```

Codes are stored normalised (upper case), so a plain unique index per table is case-insensitive in
practice; the cross-table check (a department code may not equal a faculty code) is done in the
service inside the transaction.

### Permissions

| Permission | Granted to |
|---|---|
| `org.faculty.read`, `org.department.read` | sysadmin, secretary, student_affairs, lecturer, finance, hr, quality, head_of_department, program_coordinator |
| `org.faculty.write`, `org.department.write` | sysadmin |

### Server

| Kind | Name | Purpose |
|---|---|---|
| domain | `org/domain/unit-rules.ts` | pure: `normalizeCode`, `validateCode`, `canDeactivateFaculty(activeDepartments)`, `canReactivateDepartment(facultyActive)` |
| service | `faculty.service.ts`, `department.service.ts` | create, update, deactivate, reactivate (+ audit, cross-table code check) |
| query | `unit.queries.ts` | detail with counts, department heads from `UserRole`, options |
| resolvers | `scope-resolvers.ts` | registers `FACULTY` / `DEPARTMENT` with PLT-05 |
| tables | `faculty.table.tsx`, `department.table.tsx` | PLT-10 tables `org.faculties`, `org.departments` |
| actions | `unit.actions.ts` | wrapper-based |

### UI

| Route | Who | What |
|---|---|---|
| `/org/faculties`, `/org/faculties/new`, `/org/faculties/[id]` | read / write | list; form; detail with departments list, edit, deactivate/reactivate, history |
| `/org/departments`, `/org/departments/new`, `/org/departments/[id]` | read / write | list (faculty filter); form with faculty select; detail with heads, edit, deactivate/reactivate, history |

Nav: group Administration, "Faculties" and "Departments".

### Edge cases & errors

- Two sysadmins create the same code at once → the unique index wins; the loser sees the
  "code already used" error.
- A code that differs only by case or surrounding spaces counts as the same code.
- Deactivating a faculty requires deactivating its departments first (one by one, each audited).
- The role editor never offers inactive units; an old assignment to one still displays by id/label.

**Implementation notes:**
- The department table filters by *faculty code* (text, contains) instead of a faculty dropdown,
  because select options are static in a table definition.
- `FormField` got a `formatError` prop: shared Zod schemas emit catalog keys (`invalidCode`,
  `required`), forms translate them; server errors that are already text pass through. The same
  fix applies to the ORG-01 year form.
- Scope resolvers (`FACULTY`, `DEPARTMENT`) live in `scope-resolvers.ts` and are registered by the
  module index; only active units can be newly assigned and the IAM role editor lists them.
- Seed: neutral demo units `DEMO-A` (departments `DEMO-A1`, `DEMO-A2`) and `DEMO-B` (`DEMO-B1`);
  the dev head-of-department user is scoped to `DEMO-A1`. Seeds run org units before roles.
- Heads of department are derived from role assignments (users with an active, valid
  `head_of_department` role scoped to the department); HR-01 adds `headStaffId`.
- Deactivation errors travel as `CODE:count` in the message so the UI can show the count.

## 4. Tasks

- [x] **T1** — Models + migration (case-insensitive unique indexes); permissions. (AC-1, AC-11)
- [x] **T2** — Pure unit rules and schemas with unit tests. (AC-2, AC-4, AC-6)
- [x] **T3** — Faculty and department services, queries, actions; integration tests. (AC-1..AC-6, AC-9)
- [x] **T4** — Scope resolvers registered; integration with `assignRole` and the role editor options. (AC-7, AC-8)
- [x] **T5** — Faculty table and pages. (AC-10)
- [x] **T6** — Department table and pages (heads of department). (AC-9, AC-10)
- [x] **T7** — Nav, i18n (`org.*`), demo seed + dev head-of-department role, e2e, docs. (AC-12 and all)

## 5. Test plan

| AC | Test type | Test |
|---|---|---|
| AC-2 | unit | `normalizeCode` / `validateCode` table (length, charset, case, spaces) |
| AC-1, AC-3 | integration | create/update persist and audit before/after; faculty of a department immutable |
| AC-2 | integration | duplicate code refused across both tables, case-insensitively; concurrent create has one winner |
| AC-4, AC-6 | unit + integration | inactive faculty cannot get departments; cannot deactivate with active departments; department cannot be reactivated under an inactive faculty |
| AC-5 | integration | deactivate/reactivate need a reason; no delete path |
| AC-7, AC-8 | integration | resolvers: exists/options/ancestors; `assignRole` accepts an active department and rejects inactive/unknown; role editor options include the units |
| AC-9 | integration + e2e | department page lists current head(s) from role assignments |
| AC-10, AC-11 | e2e | list filters/sort/export; secretary reads without write controls; student gets 403 |
| AC-12 | integration | seed idempotent; dev head-of-department has the scoped role |

## 6. Definition of done

- [x] All tasks ticked, all ACs covered by tests
- [x] `pnpm lint && pnpm typecheck && pnpm test` pass; E2E for user-facing flows pass
- [x] Security checklist in [conventions.md](../../02-architecture/conventions.md#security-checklist-every-feature) satisfied
- [x] i18n keys added (`en` and `sq`)
- [x] Docs updated (domain model, brief, auth.md scope resolvers note)
- [x] FEATURES.md Status → `done`; `node scripts/features.mjs --write`
