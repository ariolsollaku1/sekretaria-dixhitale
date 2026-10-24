# IAM-02 — Account provisioning lifecycle

| | |
|---|---|
| **Phase** | P2 |
| **Depends on** | IAM-01, STU-02, HR-01 |
| **Questions** | Q-19 (answered), Q-127…Q-130 (all non-blocking working assumptions): accounts are created by a person on request, access follows open enrollments and active employment, staff roles are chosen by HR, no automatic reminders |
| **Source** | SRC-037 |
| **Brief** | [../modules/iam.md](../modules/iam.md) |

> Spec lifecycle: write → review → `specced` → build → tick tasks → `done`.

## 1. Context

SRC-037: alumni lose access to the system after graduating (they use public forms). Q-19 adds
that candidates have no account and that the login is the e-mail. IAM-01 gives the sysadmin screens
to create any user. IAM-02 makes the account follow the person: the secretariat creates a student
account from the student page (or for a whole cohort), HR creates a staff account from the staff
page, the account is switched off when the last reason for access ends and back on when it returns,
and a report shows accounts that were never activated. It reuses the IAM-01 service
(`createUser`, `deactivateUser`, `reactivateUser`) and the Keycloak admin client, and hooks into the
STU-02 status handlers and the HR-01 active flag.

## 2. Requirements

### User stories

- As a **secretary or student-affairs officer**, I want to create a student's account from the
  student page and send activation e-mails to a whole cohort, so that students can sign in without
  the system administrator.
- As an **HR officer**, I want to create a staff member's account with a role from the staff page.
- As **the institution**, I want accounts of graduated, deregistered and departed people switched
  off at once and back on when they return, so that alumni and former staff have no access (SRC-037).
- As a **secretary, student-affairs officer or HR officer**, I want a list of accounts that were
  never activated, so that I can remind people.

### Acceptance criteria

| ID | Criterion |
|---|---|
| AC-1 | WHEN a user with `iam.account.student` creates an account for a student they can see, THE SYSTEM SHALL create the login (e-mail of the person record) with role `student` scope `SELF`, link it to the person (`User.personId`), send the activation e-mail after commit and audit it (Q-127). |
| AC-2 | IF the student has no e-mail, or no open enrollment (active or suspended), or already has an account, THEN THE SYSTEM SHALL refuse with a specific error and create nothing in the app or in the identity provider. |
| AC-3 | IF a login with that e-mail already exists and belongs to no person, THEN THE SYSTEM SHALL adopt it (link the person, add the role if missing) instead of creating a second one; IF it belongs to another person, THEN THE SYSTEM SHALL refuse. |
| AC-4 | WHEN a user with `iam.account.staff` creates an account for an active staff member in their scope with a chosen role, THE SYSTEM SHALL do the same as AC-1 with that role; only roles whose default scope is institution or own records, except `sysadmin` and `student`, are accepted (Q-129). The same refusals as AC-2 and AC-3 apply (an active staff record replaces the open enrollment). |
| AC-5 | WHEN the last open enrollment of a person ends (graduated, deregistered) and the person has no active staff record, THE SYSTEM SHALL deactivate their account, end its sessions and disable the identity-provider user, within the same transaction as the status change (Q-128). A transfer, or another open enrollment, keeps the account. |
| AC-6 | WHEN HR ends a staff member's employment and the person has no open enrollment, THE SYSTEM SHALL deactivate the account the same way. |
| AC-7 | WHEN a person gets a new open enrollment, or HR resumes employment, and their account is inactive because the system switched it off, THE SYSTEM SHALL reactivate it; an account deactivated by a system administrator SHALL stay off (Q-128). |
| AC-8 | THE SYSTEM SHALL skip an automatic deactivation that IAM-01 forbids (the acting user, the last system administrator), leave the account as it is and audit the skip with the reason; the status change itself still succeeds. |
| AC-9 | WHILE a person has no account, THE student and staff pages SHALL show "No account" with the create action for permitted users; WHILE the account is not yet activated they SHALL show "Pending activation" with "Resend activation e-mail"; otherwise "Active" or "Disabled". |
| AC-10 | WHEN a user with `iam.account.student` picks a cohort and confirms, THE SYSTEM SHALL, for each student with an open enrollment in it, create the missing account (students with an e-mail), re-send the activation to accounts that were never activated, skip the rest, and report the counts created, reminded and skipped with the skip reasons (Q-130). |
| AC-11 | WHEN a user with `iam.account.read` opens `/admin/accounts`, THE SYSTEM SHALL list active accounts linked to a person that never signed in (name, e-mail, kind, created, days waiting) as a PLT-10 table with filter by kind and export; students are listed only to holders of `iam.account.student`, staff only to holders of `iam.account.staff`. |
| AC-12 | THE SYSTEM SHALL restrict every action to its permission and scope, audit every change (ids only, no personal data beyond what IAM-01 already audits) and write all text through next-intl (`sq` complete). |

### Out of scope

Candidate accounts (none, Q-19); student e-mails issued by the college (Q-19 open part); automatic
account creation at registration (Q-127: one call away); department- or program-scoped staff roles
(assigned in IAM-01); automatic reminders and SMS.

## 3. Design

### Server

| Kind | Name | Purpose |
|---|---|---|
| domain | `iam/domain/account-rules.ts` | `shouldHaveAccess({ openEnrollments, activeStaff })`, `accountState(...)`, `STAFF_ACCOUNT_ROLES` (derived from `ALLOWED_SCOPES`), `defaultStaffRole(kind)`, bulk-result helpers — pure |
| service | `iam/server/account.service.ts` | `provisionStudentAccount`, `provisionStaffAccount` (both through `createUser` / adopt), `syncAccountAccess` (AC-5..AC-8), `provisionCohort` (AC-10) |
| hooks | `iam/server/account-hooks.ts` | registers the sync on STU-02 status changes, new enrollments (new `registerEnrollmentOpenedHandler` in stu) and HR staff active changes (new `registerStaffActiveHandler` in hr) |
| query | `iam/server/account.queries.ts` | `getAccountPanel(personId, kind)`, never-activated table |
| actions | `iam/server/account.actions.ts` | `provisionStudentAccountAction`, `provisionStaffAccountAction`, `resendAccountActivationAction`, `provisionCohortAction` |
| permissions | `iam.account.student`, `iam.account.staff`, `iam.account.read` | sysadmin all; secretary and student affairs: student + read; HR: staff + read |

`IdentityProviderAdmin` is unchanged. `deactivateUser` / `reactivateUser` gain an optional audit
action name so automatic changes are distinguishable (`iam.account.auto_deactivate` /
`iam.account.auto_reactivate`); the automatic reactivation looks at the latest deactivation audit
entry of the user (AC-7).

### UI

| Route / place | What |
|---|---|
| `/stu/students/[id]` (personal tab) | account panel (AC-9, AC-1) |
| `/hr/staff/[id]` | account panel with role select (AC-4, AC-9) |
| `/admin/accounts` | never-activated table (AC-11) + cohort action (AC-10) |

Nav entry "Accounts" in group "System" with `iam.account.read`.

### Edge cases & errors

- Identity provider down: the action fails with "Identity service unavailable"; nothing half-created
  (IAM-01 compensation). In the cohort action an unavailable provider aborts the whole run (nothing
  committed); only pre-validated skips are tolerated.
- A login adopted in AC-3 gets no activation e-mail (it may already have credentials); the panel
  offers the resend action if it never signed in.
- A person who is a student and staff keeps access until both end.

## 4. Tasks

- [x] **T1** — Domain rules and unit tests. (AC-4, AC-5, AC-9)
- [x] **T2** — Hooks in stu (enrollment opened) and hr (staff active), permissions, `deactivateUser`/`reactivateUser` audit names. (AC-5..AC-8, AC-12)
- [x] **T3** — Account service: provision student/staff, adopt, sync, cohort, with integration tests against the fake provider. (AC-1..AC-8, AC-10)
- [x] **T4** — Actions, panel queries, never-activated table. (AC-9, AC-11, AC-12)
- [x] **T5** — UI: panels on student and staff pages, `/admin/accounts`, nav. (AC-9..AC-11)
- [x] **T6** — i18n (`iam.accounts.*`, sq and en), dev seed, domain-model and docs, Playwright. (AC-12)

## 5. Test plan

| AC | Type | Test |
|---|---|---|
| AC-4, AC-5, AC-9 | unit | `shouldHaveAccess`, `accountState`, staff role list |
| AC-1..AC-3 | integration (fake IdP) | create, refusals, adopt, IdP user deleted when the database part fails |
| AC-4 | integration | staff account with role, forbidden role refused |
| AC-5..AC-8 | integration | graduate disables, transfer keeps, staff+student, manual deactivation stays off, last-sysadmin skip |
| AC-10 | integration | cohort run counts |
| AC-11, AC-12 | integration | table scope per permission; action forbidden without permission |
| AC-1, AC-5, AC-9 | e2e | secretary creates a student account from the page (Mailpit mail); graduating the student disables it; a lecturer gets "no permission" on `/admin/accounts` |

## 6. Definition of done

- [x] All tasks ticked, ACs covered
- [x] auth.md provisioning table and domain-model.md accurate
- [x] FEATURES.md Status → `done`; `node scripts/features.mjs --write`
