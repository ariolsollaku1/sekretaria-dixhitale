# FIN-02 — Payments & financial status

| | |
|---|---|
| **Phase** | P3 |
| **Depends on** | FIN-01 (STU-01 through it) |
| **Questions** | Q-109 (payment record), Q-110 (early-payment discount), Q-111 (financial clearance), Q-112 (CSV import), Q-113 (student view, closed years) — all non-blocking with working assumptions. Q-02 (F5 data source) stays open and only matters for INT-02. |
| **Source** | SRC-080a, SRC-087 (also SRC-049, SRC-085 by context) |
| **Brief** | [../modules/fin.md](../modules/fin.md) |

## 1. Context

FIN-01 defines what a student owes (payment plan with installments). SRC-080a lists the payments the
college collects; SRC-087 asks that the payment list is available to Finance and the Secretariat at the
same time. FIN-02 records the payments received, derives per-student balances, answers "is this
student financially cleared on date D" (used later by EXM-03 and GRD-01) and shows students their own
installments. It works without Financa 5; a file import (CSV/XLSX) covers bank or F5 exports until
INT-02. Reminders (FIN-04), scholarships (FIN-03) and the shared debtor lists (FIN-05) are separate.

## 2. Requirements

### User stories

- As a **finance officer**, I want to record a payment (amount, date, reference, method) on a
  student's plan, so that the balance is current.
- As a **finance officer**, I want to import payments from a bank or F5 export with a preview, so that
  I do not type them one by one.
- As a **finance officer**, I want to void a wrong payment with a reason, so that nothing is deleted.
- As a **secretary or student-affairs officer**, I want to see payments, balances and who is not
  cleared, so that I can answer students and act on the same data as Finance (SRC-087).
- As a **student**, I want to see my installments, what I paid and what I still owe.
- As the **exam/graduation features**, I want a function "financial clearance of a student on a date".

### Acceptance criteria (EARS)

| ID | Criterion |
|---|---|
| AC-1 | WHEN Finance records a payment on a payment plan (amount > 0 as `Decimal(12,2)`, date not in the future, reference, method `CASH` / `BANK_TRANSFER` / `CARD` / `OTHER`, optionally the installment it is meant for), THE SYSTEM SHALL store it as `RECORDED`; IF the amount, date or installment (not of this plan, or cancelled) is invalid THEN THE SYSTEM SHALL refuse with a field error (Q-109). |
| AC-2 | THE SYSTEM SHALL never delete a payment: Finance voids it with a reason; a voided payment stays visible and does not count in any balance; both actions write an audit entry with before/after. |
| AC-3 | THE SYSTEM SHALL allocate the recorded payments of a plan to its active installments in the order of the payment dates: a payment goes first to its chosen installment, then to the oldest unpaid installments; what exceeds the plan is a credit (not carried to other plans) (Q-109). |
| AC-4 | THE SYSTEM SHALL treat an installment as settled by its early amount when payments dated on or before its early-until date cover that early amount, and otherwise require its full amount (Q-110). |
| AC-5 | THE SYSTEM SHALL show, per installment, paid, outstanding and status (`PAID`, `PARTIAL`, `UNPAID`, `OVERDUE` when outstanding after the due date), and per plan the total due, paid, outstanding, overdue amount and credit, all computed in whole cents without floating point. |
| AC-6 | THE SYSTEM SHALL answer "financial clearance of a student on date D" as cleared when no active installment of any of the student's plans, due on or before D, is outstanding, and otherwise report the amount missing; the function is exported for EXM-03 / GRD-01 (Q-111). |
| AC-7 | WHEN Finance uploads a CSV or XLSX of payments, THE SYSTEM SHALL show a preview (every row new, duplicate or invalid, with the reason and the matched student) without saving anything; WHEN Finance confirms, THE SYSTEM SHALL re-validate on the server and record all new rows in one transaction, skipping duplicates, and refuse the whole import if any row is invalid (Q-112). |
| AC-8 | THE SYSTEM SHALL match an import row to a student by student number or NIM and to the student's plan of the academic year given for the import; IF zero or several plans match, THEN the row is invalid. A row equal to an existing recorded payment (plan, date, amount, reference) is a duplicate (Q-112). |
| AC-9 | THE SYSTEM SHALL list plans in the existing PLT-10 table with added columns paid, outstanding and clearance as of today, exportable, within the reader's program scope. |
| AC-10 | THE SYSTEM SHALL show on the plan page the payments (voided ones marked) and the per-installment status; Finance sees the record and void actions. |
| AC-11 | THE SYSTEM SHALL let a student see only their own plans, installments, payments, balance and clearance (all academic years), and nothing of anybody else's (Q-113). |
| AC-12 | THE SYSTEM SHALL restrict writes to `fin.payment.write` (finance), reads to `fin.payment.read` (finance, secretary, student affairs) and the own view to `fin.payment.self` (student); every other role is refused; every mutation is audited. |
| AC-13 | THE SYSTEM SHALL allow recording and voiding payments on plans of a closed academic year (late debts), unlike plan changes (Q-113). |

### Out of scope

Reminders (FIN-04), scholarships and recalculation (FIN-03), the combined Finance/Secretariat debtor
lists beyond the plan table (FIN-05), automatic feeds (INT-02), receipts/invoices (ADM-05), refunds,
currencies other than the single one.

### Assumptions

Q-109…Q-113 in `docs/04-open-questions.md`.

## 3. Design

### Data model

```prisma
enum PaymentMethod { CASH BANK_TRANSFER CARD OTHER }
enum PaymentStatus { RECORDED VOIDED }

model Payment {                    // payments
  id, planId, amount Decimal(12,2), paidOn Date, reference String, method PaymentMethod,
  installmentId String?, status PaymentStatus, voidReason String?, voidedAt, voidedById,
  importBatch String?, createdAt, updatedAt, createdById, updatedById
  @@index([planId]) @@index([paidOn])
}
```

Database check: `amount > 0`. Allocation is **computed** from the recorded payments and the current
installments (pure function), not stored, so adjusting or cancelling an installment never leaves stale
allocations.

### Permissions

| Permission | Granted to |
|---|---|
| `fin.payment.read` | finance, secretary, student_affairs |
| `fin.payment.write` | finance |
| `fin.payment.self` | student |

### Server

| Kind | Name | Purpose |
|---|---|---|
| domain | `domain/payment-rules.ts` | allocation, installment status, plan balance, clearance (cents) |
| domain | `domain/payment-import.ts` | CSV row mapping and validation |
| domain | `domain/schemas.ts` | Zod for record / void |
| service | `payment.service.ts` | record, void |
| service | `payment-import.service.ts` | preview, commit |
| queries | `payment.queries.ts` | plan balances, clearance (`getFinancialClearance`), own view |
| table | `plan.table.tsx` | extended with balance columns |

### UI

| Route | Who | What |
|---|---|---|
| `/fin/plans/[id]` | plan.read | extended: paid/outstanding per installment, payments list, record/void |
| `/fin/payments/import` | payment.write | upload, preview, confirm; template download |
| `/fin/mine` | payment.self | my installments, payments, balance |

### Edge cases & errors

- Payment dated in the future: refused (`future`).
- Early payment recorded after the early window: allocated against the full amount.
- Voiding a payment changes the allocation of later payments (computed again).
- A student with two plans in a year (two enrollments): the import row is ambiguous and invalid.

**Implementation notes:**
- Allocation is a pure function over the recorded payments and the active installments; payments are
  processed in payment-date order (then recording order). Early settlement: payments dated up to
  `earlyUntil` that reach `earlyAmount` settle the installment; the rest is waived (Q-110).
- `getFinancialClearance` / `getFinancialClearances` (exported from `@/modules/fin`) do no scope
  filtering: the calling feature checks its own permission.
- Plans table gets paid / outstanding / clearance columns, blank for readers without `fin.payment.read`.
  No filter by clearance (needs a computed column across all rows; FIN-05 builds the shared lists).
- Import: `/fin/payments/import` for the selected academic year; the file is re-sent on confirm and
  re-validated. In-file repeats of the same payment are errors (`duplicateInFile`): give them
  different references.
- No payments are seeded (nothing may be invented); the e2e test creates a plan for the demo student
  and removes it again.

## 4. Tasks

- [x] **T1** — Schema + migration, permissions, nav, i18n skeleton. (AC-1, AC-12)
- [x] **T2** — Pure payment rules and import mapping with unit tests. (AC-3..AC-6, AC-8)
- [x] **T3** — Payment service, queries, clearance function; integration tests. (AC-1..AC-6, AC-11..AC-13)
- [x] **T4** — Import service, actions, template route; integration tests. (AC-7, AC-8)
- [x] **T5** — Pages: plan detail extension, import, student view, plan table. (AC-9..AC-11)
- [x] **T6** — E2E, seed, docs. (all)

## 5. Test plan

| AC | Test type | Test |
|---|---|---|
| AC-3..AC-6 | unit | allocation order, targeting, credit, early window, status, clearance by date |
| AC-1, AC-2 | integration | record/void, validation, audit |
| AC-6, AC-13 | integration | clearance across plans; closed year allows payments |
| AC-7, AC-8 | unit + integration | preview, duplicates, ambiguity, all-or-nothing |
| AC-9..AC-12 | integration + e2e | scope, student own-only, secretary read-only, lecturer refused |

## 6. Definition of done

- [x] All tasks ticked, all ACs covered by tests
- [x] `pnpm lint && pnpm typecheck && pnpm test` pass; E2E for user-facing flows pass
- [x] Security checklist in [conventions.md](../../02-architecture/conventions.md#security-checklist-every-feature) satisfied
- [x] i18n keys added (`en` and `sq`)
- [x] Docs updated (domain model, brief)
- [x] FEATURES.md Status → `done`; `node scripts/features.mjs --write`
