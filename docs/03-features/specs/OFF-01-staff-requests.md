# OFF-01 — Staff requests (leave, supplies, certificates, authorizations)

| | |
|---|---|
| **Phase** | P6 |
| **Depends on** | PLT-15, HR-01 |
| **Questions** | Q-100 (non-blocking): the four request types and their fields; Q-101 (non-blocking): approval chain by role (head of department, then administration); Q-102 (non-blocking): who submits, who handles, who reads the history; Q-103 (non-blocking): approving leave records nothing else (no balances) and no certificate is generated yet |
| **Source** | SRC-140 |
| **Brief** | [../modules/off.md](../modules/off.md) |

> Spec lifecycle: write from this template → review with the user → set Status `specced` in
> FEATURES.md → build task by task → tick tasks → Status `done`.

## 1. Context

SRC-140 asks for online forms for leave, office supplies, certificates and authorizations. PLT-15
(forms engine) stores definitions, submissions, the inbox and the workflow and notifies the
submitter on every state change; STU-07 shows how a module ships form definitions and a handler.
This feature adds, in a new OFF module, the **four staff request forms**, the **approval chain**
(supervisor, then administration; configured per form in the workflow), a **handler** that checks
a leave request when it is approved, and a **history of requests per staff member** for HR and
administration. The engine gets two small, additive capabilities that any form can use: transitions
that name the roles allowed to take them, and a list of roles allowed to fill in a form.

## 2. Requirements

### User stories

- As a **staff member** (any role except student), I want to submit a leave, supplies, employment
  certificate or authorization request online and follow its state, so that I need no paper.
- As a **supervisor** (head of department), I want to approve or reject the leave and authorization
  requests of my staff as the first step, so that administration only handles supported requests.
- As the **administration** office, I want to process approved requests (final approval, supplies,
  certificates) in the forms inbox.
- As **HR** or administration, I want to see the history of requests of one staff member.

### Acceptance criteria (EARS)

| ID | Criterion |
|---|---|
| AC-1 | THE SYSTEM SHALL provide four published authenticated form definitions, `staff-leave`, `staff-supplies`, `staff-certificate`, `staff-authorization`, whose fields follow Q-100, which all name the handler `off.request`, and which only staff roles (every role except student) can see, open and submit. |
| AC-2 | THE SYSTEM SHALL let a definition limit who may fill in an authenticated form (`submitRoles`): such a form is not listed for, not served to and not accepted from other users (answered as if it did not exist). |
| AC-3 | THE SYSTEM SHALL let a workflow transition name the roles allowed to take it (`roles`): the inbox offers only the transitions the user may take, and the server refuses any other with "transition not allowed"; the sysadmin may take any. |
| AC-4 | THE SYSTEM SHALL configure the chain per form: leave and authorization `new` → `supervisor_approved` (head of department) → `approved` (administration), with `rejected` reachable at each step by whoever holds that step, and `new` → `approved` for administration (when no supervisor applies, Q-101); supplies and certificate are handled by administration alone (`new` → `in_progress` → `approved`/`rejected`). |
| AC-5 | IF a user would take a role-restricted transition on their own request THEN THE SYSTEM SHALL refuse it (a supervisor cannot approve their own leave), the sysadmin excepted. |
| AC-6 | WHEN a leave request is moved to `approved`, THE SYSTEM SHALL refuse the change, rolling it back, if the end date is before the start date; moving it to `rejected` SHALL need no check. |
| AC-7 | WHEN the state of a request changes, THE SYSTEM SHALL notify the submitter with the form title and the new state (PLT-15, unchanged), and SHALL keep every transition, comment and assignment in the submission history and the audit log. |
| AC-8 | THE SYSTEM SHALL show a staff member their own requests of these four forms with the state and the forms they can still submit, on the page "Staff requests" (`/off/requests`). |
| AC-9 | THE SYSTEM SHALL let holders of `off.request.history` (administration, HR, sysadmin) pick a staff member and see all their requests of these forms with reference, type, state and dates (`/off/history`), and SHALL show nobody else this page (forbidden view). |
| AC-10 | THE SYSTEM SHALL keep personal data out of logs, SHALL answer inbox access to requests of forms the user does not handle as not found (PLT-15), and SHALL deny the four forms and the history to students. |

### Out of scope

Leave entitlements, balances and calendars (Q-103); generating the employment certificate as a PDF
(needs a layout from the client, PLT-09 is ready for it, Q-103); notifying the next approver when a
step is reached (the engine only notifies the submitter; approvers use the inbox); choosing the
supervisor by organizational structure or department (Q-101); staff performance evaluation (HR-06);
withdrawing a request; editing a submitted request.

### Assumptions

- Q-100..Q-103 above. The texts and fields are a first proposal that the sysadmin can edit in PLT-15
  (a change is a new draft version); the handler key stays the same.
- Staff identity is the signed-in account; the history is read by account (`submitterId`).
- Production loads the forms the same way any form is loaded (admin → forms); the dev/demo
  seeder publishes them so the flow can be tried.

## 3. Design

### Data model

No new tables. Requests are `FormSubmission` rows (domain-model: "Staff requests via FormSubmission").
Definition JSON additions (PLT-15 schema, optional, backward compatible):

```jsonc
{ "submitRoles": ["lecturer", "hr"],                       // who may fill in the form
  "workflow": { "transitions": [{ "from": "new", "to": "supervisor_approved", "roles": ["head_of_department"] }] } }
```

### Definitions (handler key `off.request`)

| Form (`ownerRoles`) | Fields | Workflow |
|---|---|---|
| `staff-leave` (head_of_department, administration) | leaveType (annual, sick, unpaid, other), startDate, endDate, reason | new → supervisor_approved (HoD) → approved (admin); new → approved (admin); rejected at each step |
| `staff-supplies` (administration) | items (textarea: item and quantity per line), neededBy (date, optional), notes | new → in_progress → approved ("Fulfilled") / rejected, all administration |
| `staff-certificate` (administration) | purpose, recipient (optional), copies (1–10), notes | new → in_progress → approved ("Issued") / rejected, all administration |
| `staff-authorization` (head_of_department, administration) | subject, description, validFrom, validTo (optional) | as leave |

### Permissions

| Permission | Granted to |
|---|---|
| `off.request.submit` | every role except student |
| `off.request.history` | sysadmin, hr, administration |

Handling uses the existing `plt.form.inbox` plus the form's `ownerRoles` and the transition roles.

### Server

| Kind | Name | Purpose |
|---|---|---|
| lib | `forms/definition.ts`, `answers.ts`, `submission.service.ts`, `queries.ts` | `submitRoles`, transition `roles`, `maySubmit`, `nextStates(def, state, roles)`, own-request guard |
| domain | `off/domain/request-forms.ts` | the four definitions (JSON constants, validated in a test) |
| domain | `off/domain/request-rules.ts` | `leaveDatesValid` (pure) |
| service | `off/server/request-handlers.ts` | `registerFormHandler("off.request")` |
| queries | `off/server/request.queries.ts` | own requests, staff picker, history of a staff member |
| seed | `prisma/seed/off-requests.ts` | publish the four forms (dev/demo) |

### UI

| Route | Who | What |
|---|---|---|
| `/off/requests` | `off.request.submit` | the forms to submit and my requests |
| `/off/history` | `off.request.history` | staff picker, requests of the chosen member |
| `/forms/staff-*` | staff | existing form pages (PLT-15) |
| `/forms/inbox` | handlers | existing inbox (PLT-15) |

Navigation (group "hr"): "Staff requests", "Request history".

### Edge cases & errors

- A head of department files a leave: the supervisor step is refused to them; administration takes `new` → `approved` directly (AC-5).
- Two users approve at once: the second is refused by the engine (final state).
- A form edited later: new draft version, submissions keep the version they used.
- History of a person without any request: empty state.

**Implementation notes:**
- The engine additions are backward compatible: a definition without `submitRoles` and without transition `roles` behaves as before. `/forms` lists only the forms the user may submit (`listAuthenticatedForms(userId)`).
- The own-request guard applies only to role-restricted transitions, so an ordinary form is unchanged.
- Dev/demo seeder `off-requests` publishes the four forms; production loads them in the forms admin (the JSON is `STAFF_FORMS` in `src/modules/off/domain/request-forms.ts`).
- e2e needs the Keycloak client to allow the port used by the run (dev note, not a code change).

## 4. Tasks

- [x] **T1** — Engine: `submitRoles`, transition `roles`, own-request guard, listing/page enforcement; unit + integration tests. (AC-2, AC-3, AC-5)
- [x] **T2** — OFF module: permissions, four definitions, leave-date rule, handler; unit tests. (AC-1, AC-4, AC-6)
- [x] **T3** — Queries and pages (`/off/requests`, `/off/history`), navigation, i18n (sq, en). (AC-8, AC-9, AC-10)
- [x] **T4** — Seeder, integration tests of the chain, notification and history. (AC-1, AC-4, AC-7, AC-9)
- [x] **T5** — E2E, docs (domain model, brief, questions). (all)

## 5. Test plan

| AC | Test type | Test |
|---|---|---|
| AC-1, AC-4 | unit | each definition passes `validateDefinition`; chain shape; handler key; every role named exists |
| AC-2 | unit + integration | `maySubmit`; `submitAuthenticated` refuses a student; listing hides forms |
| AC-3, AC-5 | unit + integration | `nextStates` per role; supervisor-only step refused to administration; own request refused |
| AC-6 | integration | approving leave with end before start refused and rolled back; valid approved |
| AC-7 | integration | the submitter is notified of the supervisor step |
| AC-9, AC-10 | integration + e2e | history query per staff member; student and lecturer get the forbidden view |
| AC-1..AC-9 | e2e | lecturer submits leave; head of department approves; administration gives final approval; lecturer sees the state; student forbidden |

## 6. Definition of done

- [x] All tasks ticked, all ACs covered by tests
- [x] `pnpm lint && pnpm typecheck && pnpm test` pass; E2E for user-facing flows pass
- [x] Security checklist in [conventions.md](../../02-architecture/conventions.md#security-checklist-every-feature) satisfied
- [x] i18n keys added (`en` and `sq`)
- [x] Docs updated (domain model, brief)
- [x] FEATURES.md Status → `done`; `node scripts/features.mjs --write`
