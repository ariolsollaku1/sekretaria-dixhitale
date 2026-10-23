# CUR-01 — Course catalog

| | |
|---|---|
| **Phase** | P1 |
| **Depends on** | ORG-03 |
| **Questions** | Q-28 (open, non-blocking): course categories and credit values — working assumption: an administrator-maintained category list, whole-number credits 0–60 and hours 0–500 |
| **Source** | SRC-013 (curriculum plans include courses, course category, credits, hours) |
| **Brief** | [../modules/cur.md](../modules/cur.md) |

> Spec lifecycle: write from this template → review with the user → set Status `specced` in
> FEATURES.md → build task by task → tick tasks → Status `done`.

## 1. Context

Curriculum plans (CUR-02) are built from courses, with category, credits and hours (SRC-013). A
single catalog of courses, reused by every plan, avoids retyping and keeps names consistent. The
catalog is also the first place where **scoped write permissions** are used for real: a head of
department edits the courses of their own department, the sysadmin all of them. The initial load
of a few hundred courses comes from the institution's existing spreadsheets, hence Excel/CSV import.

## 2. Requirements

### User stories

- As a **head of department**, I want to maintain the courses owned by my department, so that
  plans can use them.
- As a **sysadmin**, I want to load the existing course list from a spreadsheet and review it
  before it is saved, so that the first setup is fast and safe.
- As a **secretary or lecturer**, I want to search the catalog, so that I find a course by code or
  name.

### Acceptance criteria (EARS)

| ID | Criterion |
|---|---|
| AC-1 | THE SYSTEM SHALL store courses with `code` (unique, normalised upper case, 2–20 characters from `A–Z 0–9 - _ .`), `name`, optional `nameEn`, `defaultCredits` (integer 0–60), optional `categoryId`, `hoursLecture`, `hoursSeminar`, `hoursLab` (integers 0–500, default 0), owning `departmentId`, and `active`. |
| AC-2 | THE SYSTEM SHALL let administrators maintain course categories (`code`, `nameSq`, `nameEn`, `active`); a category in use cannot be deleted (there is no delete, only deactivation) and an inactive category cannot be chosen for a course. |
| AC-3 | WHEN a user creates or edits a course, THE SYSTEM SHALL check `cur.course.write` **on the owning department** (sysadmin: everywhere; head of department: their department), validate the fields, and audit the change with before/after. |
| AC-4 | IF a user moves a course to another department, THEN THE SYSTEM SHALL require write permission on both departments. |
| AC-5 | IF a code is already used by another course, THEN THE SYSTEM SHALL refuse it with a field error. |
| AC-6 | WHEN a course is deactivated or reactivated, THE SYSTEM SHALL require a reason and audit it; courses are never deleted; WHERE other modules registered *course dependents* (plans), THE SYSTEM SHALL refuse to deactivate while a dependent reports active uses, naming it. |
| AC-7 | WHEN a course's credits or hours change, THE SYSTEM SHALL NOT alter existing plan entries (plans copy the defaults when a course is added; CUR-02). |
| AC-8 | THE SYSTEM SHALL list courses in a PLT-10 table (code, name, category, credits, hours, department, status; search by code or name; filters by category, department code, status; export), visible to all staff roles that read the catalog. |
| AC-9 | WHEN a sysadmin or head of department uploads a `.csv` or `.xlsx` file (≤ 2 MB, ≤ 2000 rows) on the import page, THE SYSTEM SHALL parse it, validate every row (columns, numbers, known category and department codes, duplicate codes inside the file, write permission on each row's department) and show a **preview** with the valid rows and per-row errors without saving anything. |
| AC-10 | WHEN the user confirms the preview, THE SYSTEM SHALL re-validate the rows on the server (never trusting the client), create the new courses (and, if "update existing" is chosen, update courses with a matching code) in **one transaction** with one audit entry per course, and report the counts; IF any row is invalid or not permitted, THEN nothing SHALL be saved. |
| AC-11 | THE SYSTEM SHALL offer a downloadable CSV template with the expected columns. |
| AC-12 | THE SYSTEM SHALL restrict reads to `cur.course.read` (sysadmin, secretary, student affairs, lecturer, HR, quality, head of department, program coordinator) and category maintenance to `cur.category.write` (sysadmin). |

### Out of scope

Curriculum plans (CUR-02), syllabi (CUR-03), prerequisites between courses, course equivalence
between plans, student-visible catalog, partial imports (it is all-or-nothing by design), importing
categories (maintained by hand: few rows).

### Assumptions

- The two import file kinds share the same columns: `code, name, name_en, credits, category,
  lecture_hours, seminar_hours, lab_hours, department` (header row required, case-insensitive,
  extra columns ignored). `category` and `department` are **codes**.
- Program coordinators read but do not write the catalog (their W in the access matrix concerns
  plans and syllabi, CUR-02/03).
- A head of department can also run the import, limited to rows of their department.

## 3. Design

### Data model

```prisma
// prisma/schema/cur.prisma
model CourseCategory {
  id        String   @id @default(cuid(2))
  code      String   @unique
  nameSq    String   @map("name_sq")
  nameEn    String   @map("name_en")
  active    Boolean  @default(true)
  // timestamps and createdById/updatedById as the other models
  courses   Course[]
  @@map("course_categories")
}

model Course {
  id             String          @id @default(cuid(2))
  code           String          @unique
  name           String
  nameEn         String?         @map("name_en")
  defaultCredits Int             @map("default_credits")
  categoryId     String?         @map("category_id")
  hoursLecture   Int             @default(0) @map("hours_lecture")
  hoursSeminar   Int             @default(0) @map("hours_seminar")
  hoursLab       Int             @default(0) @map("hours_lab")
  departmentId   String          @map("department_id")
  active         Boolean         @default(true)
  // timestamps and createdById/updatedById
  category       CourseCategory? @relation(fields: [categoryId], references: [id])
  department     Department      @relation(fields: [departmentId], references: [id])
  @@index([departmentId])
  @@index([categoryId])
  @@map("courses")
}
```

Check constraints: credits 0–60, each hours column 0–500.

### Permissions

| Permission | Granted to |
|---|---|
| `cur.course.read` | sysadmin, secretary, student_affairs, lecturer, hr, quality, head_of_department, program_coordinator |
| `cur.course.write` | sysadmin (institution), head_of_department (their department) |
| `cur.category.write` | sysadmin |

`registerTargetResolver("department", id → { departmentId: id })` (ORG) and `("course", id → { departmentId })` (CUR) make the scoped checks possible; `expandTargetScope` adds the faculty.

### Server

| Kind | Name | Purpose |
|---|---|---|
| domain | `cur/domain/course-rules.ts` | pure: code, numbers, `validateCourse` |
| domain | `cur/domain/import.ts` | pure: CSV parser, header mapping, row validation (`parseCsv`, `mapRows`, `validateImportRows`), template |
| service | `course.service.ts`, `category.service.ts` | create/update/status with scoped checks, audit |
| service | `import.service.ts` | `previewImport`, `commitImport` (transaction, re-validation) |
| lib | `course-dependents.ts` | `registerCourseDependent` (as programs) |
| query | `course.queries.ts` | detail, category/department options (departments the user may write) |
| table | `course.table.tsx` | PLT-10 table `cur.courses` |
| actions | wrapper-based; the import preview is a server action taking `FormData` |

### UI

| Route | What |
|---|---|
| `/cur/courses` | table, "New course" and "Import" (write) |
| `/cur/courses/new`, `/cur/courses/[id]` | form; detail with edit, status, history |
| `/cur/courses/import` | upload → preview table with errors → confirm; template link |
| `/cur/categories` | list + inline create/edit (sysadmin write, others read) |

Nav: group Teaching → "Courses", "Course categories".

### Edge cases & errors

- A spreadsheet with Albanian characters opened in Excel and saved as CSV may be in a legacy
  encoding: the parser accepts UTF-8 (with or without BOM) and reports an invalid-encoding error
  rather than guessing.
- CSV delimiters `,` and `;` are both accepted (Excel in many European locales writes `;`).
- Numbers like `6.0` or `6,0` in credits are accepted if whole.
- Excel cells that hold numbers or dates where text is expected are read as their displayed text.
- A row whose department the user may not write is an error (not silently skipped).

## 4. Tasks

- [x] **T1** — Models + migration (checks); permissions; target resolvers. (AC-1, AC-12)
- [x] **T2** — Pure course rules and import parsing/validation with unit tests. (AC-1, AC-5, AC-9..AC-11)
- [x] **T3** — Category and course services with scoped checks, dependents hook; integration tests. (AC-2..AC-7)
- [x] **T4** — Import service (preview + commit), template; integration tests. (AC-9..AC-11)
- [ ] **T5** — Course table, list/new/detail pages, status dialog. (AC-8)
- [ ] **T6** — Import page (upload → preview → confirm), categories page, nav, i18n (`cur.*`). (AC-2, AC-9..AC-11)
- [ ] **T7** — Demo seed, e2e (head of department scoped), docs. (all)

## 5. Test plan

| AC | Test type | Test |
|---|---|---|
| AC-1, AC-5 | unit + integration | code/number rules; duplicate refused, also racing |
| AC-2 | integration | inactive category not selectable; deactivate category audited |
| AC-3, AC-4 | integration | head of department can write own-department courses, not another's; moving needs both; sysadmin all |
| AC-6 | integration | reason required; dependent blocks deactivation |
| AC-7 | (CUR-02) | documented; asserted by CUR-02 tests |
| AC-8 | e2e | search/filter/export; lecturer reads without controls; student refused |
| AC-9 | unit + integration | CSV (`,`/`;`, BOM, quotes, CRLF), XLSX; every error kind; limits |
| AC-10 | integration | commit creates all with audit; one bad row saves nothing; update-existing; permission per row |
| AC-11 | e2e | template download parses back through the importer |
| AC-12 | e2e | roles and 403 views |

## 6. Definition of done

- [ ] All tasks ticked, all ACs covered by tests
- [ ] `pnpm lint && pnpm typecheck && pnpm test` pass; E2E for user-facing flows pass
- [ ] Security checklist in [conventions.md](../../02-architecture/conventions.md#security-checklist-every-feature) satisfied
- [ ] i18n keys added (`en` and `sq`)
- [ ] Docs updated (domain model, brief, access matrix note)
- [ ] FEATURES.md Status → `done`; `node scripts/features.mjs --write`
