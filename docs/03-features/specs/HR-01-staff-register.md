# HR-01 — Staff register

| | |
|---|---|
| **Phase** | P1 |
| **Depends on** | ORG-02, PLT-10 |
| **Questions** | Q-31 (non-blocking): field list, typed degree/title, one department, HR-only visibility of national ID / birth date / address |
| **Source** | SRC-027, SRC-060, SRC-062 (SRC-063 for Finance's reads) |
| **Brief** | [../modules/hr.md](../modules/hr.md) |

> Spec lifecycle: write from this template → review with the user → set Status `specced` in
> FEATURES.md → build task by task → tick tasks → Status `done`.

## 1. Context

SRC-060: lecturers are administered as full-time internal (PAE) and part-time external (PAK);
SRC-027 needs the lecturers of each program; SRC-062 requires the general data (degree/title,
gender, age) and employment data from day 1 for the contract template (HR-02). Students and staff
are both `Person`s (domain model); this feature introduces `Person` and `Staff`. STU-01 reuses
`Person`. Login accounts already exist as `User` (`personId`, unique, until now without a target).

## 2. Requirements

### User stories

- As **HR**, I want to register every academic and administrative staff member with their
  qualification and contract dates, so that the institution's staff list is complete.
- As **Finance, the Secretariat, quality staff and heads of department**, I want to read the staff list (heads: their department), so that I can plan and report.
- As a **staff member**, I want to see my own record.

### Acceptance criteria (EARS)

| ID | Criterion |
|---|---|
| AC-1 | THE SYSTEM SHALL store a `Person` (first name, last name, optional father's name, gender `FEMALE`/`MALE`, birth date, optional unique national ID number, phone, e-mail, address) and at most one `Staff` per person with `kind` (`ACADEMIC`/`ADMINISTRATIVE`), `category` (`PAE`/`PAK`/`VOLUNTEER`), optional degree and title (text ≤ 100), optional active department, `retired`, optional primary employer, `contractStart`, optional `contractEnd`, and `active`. |
| AC-2 | IF a required value is missing or invalid (names, gender, birth date in the future or before 1900, malformed e-mail, `contractEnd` before `contractStart`, text too long), THEN THE SYSTEM SHALL refuse with field errors. |
| AC-3 | IF the national ID number or e-mail is already used by another person, THEN THE SYSTEM SHALL refuse with a field error and write nothing. |
| AC-4 | THE SYSTEM SHALL keep `primaryEmployer` only for category `PAK` (cleared otherwise) and require the department, when given, to be active. |
| AC-5 | WHEN HR creates a staff member and a user account with the same e-mail exists without a person, THE SYSTEM SHALL link it (`User.personId`), so the member can see their own record. |
| AC-6 | WHEN HR changes a record, THE SYSTEM SHALL audit before/after with national ID masked, and personal fields (birth date, phone, address) masked too. |
| AC-7 | WHEN HR deactivates (ends employment) or reactivates a staff member, THE SYSTEM SHALL require a reason, keep the record, and audit it. THE SYSTEM SHALL never delete staff. |
| AC-8 | THE SYSTEM SHALL list staff in a PLT-10 table (name, kind, category, degree, title, department, retired, status, contract dates) with filters (kind, category, department, retired, status, name search) limited to the user's scope: institution-wide readers see all, department/faculty-scoped readers their units' staff. |
| AC-9 | THE SYSTEM SHALL show national ID, birth date and address only to holders of `hr.staff.sensitive` (HR, sysadmin) — in the detail page, the list, the export and the edit form; other readers get those fields empty. |
| AC-10 | THE SYSTEM SHALL give every staff member a page with their own record (`hr.staff.self`), and nothing of anybody else's. |
| AC-11 | THE SYSTEM SHALL provide a detail page (all permitted fields, department, contract dates, history for HR) and an edit page for `hr.staff.write`. |
| AC-12 | WHEN HR uploads a CSV (UTF-8) or XLSX with the template columns, THE SYSTEM SHALL show a preview with valid rows and row/field errors without saving; WHEN confirmed it SHALL create all rows in one transaction (any invalid row aborts), skipping persons whose national ID or e-mail exists, and report counts; max 2 000 rows / 2 MB. |
| AC-13 | THE SYSTEM SHALL restrict reads to `hr.staff.read` (sysadmin, secretary, finance, hr, quality, head of department), writes to `hr.staff.write` (hr), sensitive fields to `hr.staff.sensitive` (hr, sysadmin), self view to `hr.staff.self` (every role); no personal data is written to logs. |

### Out of scope

Employment contracts (HR-02), expiry tracking (HR-03), attendance lists, several departments per
person, creating login accounts (IAM-02), photos, bank and social-security data, the department
head / coordinator links (still derived from role assignments).

### Assumptions

- Gender is female/male as on the official forms; degree and title are typed text (Q-31).
- The account link is by e-mail only and only when the account has no person yet.
- Import rows whose person already exists are skipped, never updated (a bulk overwrite of personal
  data is too risky).

## 3. Design

### Data model

```prisma
// prisma/schema/hr.prisma
enum Gender { FEMALE MALE }
enum StaffKind { ACADEMIC ADMINISTRATIVE }
enum StaffCategory { PAE PAK VOLUNTEER }

model Person {
  id, firstName, lastName, fatherName?, gender, birthDate @db.Date, nationalId? @unique,
  phone?, email? @unique, address?, residence?, createdAt, updatedAt, createdById, updatedById
  user  User?
  staff Staff?
}

model Staff {
  id, personId @unique, kind, category, degree?, title?, departmentId?, retired @default(false),
  primaryEmployer?, contractStart @db.Date, contractEnd? @db.Date, active @default(true),
  createdAt, updatedAt, createdById, updatedById
  @@index([departmentId])
}
```

`User.personId` gets the foreign key to `Person`. Migration checks: `contract_end >= contract_start`;
e-mail stored lower-case (app) with a unique index on `lower(email)`.

### Permissions

| Permission | Granted to |
|---|---|
| `hr.staff.read` | sysadmin, secretary, finance, hr, quality, head_of_department (scope from assignment) |
| `hr.staff.write` | hr |
| `hr.staff.sensitive` | hr, sysadmin |
| `hr.staff.self` | every role |

### Server

| Kind | Name | Purpose |
|---|---|---|
| shared | `src/lib/import/*` | CSV decode/parse and XLSX reading extracted from CUR-01 for reuse |
| domain | `domain/schemas.ts`, `domain/import.ts` | Zod; template columns and row validation |
| service | `staff.service.ts` | create, update, deactivate, reactivate, account link (+ audit) |
| service | `import.service.ts` | preview / commit |
| queries | `staff.queries.ts` | scope filter, field masking, own record |
| table | `staff.table.tsx` | PLT-10 table `hr.staff` |

### UI

| Route | Who | What |
|---|---|---|
| `/hr/staff` | read | table; "New" and "Import" for HR |
| `/hr/staff/new`, `/hr/staff/[id]/edit` | write | form |
| `/hr/staff/[id]` | read (scope) | detail; deactivate/reactivate for HR; history |
| `/hr/staff/import` | write | upload, preview, confirm; template download |
| `/hr/me` | self | my own record |

### Edge cases & errors

- A person already exists (e.g. from STU-01, a lecturer who studies): creation by national ID or e-mail of an existing `Person` without staff attaches the staff record to it instead of refusing (a person with staff already → conflict).
- A department-scoped reader opening a staff member outside their units gets 404.
- Deactivated staff stay in lists (status filter) and keep their history.
- Import numbers dates as `YYYY-MM-DD` or Excel dates.

## 4. Tasks

- [x] **T1** — `hr.prisma` + migration (Person, Staff, FK from users); permissions; nav. (AC-1, AC-13)
- [x] **T2** — Extract shared import helpers; schemas and import validation with unit tests. (AC-2, AC-4, AC-12)
- [ ] **T3** — Service and queries (scope, masking, account link); integration tests. (AC-3..AC-10)
- [ ] **T4** — Import preview/commit; tests. (AC-12)
- [ ] **T5** — Table, pages, forms, import UI, my record, i18n. (AC-8..AC-12)
- [ ] **T6** — E2E, seed, docs. (all)

## 5. Test plan

| AC | Test type | Test |
|---|---|---|
| AC-1, AC-2, AC-4 | unit + integration | schema table; department active; employer cleared |
| AC-3 | integration | duplicate national ID / e-mail refused, nothing written; existing person attached |
| AC-5 | integration | account linked by e-mail; not when already linked |
| AC-6, AC-7 | integration | audit masks personal fields; deactivate needs reason, keeps record |
| AC-8, AC-9 | integration + e2e | scope filter; sensitive fields hidden in query, list, export |
| AC-10 | integration + e2e | own record only |
| AC-11, AC-13 | e2e | HR writes, finance reads without controls, student forbidden |
| AC-12 | unit + integration | CSV/XLSX parse, preview errors, commit atomicity, skip existing |

## 6. Definition of done

- [ ] All tasks ticked, all ACs covered by tests
- [ ] `pnpm lint && pnpm typecheck && pnpm test` pass; E2E for user-facing flows pass
- [ ] Security checklist in [conventions.md](../../02-architecture/conventions.md#security-checklist-every-feature) satisfied
- [ ] i18n keys added (`en` and `sq`)
- [ ] Docs updated (domain model, brief)
- [ ] FEATURES.md Status → `done`; `node scripts/features.mjs --write`
