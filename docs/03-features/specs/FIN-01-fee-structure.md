# FIN-01 — Fee structure & payment plans

| | |
|---|---|
| **Phase** | P3 |
| **Depends on** | STU-01 (ORG-01, ORG-03 through it) |
| **Questions** | Q-24 (open, non-blocking) refined by Q-85 (currency, fee keys, types), Q-86 (installments), Q-87 (discounts), Q-88 (who gets a plan), Q-89 (adjustments) — all with working assumptions, no amount or rule is preset |
| **Source** | SRC-001, SRC-080a, SRC-085 |
| **Brief** | [../modules/fin.md](../modules/fin.md) |

> Spec lifecycle: write from this template → review with the user → set Status `specced` in
> FEATURES.md → build task by task → tick tasks → Status `done`.

## 1. Context

SRC-080a lists the payments the college collects (tuition, administrative and diploma fees, backlog
exams, others); SRC-085 groups students by the payment deadlines of the annex of their contract,
since payments are made in installments; SRC-001 says finance reports by calendar year while the
system is organised by academic year (ADR-0006): a plan pays for an **academic year** and every
installment has a **calendar date**. FIN-01 lets Finance set the fee schedule of a program for an
academic year and generate each student's payment plan from it. Recording payments is FIN-02,
scholarships FIN-03, reminders FIN-04, the shared lists FIN-05.

## 2. Requirements

### User stories

- As a **finance officer**, I want to enter the fees of each program for an academic year with their
  installments and discounts, so that every student's plan comes from one schedule.
- As a **finance officer**, I want to generate payment plans for the students of a program (or one
  student) and adjust a student's installments with a reason, so that special arrangements are kept.
- As a **secretary or student-affairs officer**, I want to read the fees and the plans, so that I
  can answer students.

### Acceptance criteria (EARS)

| ID | Criterion |
|---|---|
| AC-1 | THE SYSTEM SHALL store a fee schedule item per program × academic year × kind (`TUITION`, `ADMINISTRATIVE`, `DIPLOMA`, `BACKLOG_EXAM`, `OTHER`) × label with an `amount` as `Decimal(12,2)` greater than zero (Q-85); the same key cannot exist twice. |
| AC-2 | THE SYSTEM SHALL let Finance save an item with its installments (sequence, due date, amount); IF the installments do not add up exactly to the item amount, or a due date is invalid or repeated, THEN THE SYSTEM SHALL refuse with a field error. An item without installments is paid in one installment due on the first day of the academic year (Q-86). |
| AC-3 | THE SYSTEM SHALL let Finance attach discounts to an item (a percentage above 0 and up to 100, or an amount below the fee, with a from/to date window); IF the window is reversed or the value out of range THEN THE SYSTEM SHALL refuse (Q-87). |
| AC-4 | THE SYSTEM SHALL let Finance deactivate and reactivate an item instead of deleting it; inactive items are ignored when plans are generated. |
| AC-5 | IF the academic year is closed, THEN THE SYSTEM SHALL refuse every change to the fee schedule and to payment plans of that year. |
| AC-6 | WHEN Finance generates plans for a program and academic year (optionally for one student number), THE SYSTEM SHALL create one `PaymentPlan` per open enrollment (active or suspended) of the program that has a yearly registration in that year and no plan yet, copying every active item's installments (or its single installment) into plan installments ordered by due date, and report the numbers created and skipped; IF the program has no active fee items for the year, THEN THE SYSTEM SHALL refuse (Q-88). |
| AC-7 | WHEN a plan is generated, THE SYSTEM SHALL record on each installment the amount to pay under the best discount of its item and the end of that window (`earlyAmount`, `earlyUntil`), computed without rounding drift (the amounts of an amount-discount add up exactly) (Q-87). |
| AC-8 | THE SYSTEM SHALL let Finance change the amount and due date of a plan installment, add an installment and cancel one, each with a reason; changing an amount clears its early amount; cancelled installments stay visible (no hard deletes); every change writes an audit entry with before and after (Q-89). |
| AC-9 | THE SYSTEM SHALL show a plan with its active installments, cancelled ones and the totals (plan total, total if all early windows are honoured) to every reader. |
| AC-10 | THE SYSTEM SHALL list payment plans in a PLT-10 table (student number, name, program, academic year, installments, total, next due date) with filters, exportable, within the reader's program scope. |
| AC-11 | THE SYSTEM SHALL restrict writes to `fin.fee.write` / `fin.plan.write` (finance) and reads to `fin.fee.read` / `fin.plan.read` (finance, secretary, student affairs), and audit every change; students and every other role are refused. |
| AC-12 | THE SYSTEM SHALL keep all money as `Decimal(12,2)`, never as floating point, and display it with two decimals. |

### Out of scope

Payments and balances (FIN-02), scholarships and recalculation (FIN-03), reminders (FIN-04),
shared debtor lists (FIN-05), invoices (ADM-05), student portal view of the plan (FIN-02), copying
a schedule from a previous year, currencies other than the single one (Q-85), approval of
adjustments (Q-89).

### Assumptions

Q-85…Q-89 as stated in `docs/04-open-questions.md`; every amount, date, discount and installment
count is entered by Finance — nothing is preset by the system.

## 3. Design

### Data model

```prisma
// prisma/schema/finance.prisma
enum FeeKind { TUITION ADMINISTRATIVE DIPLOMA BACKLOG_EXAM OTHER }
enum DiscountKind { PERCENT AMOUNT }
enum InstallmentStatus { ACTIVE CANCELLED }

model FeeScheduleItem {            // fee_schedule_items
  id, programId, academicYearId, kind FeeKind, label String @default(""), amount Decimal(12,2),
  active Boolean, createdAt, updatedAt, createdById, updatedById
  @@unique([programId, academicYearId, kind, label])
}
model FeeInstallmentTemplate {     // fee_installment_templates
  id, itemId, sequence Int, dueDate Date, amount Decimal(12,2)   @@unique([itemId, sequence])
}
model FeeDiscount {                // fee_discounts
  id, itemId, label, kind DiscountKind, value Decimal(12,2), validFrom Date, validTo Date
}
model PaymentPlan {                // payment_plans
  id, enrollmentId, academicYearId, createdAt, updatedAt, createdById, updatedById
  @@unique([enrollmentId, academicYearId])
}
model PlanInstallment {            // plan_installments
  id, planId, sequence Int, kind FeeKind, label, dueDate Date, amount Decimal(12,2),
  earlyAmount Decimal(12,2)?, earlyUntil Date?, status InstallmentStatus, scheduleItemId String?,
  adjustedAt DateTime?, cancelReason String?, createdAt, updatedAt, createdById, updatedById
  @@unique([planId, sequence])
}
```

Database checks: `amount > 0`; discount `value > 0`, percent ≤ 100, `valid_from <= valid_to`;
`early_amount >= 0 AND early_amount < amount`. Money is `Decimal(12,2)`; the domain computes in
whole cents (integers) and converts from and to decimal strings, so there is no floating point.

### Permissions

| Permission | Granted to |
|---|---|
| `fin.fee.read` | finance, secretary, student_affairs |
| `fin.fee.write` | finance |
| `fin.plan.read` | finance, secretary, student_affairs |
| `fin.plan.write` | finance |

(roles.md: FIN — Finance W, Secretary/Student affairs R; the student's own view comes with FIN-02.)

### Server

| Kind | Name | Purpose |
|---|---|---|
| domain | `domain/money.ts` | parse/format decimal strings ↔ cents, proportional shares |
| domain | `domain/fee-rules.ts` | installment/discount validation, plan lines, early amounts, totals, adjustment checks |
| domain | `domain/schemas.ts` | Zod |
| service | `fee.service.ts` | save item (+installments, discounts), activate/deactivate |
| service | `plan.service.ts` | generate plans, adjust / add / cancel installment |
| queries | `fee.queries.ts`, `plan.queries.ts` | scope, fee board, plan detail, options |
| table | `plan.table.tsx` | PLT-10 table `fin.plans` |
| cross-module | ORG: `getYear`, `listYearOptions`; STU: enrollments are read through Prisma relations | |

### UI

| Route | Who | What |
|---|---|---|
| `/fin/fees` | fee.read | schedule of the selected academic year per program; Finance adds/edits items, installments, discounts, deactivates |
| `/fin/plans` | plan.read | PLT-10 table; Finance sees the generate form (program, optional student number) |
| `/fin/plans/[id]` | plan.read | plan detail, totals; Finance adjusts, adds, cancels installments |

### Edge cases & errors

- Editing an item's amount requires re-sending installments that add up (one form saves all).
- Two Finance users saving the same key: the unique constraint gives a clear field error.
- A student with two enrollments gets a plan per enrollment and year.
- A program without a registered student for the year generates zero plans (not an error).
- Cancelling all installments leaves an empty plan (total 0).

**Implementation notes:**
- Routes `/fin/fees` (schedule of the selected year per program), `/fin/plans` (PLT-10 table `fin.plans`
  and the generate form), `/fin/plans/[id]` (detail, adjust, add, cancel).
- The domain computes money in whole cents and converts from/to decimal strings; Zod parses amounts
  with at most two decimals; the database also checks `amount > 0` and the discount/early ranges.
- Reasons for adjustments use the action wrapper's `requireReason` and are stored in the audit entry.
- Fees and plans are institution-wide (Finance, Secretariat, student affairs); lists still filter by
  `grantScopes` over programs for any future scoped grant.
- No fee data is seeded (nothing may be invented); the e2e test creates and removes its own rows.

## 4. Tasks

- [x] **T1** — `finance.prisma` + migration with checks; permissions; nav; i18n skeleton. (AC-1, AC-11, AC-12)
- [x] **T2** — Pure money/fee rules and schemas with unit tests. (AC-2, AC-3, AC-6, AC-7, AC-8)
- [x] **T3** — Fee schedule service and queries; integration tests. (AC-1..AC-5, AC-11)
- [x] **T4** — Plan service and queries; integration tests. (AC-5..AC-9, AC-11)
- [x] **T5** — Pages: fee schedule, plans table, plan detail, forms, i18n. (AC-9, AC-10)
- [x] **T6** — E2E, seed, docs. (all)

## 5. Test plan

| AC | Test type | Test |
|---|---|---|
| AC-1..AC-3 | unit + integration | validation matrix; sums; database checks; duplicate key |
| AC-4, AC-5 | integration | deactivate ignored in generation; closed year refuses |
| AC-6, AC-7 | unit + integration | plan lines, early amounts without drift; eligibility and skips; no fees refuses |
| AC-8 | integration | adjust / add / cancel with audit before/after, reason required |
| AC-9, AC-10 | integration + e2e | totals; table scope and export |
| AC-11 | integration + e2e | finance writes, secretary reads but cannot write, lecturer/student refused |
| AC-12 | unit | cents conversions, no floats |

## 6. Definition of done

- [x] All tasks ticked, all ACs covered by tests
- [x] `pnpm lint && pnpm typecheck && pnpm test` pass; E2E for user-facing flows pass
- [x] Security checklist in [conventions.md](../../02-architecture/conventions.md#security-checklist-every-feature) satisfied
- [x] i18n keys added (`en` and `sq`)
- [x] Docs updated (domain model, brief)
- [x] FEATURES.md Status → `done`; `node scripts/features.mjs --write`
