# STU-02 — Student status changes

| | |
|---|---|
| **Phase** | P2 |
| **Depends on** | STU-01 |
| **Questions** | Q-36 (non-blocking): the transitions below, reason + effective date + optional document reference, graduation without automatic checks, Secretariat and Student Affairs perform them |
| **Source** | SRC-053, SRC-054, SRC-059 |
| **Brief** | [../modules/stu.md](../modules/stu.md) |

> Spec lifecycle: write from this template → review with the user → set Status `specced` in
> FEATURES.md → build task by task → tick tasks → Status `done`.

## 1. Context

STU-01 created enrollments with a status and a history table. SRC-053/054 need the lists of students
deregistered or suspended in an academic year (STU-06 builds them from this history) and SRC-059
makes graduation the trigger of the diploma. Status changes are **events** (domain model rule 3):
each change is a history row with reason, effective date and an optional document reference, and
other modules react through hooks (IAM-02 disables accounts, FIN stops installments).

## 2. Requirements

### User stories

- As the **Secretariat**, I want to suspend, resume, deregister, transfer or graduate a student with
  a reason and a date, so that the register and its history are correct.
- As a **student**, I want to be told when my status changes.

### Acceptance criteria (EARS)

| ID | Criterion |
|---|---|
| AC-1 | THE SYSTEM SHALL allow only these changes of an enrollment: `ACTIVE` → `SUSPENDED`, `DEREGISTERED` or `GRADUATED`; `SUSPENDED` → `ACTIVE` or `DEREGISTERED`; `DEREGISTERED` and `GRADUATED` are final. |
| AC-2 | WHEN an authorized user changes an enrollment's status with a reason and an effective date, THE SYSTEM SHALL, in one transaction, set the status, write a status event (from, to, reason, effective date, optional document reference), set `endedAt` to the effective date for `DEREGISTERED` and `GRADUATED` (and clear it on resumption), and audit it. |
| AC-3 | IF the change is not allowed, the reason is empty, or the effective date is invalid, before the enrollment's start, before the previous event's effective date, or in the future by more than the same day, THEN THE SYSTEM SHALL refuse with a field error and change nothing. |
| AC-4 | WHEN an authorized user transfers a student, THE SYSTEM SHALL, in one transaction, close the current enrollment as `DEREGISTERED` with the reason (marked as a transfer) and create a new `ACTIVE` enrollment of type `TRANSFER` in the chosen program and cohort starting on the effective date, subject to the enrollment rules of STU-01 (active cohort of that program, no open enrollment there). |
| AC-5 | WHEN a status changes, THE SYSTEM SHALL call the registered status-change handlers inside the transaction, and notify the student (in-app and e-mail per their preferences) when their account is linked. |
| AC-6 | THE SYSTEM SHALL show the status history (STU-01 tab) with reason, effective date and document reference, and offer the allowed changes on the enrollments tab only to authorized users and only for enrollments that can still change. |
| AC-7 | THE SYSTEM SHALL restrict changes to `stu.student.write` for students inside the user's scope, and refuse a change on an enrollment of a student the user cannot see as if it did not exist. |

### Out of scope

Reinstatement of deregistered students, graduation preconditions (grades, fees), diploma
generation (DIP), the yearly lists (STU-06), student-initiated requests (STU-07), account
provisioning (IAM-02), financial effects (FIN).

### Assumptions

- Effective dates may be in the past (a suspension noticed later) but not after today.
- A transfer keeps the old enrollment's year registrations as they are.

## 3. Design

### Data

No new tables: `Enrollment.status`, `endedAt` and `EnrollmentStatusEvent` exist (STU-01).

### Server

| Kind | Name | Purpose |
|---|---|---|
| domain | `domain/status-rules.ts` | transition table, `allowedTransitions`, date validation |
| service | `status.service.ts` | `changeEnrollmentStatus`, `transferEnrollment` (+ audit, hooks) |
| registry | `status-hooks.ts` | `registerStatusChangeHandler` for IAM-02 / FIN; a student notification handler |

### UI

The enrollments tab of `/stu/students/[id]` gets, per enrollment, buttons for the allowed changes;
each opens a dialog with the reason, the effective date, the document reference (and, for a
transfer, the target cohort).

### Edge cases & errors

- Two users changing the same enrollment at once: the second sees the new status and is refused as "not allowed".
- A transfer into a program where the student already has an open enrollment is refused and nothing changes.

## 4. Tasks

- [x] **T1** — Transition rules with unit tests. (AC-1, AC-3)
- [x] **T2** — Services, hooks and student notification; integration tests. (AC-2..AC-5, AC-7)
- [ ] **T3** — Dialogs on the enrollments tab, history details, i18n, e2e, docs. (AC-6, all)

## 5. Test plan

| AC | Test type | Test |
|---|---|---|
| AC-1, AC-3 | unit | transition matrix; date rules |
| AC-2 | integration | each allowed change sets status, event, `endedAt`, audit; resumption clears `endedAt` |
| AC-4 | integration | transfer creates the new enrollment and closes the old; rolled back when the target is refused |
| AC-5 | integration | handlers called in the transaction (a failing handler rolls back); student notified |
| AC-6, AC-7 | e2e + integration | buttons per state; scoped user cannot change; finance has no controls |

## 6. Definition of done

- [ ] All tasks ticked, all ACs covered by tests
- [ ] `pnpm lint && pnpm typecheck && pnpm test` pass; E2E for user-facing flows pass
- [ ] Security checklist in [conventions.md](../../02-architecture/conventions.md#security-checklist-every-feature) satisfied
- [ ] i18n keys added (`en` and `sq`)
- [ ] Docs updated (domain model, brief)
- [ ] FEATURES.md Status → `done`; `node scripts/features.mjs --write`
