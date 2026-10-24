# FIN-04 — Payment reminders

| | |
|---|---|
| **Phase** | P3 |
| **Depends on** | FIN-02, PLT-11 |
| **Questions** | Q-144 (non-blocking): 14 days before, once per installment, student's own account by email + in-app, active enrollments only, overdue notice off by default, no-account students logged; builds on Q-20 (email + in-app, no SMS) |
| **Source** | SRC-086 |
| **Brief** | [../modules/fin.md](../modules/fin.md) |

> Spec lifecycle: write from this template → review with the user → set Status `specced` in
> FEATURES.md → build task by task → tick tasks → Status `done`.

## 1. Context

SRC-086: the system generates automatic messages to students about the deadline of the next payment,
two weeks before each installment. FIN-01 gives every enrollment a payment plan with dated
installments, FIN-02 computes what is still outstanding on each installment, PLT-12 runs timed jobs
and PLT-11 delivers in-app notifications and e-mail (Q-20: no SMS). FIN-04 adds the daily job, the
two notification types and the log of the reminders that Finance and the Secretariat can read.

## 2. Requirements

### User stories

- As a **student**, I want a message two weeks before each installment is due, so that I pay on time.
- As a **finance officer or secretary**, I want to see which reminders were sent and to whom, so that I
  can answer a student who says he was not warned.
- As **Finance**, I want to switch on a notice for installments that stay unpaid after the due date.

### Acceptance criteria (EARS)

| ID | Criterion |
|---|---|
| AC-1 | WHEN the daily job runs (07:00 Europe/Tirane), THE SYSTEM SHALL send an "upcoming" reminder for every active installment of an `ACTIVE` enrollment that falls due today or within the window (setting `fin.reminderDaysBefore`, whole number 1-90, default 14) and still has an outstanding amount as FIN-02 computes it; installments of other enrollment states, cancelled installments, settled installments and installments outside the window SHALL get none (Q-144, SRC-086). |
| AC-2 | THE SYSTEM SHALL send at most one reminder of each kind per installment: a second run (same day or later), a retry or a concurrent run SHALL send nothing for an installment that already has a `SENT` log row, enforced by the notification dedupe key and by a partial unique index on the log. |
| AC-3 | WHERE the setting `fin.reminderOverdueAfterDays` (whole number 1-365) is set, THE SYSTEM SHALL send one "overdue" notice for each installment that is overdue by at least that many days and still outstanding; WHILE the setting is absent or invalid, THE SYSTEM SHALL send no overdue notice (Q-144). |
| AC-4 | THE SYSTEM SHALL deliver each reminder to the active user account of the student's person, as an in-app notification and an e-mail that the student cannot switch off, linking to `/fin/mine`, with the installment number, the due date and the outstanding amount, in the user's language; the texts SHALL NOT mention discounts, and amounts SHALL be exact decimals (never floating point). |
| AC-5 | IF the student has no active account, THEN THE SYSTEM SHALL record one `NO_ACCOUNT` log row for that installment and kind (not one per run) and try again on later runs, sending the reminder (and recording `SENT`) once an account exists. |
| AC-6 | THE SYSTEM SHALL list the reminders in a PLT-10 table (date, student number, name, program, installment, due date, outstanding, kind, result) newest first, with filters on student number, program, kind and result, exportable, limited to the programs in the reader's `fin.payment.read` scope, and without contact data. |
| AC-7 | THE SYSTEM SHALL show the log to holders of `fin.payment.read` (finance, secretary, student affairs) and refuse everyone else, including students and lecturers. |
| AC-8 | THE SYSTEM SHALL change no plan, installment or payment when the job runs; the reminder log and the notification are its only records. |

### Out of scope

SMS (Q-20), a second or repeated reminder, reminders to staff or guardians, editing the texts in the
UI, a settings screen for the two settings (they are `system_settings` rows, like `hr.contractHorizonDays`),
sending a reminder by hand, the debtor lists (FIN-05), receipts (ADM-05).

### Assumptions

Q-144 in `docs/04-open-questions.md`. In short: 14 days, once per installment, outstanding amount in
the text, only `ACTIVE` enrollments, overdue notice off by default, "today" is the Europe/Tirane day.
The job is system work with no acting user, so it writes no audit entries: the `payment_reminders`
log and the notification are the record (like HR-03's weekly job).

## 3. Design

### Data model

```prisma
enum ReminderKind    { UPCOMING OVERDUE }
enum ReminderOutcome { SENT NO_ACCOUNT }

model PaymentReminder {            // payment_reminders
  id, installmentId, studentId, kind, outcome, userId?, dueDate Date,
  outstanding Decimal(12,2), createdAt
  @@index([installmentId, kind]) @@index([studentId]) @@index([createdAt])
}
```

Migration `20261024140000_fin_payment_reminders` also creates the partial unique index
`payment_reminders_sent_once (installment_id, kind) WHERE outcome = 'SENT'`. `dueDate` and
`outstanding` are snapshots taken when the reminder was sent. Rows are never deleted or edited.

### Permissions

No new permission: reading uses `fin.payment.read` (finance, secretary, student_affairs), scoped by
program as the rest of FIN. The job needs none.

### Server

| Kind | Name | Purpose |
|---|---|---|
| domain | `domain/reminder-rules.ts` | `reminderFor` (which reminder an installment calls for), settings resolvers, day arithmetic |
| job | `server/reminder.job.ts` | `fin.reminders.send` (cron `0 7 * * *`), `sendPaymentReminders`, notification types `fin.payment-due` and `fin.payment-overdue` (mandatory e-mail) |
| table | `server/reminder.table.tsx` | `fin.reminders` |

### UI

| Route | Who | What |
|---|---|---|
| `/fin/reminders` | payment.read | the log, with a line stating the current settings (nav: Finance) |

### Edge cases & errors

- An installment created or reached late (already inside the window) is reminded once on the next run.
- A payment after the reminder does not recall it; a partly paid installment shows what is still owed.
- Switching the overdue notice on reminds every older unpaid installment once.
- One failing student does not stop the others: each reminder runs in its own transaction.

**Implementation notes:**
- The outstanding amount comes from FIN-02's `planBalance` over the whole plan (payments are allocated
  oldest installment first), so the job loads every plan that has an installment in range.
- The e-mail goes through the PLT-11 outbox in the same transaction as the notification and the log row.

## 4. Tasks

- [x] **T1** — Schema + migration (log table, partial unique index), notification types, nav, i18n. (AC-2, AC-4)
- [x] **T2** — Pure reminder rules with unit tests. (AC-1, AC-3)
- [x] **T3** — Daily job; integration tests. (AC-1..AC-5, AC-8)
- [x] **T4** — Log table and page; integration tests for scope. (AC-6, AC-7)
- [x] **T5** — E2E, docs. (all)

## 5. Test plan

| AC | Test type | Test |
|---|---|---|
| AC-1, AC-3 | unit | window edges (14 / 15 days, today), settled, overdue off / on, settings fall back |
| AC-1, AC-2, AC-4, AC-8 | integration | reminds once with the outstanding amount; repeat runs send nothing; other enrollment states and settled installments skipped; plan data unchanged; DB guard on a second SENT row |
| AC-3 | integration | overdue off by default, one notice per installment once on |
| AC-5 | integration | one NO_ACCOUNT row, sent after an account appears; inactive account |
| AC-6, AC-7 | integration + e2e | scope by program, filters, `can`; Finance and secretary read, student and lecturer refused |

## 6. Definition of done

- [x] All tasks ticked, all ACs covered by tests
- [x] `pnpm lint && pnpm typecheck && pnpm test` pass; E2E for user-facing flows pass
- [x] Security checklist in [conventions.md](../../02-architecture/conventions.md#security-checklist-every-feature) satisfied
- [x] i18n keys added (`en` and `sq`)
- [x] Docs updated (domain model, brief)
- [x] FEATURES.md Status → `done`; `node scripts/features.mjs --write`
