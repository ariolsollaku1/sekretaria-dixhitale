# FIN-03 — Scholarships

| | |
|---|---|
| **Phase** | P3 |
| **Depends on** | FIN-01, PLT-15 |
| **Questions** | Q-23 (open, non-blocking) refined by Q-140 (kinds, who decides), Q-141 (effect on the payment plan), Q-142 (application form, list and report) — all with working assumptions; no percentage, amount or band is preset |
| **Source** | SRC-037a, SRC-083, SRC-084 |
| **Brief** | [../modules/fin.md](../modules/fin.md) |

> Spec lifecycle: write from this template → review with the user → set Status `specced` in
> FEATURES.md → build task by task → tick tasks → Status `done`.

## 1. Context

SRC-037a lists the scholarship form among the forms of the system; SRC-083 asks for the list of
students with full or partial scholarships together with their fees, SRC-084 for the number of
scholarships per academic year and study program. FIN-01 already gives every enrollment a payment
plan per academic year; PLT-15 serves the forms and their inbox, and STU-07 showed how a module adds
forms with a handler and a decision page. FIN-03 adds the scholarship application (public and
in-portal), Finance's decision (which is a `Scholarship` row), the recalculation of the plan, the
list and the report. Payments (FIN-02) are not touched.

## 2. Requirements

### User stories

- As a **student** (or a candidate without login), I want to apply for a scholarship online, so
  that Finance can decide on it.
- As a **finance officer**, I want to record a full or partial scholarship as the decision on an
  application, or directly, and have the student's payment plan recalculated, so that the fees the
  student owes are right.
- As a **finance officer**, I want to void a scholarship with a reason, so that mistakes can be
  corrected and the fee comes back.
- As a **finance officer, secretary or student-affairs officer**, I want the list of scholarship
  holders with their fees and the count per year and program, so that I can report (SRC-083, SRC-084).

### Acceptance criteria (EARS)

| ID | Criterion |
|---|---|
| AC-1 | THE SYSTEM SHALL store a `Scholarship` per enrollment × academic year with `type` (`FULL` or `PARTIAL`), a `category` (`EXCELLENCE`, `NEED`, `DISABILITY`, `OTHER`), for `PARTIAL` exactly one of a percentage (above 0 and below 100) or an amount (above 0), a reason, the application it answers (optional), author and time; only one live (not void) scholarship SHALL exist per enrollment and year, enforced by the database too (Q-140). |
| AC-2 | WHEN Finance grants a scholarship directly, THE SYSTEM SHALL identify the enrollment by student number (and program code when the student has several open enrollments) within Finance's program scope; IF the student is unknown, out of scope or ambiguous, or the terms are invalid, or the enrollment already has a live scholarship for the year, or the academic year is closed, THEN THE SYSTEM SHALL refuse with a field error and record nothing. |
| AC-3 | THE SYSTEM SHALL publish two scholarship application forms handled by Finance: `scholarship` (public; the applicant gives student number and date of birth) and `scholarship-student` (signed in; optional attachment), with the workflow `new` → `review` → `approved` or `rejected`; WHEN Finance records the decision on an application, THE SYSTEM SHALL identify the student as STU-07 does (signed-in account, or student number plus date of birth) and use the application's open enrollment; IF the student cannot be identified or the enrollment is not unique, THEN THE SYSTEM SHALL refuse and leave everything unchanged (Q-142). |
| AC-4 | WHEN a scholarship is granted and the enrollment has a payment plan for the year, THE SYSTEM SHALL, in the same transaction, reduce the active `TUITION` installments of the plan: `FULL` takes all of each installment (which is then cancelled with the reason `SCHOLARSHIP`, its amount kept), a percentage takes that share of each installment (rounded half up), an amount is shared over the installments in proportion and adds up exactly; an amount above the tuition, or a plan without tuition installments, SHALL be refused; a reduced installment loses its early-payment amount; every reduction SHALL be recorded per installment (Q-141). |
| AC-5 | WHEN the plan of an enrollment is generated (FIN-01) and a live scholarship exists for that enrollment and year, THE SYSTEM SHALL apply it to the new plan; a scholarship granted before the plan exists SHALL be stored and applied then, and the audit entry `fin.scholarship.apply` SHALL record it. |
| AC-6 | WHEN Finance voids a scholarship with a reason, THE SYSTEM SHALL give back exactly the recorded reductions (restore the amounts, reactivate installments the scholarship cancelled), keep the row with reason, author and time, and allow a new scholarship for that enrollment and year; a void scholarship SHALL NOT be voided twice, and nothing SHALL change in a closed academic year. |
| AC-7 | WHEN an application is moved to `approved`, THE SYSTEM SHALL require a live scholarship recorded for it (otherwise refuse the approval and leave the application unchanged) and that the user holds `fin.scholarship.write`; moving it to `rejected` SHALL need none; decisions SHALL be recorded only while the application is not in a final state and only by users who handle the form (inbox rules). |
| AC-8 | THE SYSTEM SHALL restrict reads to `fin.scholarship.read` (finance, secretary, student affairs) and writes to `fin.scholarship.write` (finance), within the user's program scope, SHALL audit `fin.scholarship.grant`, `fin.scholarship.apply` and `fin.scholarship.void`, and SHALL refuse students and every other role; an application the user does not handle SHALL behave as if it did not exist. |
| AC-9 | THE SYSTEM SHALL list the scholarships of the selected academic year in a PLT-10 table (student number, name, program, year, type, kind, reduction, tuition before, reduced by, tuition after, plan total, status) with filters on student, name, program, type, kind and status, exportable, within the reader's program scope (SRC-083, Q-142). |
| AC-10 | THE SYSTEM SHALL provide a report of the number of live scholarships per academic year and study program, split into full and partial and by kind, as a PLT-10 table with filters and export, within the reader's scope (SRC-084, Q-142). |
| AC-11 | THE SYSTEM SHALL show on the plan page the scholarships of that enrollment and year, with a void action for Finance, and keep all money as `Decimal(12,2)`, never as floating point. |

### Out of scope

Automatic scholarships from grade bands (Q-23 research: the bands are only recorded as context),
scholarship renewal across years, recalculating a plan after manual adjustments of its installments,
refunds of amounts already paid (FIN-02), scholarships on fees other than tuition, a commission or
multi-step approval, notifying the applicant by e-mail beyond what PLT-15 already does.

### Assumptions

Q-140, Q-141 and Q-142 as stated in `docs/04-open-questions.md`. Every percentage, amount and category is
chosen by Finance — nothing is preset.

## 3. Design

### Data model

```prisma
// prisma/schema/scholarships.prisma
enum ScholarshipType { FULL PARTIAL }
enum ScholarshipCategory { EXCELLENCE NEED DISABILITY OTHER }

model Scholarship {              // scholarships
  id, enrollmentId, academicYearId, type, category,
  percent Decimal(5,2)?, amount Decimal(12,2)?, reason, submissionId String? (FormSubmission),
  createdAt, createdById, voidedAt?, voidedById?, voidReason?
  // migration: partial unique (enrollment_id, academic_year_id) WHERE voided_at IS NULL;
  // checks on the terms and on void fields
}
model ScholarshipCut {           // scholarship_cuts
  id, scholarshipId, installmentId, amount Decimal(12,2) (> 0), cancelled Boolean
  @@unique([scholarshipId, installmentId])
}
```

`PlanInstallment` gets the relation `scholarshipCuts`; `Enrollment`, `AcademicYear` and
`FormSubmission` get the back-relations. Domain-model updated.

### Permissions

| Permission | Granted to |
|---|---|
| `fin.scholarship.read` | finance, secretary, student_affairs |
| `fin.scholarship.write` | finance |

(roles.md: FIN — Finance W, Secretariat/Student affairs R. Approving an application also needs the
form's `ownerRoles` = finance, via `plt.form.inbox`; the sysadmin handles every form.)

### Server

| Kind | Name | Purpose |
|---|---|---|
| domain | `domain/scholarship-rules.ts` | terms validation, `computeCuts`, `distribute`, `feeEffect`, `countScholarships` (pure, in cents / hundredths of a percent) |
| domain | `domain/scholarship-schemas.ts` | Zod for grant and void |
| domain | `domain/scholarship-forms.ts` | the two form definitions (plain data, validated by the PLT-15 schema in a test) |
| service | `server/scholarship.service.ts` | `grantScholarship`, `voidScholarship`, `applyToPlan`, `applyLiveScholarship` |
| hook | `plan.service.ts` | `generatePlans` calls `applyLiveScholarship` for each new plan (AC-5) |
| handler | `server/scholarship-handlers.ts` | `registerFormHandler("fin.scholarship")`: approval needs a recorded scholarship; `detailHref` to the decision page |
| queries | `server/scholarship.queries.ts` | decision panel, open-year options, scholarships of a plan |
| tables | `server/scholarship.table.tsx` | `fin.scholarships` (list) and `fin.scholarshipReport` (counts) |
| action | `server/scholarship.actions.ts` | permission wrapper; void requires a reason |
| cross-module | STU exports `resolveRequester`, `enrollmentOf` (requester identification); `src/lib/forms/all.ts` loads the FIN handler | |
| seed | `prisma/seed/fin-scholarship-forms.ts` | publishes the two forms in dev/demo |

### UI

| Route | Who | What |
|---|---|---|
| `/f/scholarship`, `/forms/scholarship-student` | anyone / signed in | the application forms (PLT-15) |
| `/fin/scholarships` | scholarship.read | list (SRC-083); Finance sees the direct-grant form |
| `/fin/scholarships/report` | scholarship.read | counts per year and program (SRC-084) |
| `/fin/scholarships/applications/[submissionId]` | scholarship.read | applicant, recorded scholarship(s), decision form, void; linked from the inbox detail |
| `/fin/plans/[id]` | plan.read | adds the scholarship section with the void action |

### Edge cases & errors

- Two Finance users granting for the same enrollment and year: the partial unique index gives the
  clear field error `alreadyHas`.
- A scholarship that cannot be applied to an existing plan (no tuition, amount above tuition) is
  refused as a whole; one granted before the plan exists is applied at generation and skipped silently
  if that plan has no tuition (the row stays, Finance can void it).
- Voiding after Finance changed an installment by hand adds back the recorded cut; an installment
  cancelled by hand (not by the scholarship) stays cancelled.
- A voided decision on an application does not count: approving it is refused again.

**Implementation notes:**
- The decision is deliberately the `Scholarship` row (as STU-07's recognized courses): the form
  approval only checks it exists, so there is one path that changes money.
- The same `GrantScholarshipForm` serves the direct grant and the application decision.
- Report and list are PLT-10 tables so they inherit filters, column choice and export.

## 4. Tasks

- [x] **T1** — `scholarships.prisma` + migration with checks and the partial unique index; permissions; nav; i18n skeleton. (AC-1, AC-8)
- [x] **T2** — Pure rules, schemas and form definitions with unit tests. (AC-1, AC-3, AC-4)
- [x] **T3** — Grant / void / apply services and plan-generation hook; integration tests. (AC-1, AC-2, AC-4..AC-6)
- [x] **T4** — Form handler, decision queries and STU requester export; integration tests. (AC-3, AC-7, AC-8)
- [x] **T5** — List and report tables; pages, forms, plan page section, i18n. (AC-9..AC-11)
- [x] **T6** — E2E, seed, docs. (all)

## 5. Test plan

| AC | Test type | Test |
|---|---|---|
| AC-1, AC-2 | unit + integration | terms matrix; one live per year; scope; unknown / ambiguous student; closed year |
| AC-4 | unit + integration | cuts per type without drift; early amounts cleared; tuition only; refusals roll back |
| AC-5 | integration | stored first, applied at generation, audit |
| AC-6 | integration | restore, reactivation, reason, twice, closed year, re-grant |
| AC-3, AC-7 | integration | approval refused without a decision, allowed with, void decision, wrong date of birth, form not handled |
| AC-8 | integration + e2e | permissions; secretary reads, lecturer refused; audit entries |
| AC-9, AC-10 | integration + e2e | list fees before/reduction/after; report counts, void leaves the report |
| AC-11 | e2e | plan page shows the reduction and the void action restores the fee |

## 6. Definition of done

- [x] All tasks ticked, all ACs covered by tests
- [x] `pnpm lint && pnpm typecheck && pnpm test` pass; E2E for user-facing flows pass
- [x] Security checklist in [conventions.md](../../02-architecture/conventions.md#security-checklist-every-feature) satisfied
- [x] i18n keys added (`en` and `sq`)
- [x] Docs updated (domain model, brief)
- [x] FEATURES.md Status → `done`; `node scripts/features.mjs --write`
