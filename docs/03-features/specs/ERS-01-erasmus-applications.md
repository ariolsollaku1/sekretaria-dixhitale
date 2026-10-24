# ERS-01 — Erasmus applications

| | |
|---|---|
| **Phase** | P7 |
| **Depends on** | PLT-15 |
| **Questions** | Q-96 (non-blocking): fields of the three forms, mobility states; Q-97 (non-blocking): how an applicant is recognized as a known student or staff member, who sees what |
| **Source** | SRC-037f, SRC-130, SRC-131, SRC-132, SRC-133 |
| **Brief** | [../modules/ers.md](../modules/ers.md) |

> Spec lifecycle: write from this template → review with the user → set Status `specced` in
> FEATURES.md → build task by task → tick tasks → Status `done`.

## 1. Context

The Erasmus Office needs three application forms — students (SRC-037f, SRC-132), academic staff
(SRC-131) and administrative staff (SRC-130) — that live on the website while the applicants' data
flow into the system (SRC-133). PLT-15 (forms engine) already stores definitions, public and signed-in
submissions, the per-form inbox with a workflow and exports. This feature adds, in a new ERS module,
the **six form definitions** (a public and an in-portal variant of each of the three), a dedicated
**Erasmus applications list** for the Erasmus officer (applicant type, destination, period, state,
the known student or staff record) with export, and the permission that opens it. The status
changes (shortlist, select, reject, mobility done) are done in the existing forms inbox.

## 2. Requirements

### User stories

- As a **prospective Erasmus participant** (student, academic or administrative staff member), I want
  to apply from the website without an account, or from the portal when signed in.
- As the **Erasmus officer**, I want all applications of the three kinds in one list with their
  state, destination and period, so that I can shortlist, select, reject and close mobilities.
- As the **Erasmus officer**, I want to see whether an applicant is a known student or staff member
  of LOGOS, and to export the list for reporting.

### Acceptance criteria (EARS)

| ID | Criterion |
|---|---|
| AC-1 | THE SYSTEM SHALL provide six published form definitions handled by the Erasmus officer: `erasmus-student`, `erasmus-academic`, `erasmus-admin` (public, no files) and `erasmus-student-portal`, `erasmus-academic-portal`, `erasmus-admin-portal` (signed-in, with an optional motivation-letter file). |
| AC-2 | THE SYSTEM SHALL give every definition the workflow `submitted` → `shortlisted` → `selected` → `mobility_done`, with `rejected` reachable from `submitted`, `shortlisted` and `selected`; `rejected` and `mobility_done` are final. |
| AC-3 | THE SYSTEM SHALL ask each applicant kind for its own data (SRC-130..132): identity and contact; for students program, year of study and optionally student number and date of birth; for staff unit and position; for all the destination institution, the mobility type, the period and a motivation. |
| AC-4 | THE SYSTEM SHALL let users with `ers.application.read` (Erasmus officer, sysadmin) open an Erasmus applications list showing, per application, reference, applicant kind, name, e-mail, destination, period, state and submitted time, with filters by kind and state and the standard export. |
| AC-5 | THE SYSTEM SHALL show per application the known record of the applicant when there is one: for a signed-in application the student or staff record of the submitter's person; for a public student application the student whose number and date of birth both match; for a public staff application the staff member whose person e-mail matches. Otherwise it shows none. It SHALL NOT reveal which part of a partial match was wrong. |
| AC-6 | THE SYSTEM SHALL link the known record only to holders of `stu.student.read` (students) or `hr.staff.read` (staff), and SHALL show the record as plain text otherwise. |
| AC-7 | THE SYSTEM SHALL limit the list to the submissions of the Erasmus forms that the user handles (inbox rule), and give anybody without `ers.application.read` the forbidden page. |
| AC-8 | THE SYSTEM SHALL keep status changes, assignment, comments and notification of signed-in applicants as PLT-15 does, and SHALL link each list row to the submission detail in the inbox. |
| AC-9 | THE SYSTEM SHALL keep personal data out of logs; the list shows no national identifier. |

### Out of scope

Prefilling the in-portal forms from the user's record (engine feature of PLT-15, not available);
partner-university agreements, mobility grants and learning agreements; Erasmus reporting beyond the
list export; e-mails to anonymous applicants (Q-37); a CAPTCHA (Q-37).

### Assumptions

- Q-96, Q-97 above. The wording and fields are a first proposal that the sysadmin can edit in PLT-15
  (a change is a new draft version); the form keys stay.
- No handler is registered: an Erasmus decision has no automatic effect on other records.
- The forms are served as six definitions because a definition has one audience (PLT-15 AC-1).
- The dev/demo seeder publishes the forms so the flow can be tried; production loads them in the
  forms admin.

## 3. Design

### Data model

No new tables: an application is a `FormSubmission` (domain-model: `ErasmusApplication` via
`FormSubmission` + status). The applicant kind is derived from the definition key; the destination,
period, name and e-mail from the answers.

### Definitions

| Key | Audience | Fields |
|---|---|---|
| `erasmus-student` | public | firstName, lastName, email, phone, birthDate, studentNumber (optional), program, yearOfStudy, destination, mobilityType (study / traineeship), period (autumn / spring / full year), academicYear, languageLevel, motivation, confirm |
| `erasmus-academic` | public | firstName, lastName, email, phone, department, position, destination, mobilityType (teaching / training), startDate, endDate, motivation, confirm |
| `erasmus-admin` | public | as academic, with `unit` in place of `department` |
| `*-portal` | signed in | the same without the identity block (name, e-mail, phone, birth date, student number), plus optional file `letter` |

All: `ownerRoles` = erasmus; states `submitted` (initial), `shortlisted`, `selected`, `mobility_done`
(final), `rejected` (kind rejected, final).

### Permissions

| Permission | Granted to |
|---|---|
| `ers.application.read` | sysadmin, erasmus |

The Erasmus officer already has `plt.form.inbox` (all staff roles) and owns the forms through
`ownerRoles`, which is what allows the status changes.

### Server

| Kind | Name | Purpose |
|---|---|---|
| domain | `domain/erasmus-forms.ts` | the six definitions (plain data) |
| domain | `domain/rules.ts` | `applicantKind(formKey)`, `periodLabel` (pure) |
| table | `server/applications.table.tsx` | PLT-10 table `ers.applications` (list, filters, export) |
| lookup | `server/applicant-link.ts` | known student / staff of an application |
| seed | `prisma/seed/ers-forms.ts` | publish the six forms (dev/demo) |

### UI

| Route | Who | What |
|---|---|---|
| `/f/erasmus-student`, `/f/erasmus-academic`, `/f/erasmus-admin` | anyone | public forms (PLT-15) |
| `/forms/erasmus-*-portal` | signed in | in-portal forms (PLT-15) |
| `/ers/applications` | `ers.application.read` | the list; navigation entry "Erasmus" in the administration group |
| `/forms/inbox/[id]` | inbox | existing detail, status changes |

### Edge cases & errors

- A public student gives a student number with a wrong date of birth: no link, no hint.
- A definition edited later with other field keys: the list shows empty cells for missing answers.
- A form of another module is never listed (filter by Erasmus form keys).

**Implementation notes:**
- No form handler is registered; the status changes use the generic inbox of PLT-15 (`ownerRoles` = erasmus).
- `/ers/applications` narrows the inbox query (`inboxWhere`) to the six Erasmus form keys; the known record is looked up in batch per page (`server/applicant-link.ts`).
- The link to a student / staff record is offered when the viewer holds `stu.student.read` / `hr.staff.read` (practically the sysadmin); the Erasmus officer sees the number or "Staff" as text.
- The dev/demo seeder `prisma/seed/ers-forms.ts` publishes the six forms; the dev `erasmus@dev.logos.test` user handles them.

## 4. Tasks

- [x] **T1** — Pure rules and the six definitions with unit tests. (AC-1, AC-2, AC-3)
- [x] **T2** — Permission, applicant lookup and the `ers.applications` table; integration tests. (AC-4..AC-7, AC-9)
- [x] **T3** — Page, navigation, i18n (`sq`, `en`), seeder. (AC-4, AC-8)
- [x] **T4** — E2E, docs (domain model, brief, questions). (all)

## 5. Test plan

| AC | Test type | Test |
|---|---|---|
| AC-1..AC-3 | unit | each definition passes `validateDefinition`; workflow shape; answers validate; fields per kind |
| AC-4, AC-7 | integration | list only Erasmus submissions; filters; a user who does not handle the forms sees no row |
| AC-5, AC-6 | integration | signed-in student/staff link, public student match / wrong date of birth, staff by e-mail; link only with read permission |
| AC-8 | e2e | row links to the inbox detail where the officer shortlists and selects |
| AC-1..AC-8 | e2e | visitor applies publicly, officer sees it, shortlists and selects; student forbidden on `/ers/applications` |

## 6. Definition of done

- [x] All tasks ticked, all ACs covered by tests
- [x] `pnpm lint && pnpm typecheck && pnpm test` pass; E2E for user-facing flows pass
- [x] Security checklist in [conventions.md](../../02-architecture/conventions.md#security-checklist-every-feature) satisfied
- [x] i18n keys added (`en` and `sq`)
- [x] Docs updated (domain model, brief)
- [x] FEATURES.md Status → `done`; `node scripts/features.mjs --write`
