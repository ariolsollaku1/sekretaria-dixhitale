# CUR-07 — Approved documents archive

| | |
|---|---|
| **Phase** | P5 |
| **Depends on** | CUR-03 |
| **Questions** | Q-126 (non-blocking): what is archived, who writes and reads, plan in force per year, template link |
| **Source** | SRC-111, SRC-112 |
| **Brief** | [../modules/cur.md](../modules/cur.md) |

> Spec lifecycle: write from this template → review with the user → set Status `specced` in
> FEATURES.md → build task by task → tick tasks → Status `done`.

## 1. Context

SRC-111: the diploma form and the supplement **approved for the current academic year** are kept and
reachable, besides the department, by the Secretariat, the administrator, the program coordinator,
etc. SRC-112: the plan, syllabi, diploma and supplement approved in **past years** stay reachable.
CUR-02 and CUR-03 already hold approved plans and syllabi with their history. This feature adds one
place to look them up **per academic year and program**, and stores what the system does not hold yet:
the approved **diploma form**, **diploma supplement** and the scanned **approval decisions**, each
optionally linked to the PLT-09 template version used by GRD-02.

## 2. Requirements

### User stories

- As the **secretariat**, I want one view of everything approved for an academic year and program, so
  I can answer a request about last year's plan, syllabi or diploma form.
- As a **department / secretariat user**, I want to upload the approved diploma form, supplement or a
  scanned decision for a year, so it is kept with the others.
- As **GRD-02**, I want to know which template version was approved for a year.

### Acceptance criteria (EARS)

| ID | Criterion |
|---|---|
| AC-1 | THE SYSTEM SHALL store archive documents (`ApprovedDocument`) with kind (`DIPLOMA_FORM`, `DIPLOMA_SUPPLEMENT`, `DECISION`, `OTHER`), academic year, optional program (none = whole institution), title, optional decision reference and date, a PLT-08 file (purpose `approved-document`), optional template version, notes, status (`ACTIVE`, `WITHDRAWN`) and who/when. |
| AC-2 | WHEN an authorized user adds a document for any academic year (also a closed one), THE SYSTEM SHALL create it `ACTIVE`, attach the user's own pending file of purpose `approved-document`, and audit it; IF the file is not the user's own pending file, or the program, year or template does not exist, THEN it SHALL refuse. |
| AC-3 | WHILE a document is `ACTIVE`, THE SYSTEM SHALL let an authorized user edit its title, decision reference and date, notes and template link; the file, kind, year and program never change (database trigger). |
| AC-4 | WHEN an authorized user withdraws a document with a reason, THE SYSTEM SHALL mark it `WITHDRAWN` (kept, with who/when/why) and audit it; documents are never deleted (database trigger). A wrong file is corrected by withdrawing and adding a new document. |
| AC-5 | THE SYSTEM SHALL show, for the selected academic year and optional program filter, per program: the curriculum plan in force that year (link), the number of its courses with an approved syllabus out of all (link to the syllabi board), and the archive documents of the year (program-specific and institution-wide) with download links. |
| AC-6 | THE SYSTEM SHALL pick the plan in force in a year as the approved or archived plan of the program with the latest valid-from year not after that year (highest version on a tie). |
| AC-7 | THE SYSTEM SHALL list only the programs and documents inside the viewer's scope (`cur.archive.view`); institution-wide documents are visible to every viewer. Withdrawn documents are shown to writers only. |
| AC-8 | THE SYSTEM SHALL restrict add, edit and withdraw to `cur.archive.write` checked against the document's program (head of department: their department's programs); institution-wide documents need institution scope. |
| AC-9 | THE SYSTEM SHALL serve an archive file only through the files route, to `cur.archive.view` holders for an `ACTIVE` document in scope, and to `cur.archive.write` holders also for a withdrawn one. |

### Out of scope

Generating diplomas or supplements (GRD-02), versioning of documents beyond withdraw-and-add,
approval workflow (documents are filed already approved), a global search across years.

### Assumptions (Q-126)

- The archive is organised by the global selected academic year; "current" and "past" years are the
  same view with another year.
- Documents are filed as already approved decisions; there is no draft state.
- Readers: sysadmin, head of department, program coordinator, secretary, student affairs, quality.
  Writers: sysadmin, secretary, head of department (SRC-111 names department and secretariat).
- Plans and syllabi are not copied: the archive links to CUR-02 / CUR-03.

## 3. Design

### Data model

```prisma
enum ApprovedDocumentKind { DIPLOMA_FORM DIPLOMA_SUPPLEMENT DECISION OTHER }
enum ApprovedDocumentStatus { ACTIVE WITHDRAWN }

model ApprovedDocument {
  id, kind, academicYearId, programId?, title, decisionRef?, decisionDate? (Date),
  fileId @unique, templateId? -> DocumentTemplate, notes?, status,
  withdrawnAt?, withdrawnById?, withdrawReason?, created/updated at + by
  @@index([academicYearId, programId])
}
```

DB trigger: no delete; kind, academic year, program and file never change.

### Permissions

| Permission | Granted to |
|---|---|
| `cur.archive.view` | sysadmin, head_of_department, program_coordinator, secretary, student_affairs, quality |
| `cur.archive.write` | sysadmin, secretary, head_of_department (scoped) |

### Server

| Kind | Name | Purpose |
|---|---|---|
| domain | `domain/archive-rules.ts`, `archive-schemas.ts` | plan in force, Zod |
| service | `archive.service.ts` | add, edit, withdraw (+ audit) |
| queries | `archive.queries.ts` | archive of a year, template options |
| purpose | `archive.purposes.ts` | file purpose `approved-document` (PDF, JPEG, PNG; scans) |

### UI

| Route | Who | What |
|---|---|---|
| `/cur/archive` | view | selected year, program filter; per program the plan in force, syllabi coverage and documents; add / edit / withdraw for writers |

### Edge cases & errors

- A program without any approved plan up to the year shows "no plan approved".
- A deactivated program still appears if it has a plan in force or documents.
- Withdrawing twice, or editing a withdrawn document → conflict.

## 4. Tasks

- [x] **T1** — `archive.prisma` + migration (trigger); permissions; file purpose; nav. (AC-1, AC-4, AC-8, AC-9)
- [x] **T2** — Pure rules and schemas with unit tests. (AC-6)
- [x] **T3** — Service and queries; integration tests. (AC-2..AC-9)
- [x] **T4** — Archive page, add / edit / withdraw UI, i18n. (AC-5, AC-7)
- [x] **T5** — E2E, docs. (all)

## 5. Test plan

| AC | Test type | Test |
|---|---|---|
| AC-1, AC-4 | integration | columns; delete and frozen-field trigger |
| AC-2, AC-3 | integration | add gates (foreign file, unknown refs, closed year ok); edit |
| AC-4 | integration | withdraw, twice → conflict |
| AC-5, AC-6 | unit + integration | plan in force; syllabus coverage; documents of the year |
| AC-7..AC-9 | integration + e2e | scope per head of department; institution-wide needs institution scope; file route; lecturer forbidden |

## 6. Definition of done

- [x] All tasks ticked, all ACs covered by tests
- [x] `pnpm lint && pnpm typecheck && pnpm test` pass; E2E for user-facing flows pass
- [x] Security checklist in [conventions.md](../../02-architecture/conventions.md#security-checklist-every-feature) satisfied
- [x] i18n keys added (`en` and `sq`)
- [x] Docs updated (domain model, brief)
- [x] FEATURES.md Status → `done`; `node scripts/features.mjs --write`
