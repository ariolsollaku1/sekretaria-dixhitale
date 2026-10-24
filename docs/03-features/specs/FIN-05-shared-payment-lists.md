# FIN-05 — Shared Finance & Secretariat lists

| | |
|---|---|
| **Phase** | P3 |
| **Depends on** | FIN-02 (FIN-01 through it) |
| **Questions** | Q-143 (deadline list, session clearance, debtors) — non-blocking, working assumptions. Q-111 (clearance rule) applies. |
| **Source** | SRC-049, SRC-085, SRC-087 |
| **Brief** | [../modules/fin.md](../modules/fin.md) |

## 1. Context

FIN-02 already computes balances and "financially cleared on date D". The college asks for the lists
built on that: students grouped by payment deadlines (SRC-085), students who have / have not closed
their obligations before an exam session (SRC-049), and, in the same spirit, a debtors list with
contact data that NTF-03 can message. Finance and the Secretariat open the same lists at the same
time (SRC-087). No new data is stored: the lists are read-only views over plans, installments and
payments, so no schema change.

## 2. Requirements

### User stories

- As a **finance officer or secretary**, I want the installments of the year ordered by due date with
  what is paid and outstanding, so that I see who has to pay what, when.
- As a **secretary**, I want to list the students cleared / not cleared before the winter, summer or
  autumn session, so that I can prepare the exam lists.
- As a **finance officer**, I want the debtors with their contact data and amount owed, so that I can
  call or message them.

### Acceptance criteria (EARS)

| ID | Criterion |
|---|---|
| AC-1 | THE SYSTEM SHALL provide a deadline list of the selected academic year with one row per active installment: due date, student number, name, program, kind and label, amount, paid, outstanding, status (`PAID`, `PARTIAL`, `UNPAID`, `OVERDUE`), ordered by due date by default, filterable by due-date range, status, program, student number and name (SRC-085, Q-143). |
| AC-2 | THE SYSTEM SHALL provide a clearance list of the students with a payment plan in the selected academic year with: student number, name, program, e-mail, phone, the date the clearance refers to, amount owed and result `CLEARED` / `NOT_CLEARED`, filterable by result, session, as-of date, program, student number and name (SRC-049a/b). |
| AC-3 | WHEN a session type (winter, summer, autumn, mini) is chosen and the selected year has that session, THE SYSTEM SHALL evaluate clearance on the day before the session's first day; IF the year has no such session THEN THE SYSTEM SHALL show an empty list with a hint; WHEN no session is chosen THE SYSTEM SHALL use the as-of date, default today (Tirane) (Q-143). |
| AC-4 | THE SYSTEM SHALL compute clearance with the FIN-02 rule (`getFinancialClearances`: no active installment of any plan of the student, of any year, due on or before the date is outstanding) and amounts without floating point. |
| AC-5 | THE SYSTEM SHALL offer the debtors list as the clearance list filtered to `NOT_CLEARED`, sorted by amount owed, as its own link. |
| AC-6 | THE SYSTEM SHALL allow exporting both lists with the user's filters (PLT-10) and "Message these people" (NTF-03) from both, to exactly the listed students. |
| AC-7 | THE SYSTEM SHALL let `fin.payment.read` holders (finance, secretary, student affairs) read both lists with the same data at the same time (SRC-087), restricted to their program scope; every other role, including students and lecturers, is refused. |
| AC-8 | THE SYSTEM SHALL write nothing: the lists are read-only and need no audit entry. |

### Out of scope

Reminders (FIN-04), payment recording (FIN-02), combined report builder (RPT-01), receipts.

### Assumptions

Q-143 in `docs/04-open-questions.md`.

## 3. Design

### Data model

None (no migration). Reads `PaymentPlan`, `PlanInstallment`, `Payment`, `ExamSession` (through
`@/modules/cal`), `Person`.

### Permissions

No new permission: `fin.payment.read` (finance, secretary, student_affairs), program-scoped.

### Server

| Kind | Name | Purpose |
|---|---|---|
| domain | `domain/list-rules.ts` | clearance date of a session, day arithmetic, filter/sort/page of computed rows |
| table | `list.table.tsx` | `fin.lists.deadlines`, `fin.lists.clearance` (PLT-10 tables, recipient = person) |

Computed columns (status, outstanding, result) cannot be filtered in SQL, so the fetch loads the plans
that match the SQL-able filters inside the scope, computes, then filters, sorts and pages in memory.

### UI

| Route | Who | What |
|---|---|---|
| `/fin/lists/deadlines` | payment.read | deadline list |
| `/fin/lists/clearance` | payment.read | clearance list (`?result=NOT_CLEARED` = debtors) |

### Edge cases & errors

- Session type absent in the year: empty list plus hint.
- Student with several plans: one row per student in the clearance list; owed sums all plans.
- Cancelled installments and voided payments never count (same as FIN-02).

## 4. Tasks

- [x] **T1** — Pure list rules with unit tests. (AC-3, AC-4)
- [x] **T2** — Tables, pages, nav, i18n. (AC-1, AC-2, AC-5, AC-6)
- [x] **T3** — Integration tests (scope, clearance by session, permissions). (AC-1..AC-4, AC-7)
- [x] **T4** — E2E, docs. (all)

## 5. Test plan

| AC | Test type | Test |
|---|---|---|
| AC-3, AC-4 | unit | day before session, paging/sorting helpers |
| AC-1..AC-4 | integration | deadline rows and statuses, session clearance, as-of, no-session |
| AC-7 | integration + e2e | program scope, secretary reads, lecturer refused |
| AC-1, AC-2, AC-5 | e2e | Finance opens both lists, debtors link |

## 6. Definition of done

- [x] All tasks ticked, all ACs covered by tests
- [x] `pnpm lint && pnpm typecheck && pnpm test` pass; E2E for user-facing flows pass
- [x] Security checklist in [conventions.md](../../02-architecture/conventions.md#security-checklist-every-feature) satisfied
- [x] i18n keys added (`en` and `sq`)
- [x] Docs updated (domain model, brief)
- [x] FEATURES.md Status → `done`; `node scripts/features.mjs --write`
