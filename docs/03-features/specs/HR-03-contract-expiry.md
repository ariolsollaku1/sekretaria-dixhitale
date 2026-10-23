# HR-03 — Contract expiry tracking

| | |
|---|---|
| **Phase** | P6 |
| **Depends on** | HR-01, PLT-12 |
| **Questions** | Q-38 (non-blocking): 60-day horizon, weekly notice to HR, no automatic effects |
| **Source** | SRC-061 |
| **Brief** | [../modules/hr.md](../modules/hr.md) |

> Spec lifecycle: write from this template → review with the user → set Status `specced` in
> FEATURES.md → build task by task → tick tasks → Status `done`.

## 1. Context

SRC-061: the system automatically produces the list of academic staff whose engagement has ended
according to the contract end date set when the person is hired. HR-01 stores `contractEnd` and
`active` on each staff member; PLT-12 runs timed jobs; PLT-11 delivers notifications.

## 2. Requirements

### User stories

- As **HR**, I want the list of staff whose contract has ended or is about to end, so that I can renew or close their employment.
- As **HR**, I want a weekly reminder when there is something to look at.

### Acceptance criteria (EARS)

| ID | Criterion |
|---|---|
| AC-1 | THE SYSTEM SHALL classify an employed staff member with a contract end date as `ENDED` when the date is before today and `ENDING_SOON` when it is today or within the horizon (setting `hr.contractHorizonDays`, default 60, positive whole number), and as neither when there is no end date or the member is no longer employed. |
| AC-2 | THE SYSTEM SHALL list staff in a PLT-10 table (name, kind, category, department, contract end, days left, state) limited to the user's scope, defaulting to ended and ending-soon contracts of employed staff, with filters on state, kind, category and department code, sorted by contract end. |
| AC-3 | THE SYSTEM SHALL show the list to holders of `hr.staff.read` and never national ID, birth date or address. |
| AC-4 | THE SYSTEM SHALL run a weekly job (Monday 07:00) that, when at least one contract is ended or ending soon, sends every active HR user one notification with the counts, once per week (idempotent per week), and does nothing otherwise. |
| AC-5 | THE SYSTEM SHALL change nothing about the staff member automatically: ending employment stays an audited HR action (HR-01). |

### Out of scope

Automatic deactivation of accounts (IAM-02), contracts and renewals as records (HR-02), e-mail to the staff member, notifying heads of department.

### Assumptions

- "Today" is the Europe/Tirane calendar day; the end date is the last day of the contract (ending today is "soon", not "ended").
- Only employed staff (`active`) are tracked; HR closes the employment and the member leaves the list.

## 3. Design

No new tables. `src/modules/hr/domain/contract-rules.ts` (pure classification), `server/contract.table.tsx`
(PLT-10 table `hr.contracts`), `server/contract.job.ts` (job `hr.contracts.notify`, notification type
`hr.contracts`). Route `/hr/contracts` (nav: Administration).

**Implementation notes:**
- The default view lists academic staff only (filter `kind=ALL` widens it) because SRC-061 speaks of
  academic staff; the weekly job counts academic staff only.
- Staff in `ended` with `active=true` are exactly those HR still has to close (HR-01 deactivation).
- The job runs Mondays 07:00 Europe/Tirane; the dedupe key is the ISO week (`hr.contracts:2026-W44`).

## 4. Tasks

- [x] **T1** — Pure classification with unit tests. (AC-1)
- [x] **T2** — Table, page, nav, i18n. (AC-2, AC-3)
- [x] **T3** — Weekly job and notification; integration tests. (AC-4, AC-5)
- [x] **T4** — E2E, docs. (all)

## 5. Test plan

| AC | Test type | Test |
|---|---|---|
| AC-1 | unit | table-driven: no end date, ended, today, edge of horizon, beyond, inactive |
| AC-2, AC-3 | e2e | HR sees an ended contract; finance sees the list without identifiers; lecturer refused |
| AC-4 | integration | one notification per HR user per week; none when nothing is due; second run in the same week sends nothing |
| AC-5 | integration | the job leaves staff untouched |

## 6. Definition of done

- [x] All tasks ticked, all ACs covered by tests
- [x] `pnpm lint && pnpm typecheck && pnpm test` pass; E2E for user-facing flows pass
- [x] Security checklist in [conventions.md](../../02-architecture/conventions.md#security-checklist-every-feature) satisfied
- [x] i18n keys added (`en` and `sq`)
- [x] Docs updated (brief)
- [x] FEATURES.md Status → `done`; `node scripts/features.mjs --write`
