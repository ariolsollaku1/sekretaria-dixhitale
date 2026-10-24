# ADM-01 — Interest form & leads

| | |
|---|---|
| **Phase** | P2 |
| **Depends on** | PLT-15, ORG-03 |
| **Questions** | Q-135 (non-blocking): fields and consent of the interest form; Q-136 (non-blocking): lead statuses and who works them; Q-137 (non-blocking): CSV import format and duplicates; Q-138 (non-blocking): invitation e-mail; Q-139 (non-blocking): retention of leads |
| **Source** | SRC-030, SRC-031 |
| **Brief** | [../modules/adm.md](../modules/adm.md) |

> Spec lifecycle: write from this template → review with the user → set Status `specced` in
> FEATURES.md → build task by task → tick tasks → Status `done`.

## 1. Context

SRC-030 asks that prospective students fill in their data on the LOGOS website (an *interest
form*) and that data collected at marketing campaigns and events flow into the system, to be used
by the Student Affairs Office and the Secretariat; SRC-031 names the interest form with the
Secretariat, Student Affairs and Finance as its audience. PLT-15 already serves public forms
(`/f/<key>`, honeypot, rate limit) and lets a module register a handler. This feature adds, in the
new ADM module, the **`Lead`** (a prospect before any application), the published public
**`interest` form** that creates one, manual and CSV entry for event leads, the leads list with
status, notes and assignment, and the **invitation e-mail** that moves a lead towards an
application (the application itself is ADM-02).

## 2. Requirements

### User stories

- As a **prospective student**, I want to leave my contact data and the program I am interested in
  on the website without an account, so that the college contacts me.
- As **Student Affairs / Secretariat**, I want every prospect (website, campaign, event) in one
  list with a status, notes and an owner, so that nobody is forgotten or contacted twice.
- As **Student Affairs**, I want to enter an event's leads from a spreadsheet in one go.
- As **Finance**, I want to read the leads list, so that I can see the expected intake.
- As **Student Affairs**, I want to send an invitation to apply to a lead who agreed to be
  contacted, and see that it was sent.

### Acceptance criteria (EARS)

| ID | Criterion |
|---|---|
| AC-1 | THE SYSTEM SHALL provide a published public form `interest` (PLT-15, handled by the Secretariat and Student Affairs) with first name, last name, e-mail, phone, program of interest, a free message and a required consent checkbox, with the workflow `new` → `processed`. |
| AC-2 | WHEN a visitor submits the `interest` form, THE SYSTEM SHALL, in the transaction of the submission, create a `Lead` with source `WEBSITE`, status `NEW`, the answers, consent recorded with its time, and a link to the submission; IF the program text equals the code or the name of exactly one active program THEN the lead SHALL be linked to that program. |
| AC-3 | WHEN a user with `adm.lead.write` enters a lead manually, THE SYSTEM SHALL validate it (first and last name, at least an e-mail or a phone, a valid e-mail, source `WEBSITE`/`CAMPAIGN`/`EVENT`/`OTHER`, optional source note such as the event name, optional program from the active programs, consent yes/no) and create it as `NEW`, audited. |
| AC-4 | WHEN a user with `adm.lead.write` imports a CSV file with a chosen source and source note, THE SYSTEM SHALL validate every row first and import either all valid rows or, IF any row is invalid, none, listing the line numbers and reasons; rows whose e-mail already exists (in the system or earlier in the file) SHALL be skipped and counted; a file is limited to 1 MB and 1000 rows. |
| AC-5 | THE SYSTEM SHALL list leads in a PLT-10 table with filters on name, e-mail, status, source and program code, sorted by newest first, exportable, to users with `adm.lead.read` (sysadmin, Secretariat, Student Affairs, Finance), and a detail page with the data, the notes and the history. |
| AC-6 | WHEN a user with `adm.lead.write` changes a lead's status along an allowed transition (`NEW`→`CONTACTED`/`APPLIED`/`LOST`, `CONTACTED`→`APPLIED`/`LOST`, `LOST`→`NEW`), THE SYSTEM SHALL store it with an event and audit it; `LOST` SHALL need a reason; IF the transition is not allowed THEN THE SYSTEM SHALL refuse. |
| AC-7 | WHEN a user with `adm.lead.write` edits a lead's contact data, program or source, assigns the lead to an active user who holds `adm.lead.write`, or adds a note, THE SYSTEM SHALL save it and audit it (notes are append-only and keep author and time). |
| AC-8 | WHEN a user with `adm.lead.write` sends the invitation to a lead, THE SYSTEM SHALL queue an e-mail to the lead's address (outbox + job of PLT-11), record the time and author, move a `NEW` lead to `CONTACTED`, and audit it; IF the lead has no e-mail, did not consent, or is `LOST` or `APPLIED` THEN THE SYSTEM SHALL refuse. |
| AC-9 | THE SYSTEM SHALL never hard-delete a lead, keep personal data out of logs and out of audit values (contact fields are masked in audit entries), and refuse every write to users without `adm.lead.write` (the UI is not the boundary). |
| AC-10 | THE SYSTEM SHALL show a lead page or action to nobody without `adm.lead.read`/`adm.lead.write` (students, lecturers…), answering with the "no permission" view. |

### Out of scope

The application and its documents (ADM-02), review and ranking (ADM-03), converting a lead into a
student (ADM-04), the link to the application in the invitation (added by ADM-02), campaigns and
bulk e-mail to leads (NTF-03 and ADM-06), automatic de-duplication of website submissions,
erasure on request and automatic retention (Q-139), embedding the form on the website (INT-06),
statistics of sources.

### Assumptions

- Q-135..Q-139 in `docs/04-open-questions.md`; the proposals are working assumptions the client has
  not confirmed.
- Leads are institution-wide (a prospect has no program yet, only an interest); access is by
  permission, not by program scope.
- The interest form is a normal PLT-15 definition: the sysadmin may publish a new version (labels,
  options); the handler key `adm.interest` and the field keys used below must stay.

## 3. Design

### Data model

```prisma
// prisma/schema/admissions.prisma
enum LeadStatus { NEW CONTACTED APPLIED LOST }
enum LeadSource { WEBSITE CAMPAIGN EVENT OTHER }
enum LeadEventKind { CREATED STATUS EDITED ASSIGNED INVITED NOTE }

model Lead {
  id, firstName, lastName, email?, phone?, programId?, programNote?, message?,
  source, sourceNote?, consent Boolean, consentAt?, status, lostReason?,
  assigneeId?, submissionId? @unique, invitedAt?, invitedById?,
  createdAt, updatedAt, createdById?, updatedById?
  events LeadEvent[]
}
model LeadEvent { id, leadId, kind, fromStatus?, toStatus?, body?, actorId?, createdAt }
```

Update [domain-model.md](../../02-architecture/domain-model.md) (`Lead`, `LeadEvent`).

### Permissions

| Permission | Granted to |
|---|---|
| `adm.lead.read` | sysadmin, secretary, student_affairs, finance |
| `adm.lead.write` | secretary, student_affairs |

### Server

| Kind | Name | Purpose |
|---|---|---|
| platform | `FormHandler.onSubmitted?` | optional hook run in the submission transaction (new; `onApproved` becomes optional) |
| domain | `domain/lead-rules.ts` | status transitions, e-mail check, program matching, CSV parsing and row validation (pure) |
| domain | `domain/interest-form.ts` | the `interest` definition (JSON constant, validated by the PLT-15 schema in a test) |
| service | `server/lead.service.ts` | create, update, change status, assign, add note, import, invite (+ audit) |
| handler | `server/interest-handler.ts` | `registerFormHandler("adm.interest", { onSubmitted })` |
| actions | `server/lead.actions.ts` | wrapper actions |
| queries | `server/lead.queries.ts` | detail, options |
| table | `server/lead.table.tsx` | PLT-10 table `adm.leads` |
| seed | `prisma/seed/adm-leads.ts` | publishes `interest` and a few sample leads (dev/demo) |

### UI

| Route | Who | What |
|---|---|---|
| `/f/interest` | anyone | public form (PLT-15) |
| `/adm/leads` | `adm.lead.read` | table; for writers also "Add lead" and "Import CSV" |
| `/adm/leads/[id]` | `adm.lead.read` | data and edit, status change, assignment, invitation, notes and history |

### Jobs, events, integrations

Invitation: an `EmailOutbox` row (no user) plus the `plt.mail.send` job, as PLT-11 does for users.

### Edge cases & errors

- The same person submits twice: two leads (no silent merge); the list can be filtered by e-mail.
- A website lead without a matching program keeps the typed text in `programNote`; staff pick the
  program on the detail page.
- Invitation sent twice: allowed (a new event each time); the page shows the last time.
- CSV with a BOM, `;` or `,` separators, quoted values: handled; unknown columns ignored; missing
  required columns refuse the whole file.

**Implementation notes:**
- Platform change: `FormHandler.onSubmitted(ctx, submission)` (optional, runs in the submission
  transaction, public and signed-in) and `onApproved` is now optional (PLT-15 `handlers.ts`,
  `submission.service.ts`). The interest form has no approving state, so the lead is created at
  submission time; `src/lib/forms/all.ts` loads the ADM module so the public action finds the handler.
- Audit entries carry ids, statuses and field *names* only; no contact value is ever audited.
- The invitation is an `EmailOutbox` row without a user plus the `plt.mail.send` job, rendered from
  `adm.invite.*` (Albanian) with `renderMessage`; there is no link until ADM-02 (Q-138).
- The `interest` form is published by the dev/demo seeder (`prisma/seed/adm-leads.ts`, with three
  sample leads); production loads `INTEREST_FORM` (exported by the module) through the forms admin.
- Database checks: a lead has an e-mail or a phone; `consent` ⇔ `consent_at`; `LOST` has a reason.
- Nav: "Leads" in group `students`; routes `/adm/leads`, `/adm/leads/[id]`.

## 4. Tasks

- [x] **T1** — `admissions.prisma` + migration, permissions, nav, `FormHandler.onSubmitted`. (AC-9, AC-10)
- [x] **T2** — Pure rules, CSV parser and the `interest` definition with unit tests. (AC-1, AC-3, AC-4, AC-6)
- [x] **T3** — Lead service, handler, actions; integration tests. (AC-2..AC-4, AC-6..AC-9)
- [x] **T4** — Leads table, list page with add and import, detail page, i18n. (AC-5, AC-10)
- [x] **T5** — Seed, E2E, docs. (all)

## 5. Test plan

| AC | Test type | Test |
|---|---|---|
| AC-1 | unit | the definition passes `validateDefinition`; workflow and handler key |
| AC-2 | integration | submitting the public form creates a lead (consent time, submission link, program match by code and by name, ambiguous/none stays unlinked) |
| AC-3, AC-4 | unit + integration | validation rules; CSV parse (BOM, `;`, quotes, limits), all-or-nothing, duplicate skipping |
| AC-6 | unit + integration | every transition allowed/refused; `LOST` needs a reason; events written |
| AC-7, AC-8 | integration | edit, assign (inactive/unauthorized assignee refused), note; invitation queues one outbox row, sets time, status; refused without e-mail/consent/finished |
| AC-9, AC-10 | integration + e2e | permission refusals by role (finance reads, cannot write; student refused); audit values masked |
| AC-1..AC-8 | e2e | visitor submits `/f/interest`; Student Affairs sees the lead, contacts, notes, invites (outbox checked); Finance sees the list without write controls; student forbidden |

## 6. Definition of done

- [x] All tasks ticked, all ACs covered by tests
- [x] `pnpm lint && pnpm typecheck && pnpm test` pass; E2E for user-facing flows pass
- [x] Security checklist in [conventions.md](../../02-architecture/conventions.md#security-checklist-every-feature) satisfied
- [x] i18n keys added (`en` and `sq`)
- [x] Docs updated (domain model, brief, PLT-15 notes)
- [x] FEATURES.md Status → `done`; `node scripts/features.mjs --write`
