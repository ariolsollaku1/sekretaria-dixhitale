# PLT-15 — Forms engine

| | |
|---|---|
| **Phase** | P2 |
| **Depends on** | PLT-08, PLT-10, PLT-11 |
| **Questions** | Q-37 (non-blocking): public forms with honeypot and rate limit, no CAPTCHA, no anonymous e-mails, files only in logged-in forms, roles named in the definition handle submissions |
| **Source** | SRC-037, SRC-133 (decision in [ADR-0009](../../02-architecture/adr/0009-forms-engine.md)) |
| **Brief** | [../modules/plt.md](../modules/plt.md) |

> Spec lifecycle: write from this template → review with the user → set Status `specced` in
> FEATURES.md → build task by task → tick tasks → Status `done`.

## 1. Context

About twenty forms are needed (interest, application, scholarship, deregistration, recognition,
extracurricular activities, Erasmus, library card, leave, supplies, certificates, evaluations…).
ADR-0009 decided on one engine: a form is **data** (a versioned JSON definition with fields,
conditions and a workflow), a submission is **JSON answers** validated against the definition
version, and an optional **handler** in the owning module reacts when a submission is approved.
Some forms are opened from the LOGOS website without login (SRC-037, SRC-133).

## 2. Requirements

### User stories

- As a **sysadmin**, I want to define a form as JSON, preview it and publish it, so that a new
  form needs no code.
- As a **visitor, student or staff member**, I want to fill in a form (without login when it is
  public) and get a reference for it.
- As an **office** (secretariat, finance, HR…), I want an inbox of the submissions of my forms
  where I can assign, comment and move them along the workflow, and see their history.
- As a **logged-in submitter**, I want to be told when my submission changes state.

### Acceptance criteria (EARS)

| ID | Criterion |
|---|---|
| AC-1 | THE SYSTEM SHALL store form definitions with a `key`, an incrementing `version`, `status` (`DRAFT`, `PUBLISHED`, `ARCHIVED`), `audience` (`PUBLIC`, `AUTHENTICATED`), the `ownerRoles` that handle submissions and the definition JSON, with at most one `PUBLISHED` version per key. |
| AC-2 | THE SYSTEM SHALL validate a definition against a schema before it can be saved or published: unique field keys, known field types (`text`, `textarea`, `email`, `phone`, `number`, `date`, `select`, `radio`, `checkbox`, `file`), options for select/radio, conditions that refer to earlier fields, a workflow with an initial state, unique states, transitions between known states, at least one final state, and labels in Albanian (English optional). |
| AC-3 | WHEN a sysadmin publishes a draft, THE SYSTEM SHALL make it the served version of its key and archive the previous published one; published and archived versions SHALL NOT be edited, a change is a new draft version. |
| AC-4 | THE SYSTEM SHALL serve published public forms at `/f/<key>` without login and published authenticated forms at `/forms/<key>` for signed-in users (limited to the definition's allowed roles when it names any), and answer 404 for unknown, unpublished or wrongly addressed keys. |
| AC-5 | WHEN a form is submitted, THE SYSTEM SHALL validate the answers on the server against the served version (required fields, types, ranges, options, only visible fields counted), store them with a unique reference code, the initial state, the submitter (user or none) and the definition version, write the first history event, and show the reference. |
| AC-6 | THE SYSTEM SHALL protect public submissions with a hidden honeypot field (a filled honeypot is answered like a success and stored nowhere) and a rate limit of 5 submissions per IP address and form per 10 minutes (refused with a clear message), and SHALL store no IP address with the answers. |
| AC-7 | THE SYSTEM SHALL list the submissions of the forms a user handles (their roles intersect the form's `ownerRoles`, the sysadmin all) in a PLT-10 table with filters on form, state, assignee and reference, and a detail page with the answers, the history and the actions. |
| AC-8 | WHEN a handler changes the state of a submission along an allowed transition with an optional comment, assigns it to a user who handles the form, or adds a comment, THE SYSTEM SHALL record a history event and audit it; IF the transition is not allowed THEN THE SYSTEM SHALL refuse. |
| AC-9 | WHEN the state of a submission with a logged-in submitter changes, THE SYSTEM SHALL notify the submitter (in-app and optionally e-mail) with the form title and the new state's label. |
| AC-10 | WHEN a submission enters a state marked `approved`, THE SYSTEM SHALL run the form's registered handler (a typed function of the owning module) inside the same transaction; IF the handler fails THEN the state change is rolled back. |
| AC-11 | THE SYSTEM SHALL let a sysadmin list definitions (key, version, status, audience), create a draft from JSON, edit a draft with validation errors shown by path, preview the rendered form, publish and archive, and SHALL audit each. |
| AC-12 | THE SYSTEM SHALL restrict definition management to `plt.form.manage` (sysadmin) and the inbox to `plt.form.inbox` (all staff roles) narrowed by the form's `ownerRoles`, and the submitter to see their own submissions (`plt.form.submit`, any signed-in user). |

### Out of scope

A visual form builder (JSON editor with preview is enough), file fields in public forms,
CAPTCHA, e-mail to anonymous submitters, anonymous surveys with separated storage (QA-01),
embedding via iframe, per-field encryption, SLA timers, reports on answers.

### Assumptions

- The definition JSON is trusted input from the sysadmin but is still validated (AC-2).
- Labels are inline per locale in the definition (`{sq, en}`), not catalog keys.
- Rate-limit state lives in a small database table so it survives restarts and multiple instances.

## 3. Design

### Data model

```prisma
// prisma/schema/forms.prisma
enum FormStatus { DRAFT PUBLISHED ARCHIVED }
enum FormAudience { PUBLIC AUTHENTICATED }
enum FormEventKind { SUBMITTED STATE ASSIGNED COMMENT }

model FormDefinition {
  id, key, version Int, status, audience, ownerRoles Role[], definition Json,
  createdAt, updatedAt, createdById, updatedById, publishedAt?
  @@unique([key, version])   // + partial unique index: one PUBLISHED per key
}

model FormSubmission {
  id, definitionId, reference @unique, submitterId?, answers Json, state String,
  assigneeId?, submittedAt, updatedAt
}

model FormSubmissionEvent {
  id, submissionId, kind, fromState?, toState?, comment?, actorId?, createdAt
}

model RateLimitHit { id, bucket String, at DateTime  @@index([bucket, at]) }
```

### Definition (JSON)

```jsonc
{
  "title": { "sq": "…", "en": "…" },
  "description": { "sq": "…" },
  "fields": [
    { "key": "name", "type": "text", "label": { "sq": "Emri" }, "required": true, "max": 100 },
    { "key": "kind", "type": "select", "label": { "sq": "Lloji" }, "options": [{ "value": "a", "label": { "sq": "A" } }] },
    { "key": "other", "type": "text", "label": { "sq": "Tjetër" }, "showIf": { "field": "kind", "equals": "a" } }
  ],
  "workflow": {
    "initial": "new",
    "states": [{ "key": "new", "label": { "sq": "E re" } }, { "key": "approved", "label": { "sq": "Miratuar" }, "kind": "approved", "final": true }],
    "transitions": [{ "from": "new", "to": "approved" }]
  },
  "handler": "module.key"
}
```

### Permissions

| Permission | Granted to |
|---|---|
| `plt.form.manage` | sysadmin |
| `plt.form.inbox` | every staff role (everyone except student; narrowed by `ownerRoles`) |
| `plt.form.submit` | every role (signed-in submitters; public forms need none) |

### Server

| Kind | Name | Purpose |
|---|---|---|
| shared | `src/lib/ratelimit` | `hit(bucket, limit, windowMs)` on a database table; cleanup by the existing nightly job pattern |
| domain | `domain/definition.ts`, `domain/answers.ts` | definition schema + errors by path; answer validation, conditions, reference, states |
| service | `definition.service.ts`, `submission.service.ts` | definitions (draft, publish, archive); submit, change state, assign, comment (+ audit, notify, handlers) |
| registry | `handlers.ts` | `registerFormHandler(key, fn)` for owning modules |
| queries | `form.queries.ts` | served definitions, inbox scope, detail |
| table | `submission.table.tsx` | PLT-10 table `plt.form-submissions` |

### UI

| Route | Who | What |
|---|---|---|
| `/f/<key>` | anyone | public form (outside the app shell) |
| `/forms`, `/forms/<key>` | signed in | available authenticated forms; fill in; my submissions |
| `/admin/forms` | manage | definitions; `/new`, `/[id]` JSON editor + preview + publish |
| `/forms/inbox`, `/forms/inbox/[id]` | inbox | submissions table and detail with actions |

### Edge cases & errors

- A visitor submits twice quickly: the rate limit allows 5; each submission gets its own reference.
- The definition changes while someone fills the form: the submission is validated against the version served at submit time and stores that version's id.
- A hidden field (condition false) is not required and its answer is dropped.
- A handler registered under a key no module provides: publishing is allowed, approving fails visibly (the transition is refused) until a module registers it.

**Implementation notes:**
- Everything lives in `src/lib/forms` (platform feature, not a module), UI in
  `src/components/forms`; the public route is `src/app/(public)/f/[key]` (the proxy lets `/f/` through).
- OFF-01 additions (optional, backward compatible): a definition may list `submitRoles` (who may fill in an authenticated form; others get 404 and do not see it listed) and a transition may list `roles` (who may take it; sysadmin always; nobody may take a role-restricted transition on their own submission).
- A published definition is frozen by a database trigger; one PUBLISHED version per key by a partial unique index.
- The rate limiter (`src/lib/ratelimit`) stores a hash of the address per bucket; the hourly job
  `plt.ratelimit.prune` removes old hits.
- File fields (authenticated forms) use the PLT-08 purpose `form-attachment`, readable by the
  submitter and the form's handlers; file purposes of lib features register through `src/lib/files/all.ts`.
- Notification type `plt.form-status`; handlers are registered with `registerFormHandler(key, …)`.
- Dev seed: the public form `kontakt-demo` (handled by the Secretariat).

## 4. Tasks

- [x] **T1** — `forms.prisma` + migration (partial unique index); permissions; nav; public route open in the proxy. (AC-1, AC-12)
- [x] **T2** — Rate limiter; pure definition schema and answer validation with unit tests. (AC-2, AC-5, AC-6)
- [x] **T3** — Definition service (draft, publish, archive) and queries; integration tests. (AC-1..AC-3, AC-11)
- [x] **T4** — Submission service: submit (public/authenticated), state change, assign, comment, notifications, handlers; integration tests. (AC-4..AC-10)
- [x] **T5** — Renderer, public and authenticated pages, inbox table and detail, admin editor with preview, i18n. (AC-4, AC-7, AC-11)
- [x] **T6** — E2E, example form (seed), docs. (all)

## 5. Test plan

| AC | Test type | Test |
|---|---|---|
| AC-2 | unit | definition schema: every rule has a failing and a passing case; errors carry paths |
| AC-5 | unit + integration | answer schema from a definition: types, required, options, conditions; storage with reference and version |
| AC-1, AC-3 | integration | one published per key (service and database); publish archives the previous; published is immutable |
| AC-6 | integration | honeypot stores nothing; 6th submission refused; window expiry |
| AC-8, AC-9 | integration | allowed and refused transitions; events; notification of a logged-in submitter |
| AC-10 | integration | handler runs on approval; failing handler rolls back |
| AC-4, AC-7, AC-11, AC-12 | e2e | sysadmin publishes; visitor submits without login; office handles it; student cannot open the inbox; authenticated form refuses anonymous |

## 6. Definition of done

- [x] All tasks ticked, all ACs covered by tests
- [x] `pnpm lint && pnpm typecheck && pnpm test` pass; E2E for user-facing flows pass
- [x] Security checklist in [conventions.md](../../02-architecture/conventions.md#security-checklist-every-feature) satisfied
- [x] i18n keys added (`en` and `sq`)
- [x] Docs updated (domain model, ADR-0009 consequences, brief)
- [x] FEATURES.md Status → `done`; `node scripts/features.mjs --write`
