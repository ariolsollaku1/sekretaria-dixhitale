# HR-06 — Performance evaluations

| | |
|---|---|
| **Phase** | P6 |
| **Depends on** | HR-01, PLT-15 |
| **Questions** | Q-25 (answered, assumption adopted): questionnaires are PLT-15 definitions configured by HR/sysadmin, score = average of 1–5 scale questions; Q-134 (non-blocking): campaigns, evaluators, visibility, report levels |
| **Source** | SRC-065, SRC-071, SRC-141 |
| **Brief** | [../modules/hr.md](../modules/hr.md) |

> Spec lifecycle: write from this template → review with the user → set Status `specced` in
> FEATURES.md → build task by task → tick tasks → Status `done`.

## 1. Context

SRC-065 asks for a lecturer performance evaluation form filled by the head of department, SRC-141
for a staff evaluation form filled by the direct supervisor, and SRC-071 for reports on the
performance level of academic staff by department, faculty and institution. The questionnaire
content is not known yet (Q-25): it is configuration. HR-01 holds the staff register, PLT-15 holds
form definitions (versioned JSON with typed fields). This feature adds the **evaluation campaigns**
(one per period and kind), one **evaluation** per evaluated person with an assigned evaluator,
the scoring and the reports. The evaluator's answers are validated with the PLT-15 answer rules;
an evaluation is not a form submission (it has an evaluated subject, a score and different
visibility), so it has its own tables.

## 2. Requirements

### User stories

- As **HR**, I want to open an evaluation campaign for a period, so that every lecturer (or every
  administrative staff member) gets evaluated by the right person.
- As an **evaluator** (head of department, supervisor), I want a list of the people I must evaluate
  and a form to fill in, so that I can finish within the period.
- As an **evaluated person**, I want to see my own result when the institution allows it.
- As **HR, heads of department and quality**, I want reports on the performance level by
  department, faculty and institution.

### Acceptance criteria (EARS)

| ID | Criterion |
|---|---|
| AC-1 | THE SYSTEM SHALL provide two questionnaires, `hr-evaluation-lecturer` (SRC-065) and `hr-evaluation-staff` (SRC-141), as PLT-15 definitions (audience authenticated, owned by HR) that the sysadmin edits and publishes in the forms admin; they SHALL NOT appear in the forms catalog and SHALL NOT be fillable as ordinary forms. |
| AC-2 | WHEN a user with `hr.evaluation.manage` opens a campaign (name, kind `LECTURER` or `STAFF`, period start and end, show-results flag), THE SYSTEM SHALL pin the questionnaire version published for that kind, create one pending evaluation for every active academic (LECTURER) or administrative (STAFF) staff member, assign the head of department of the member's department as evaluator for LECTURER campaigns when exactly one can be found, and audit it; IF no questionnaire is published THEN the campaign SHALL NOT be created. |
| AC-3 | THE SYSTEM SHALL let `hr.evaluation.manage` holders assign or change the evaluator of an evaluation of an open campaign to any active user with a staff role other than the evaluated person's own account, and audit it. |
| AC-4 | THE SYSTEM SHALL let the assigned evaluator (permission `hr.evaluation.fill`) list their evaluations in open campaigns and submit answers validated on the server against the pinned questionnaire version (required fields, types, ranges, options, conditions); WHEN submitted THE SYSTEM SHALL store the answers, the score, the time and the author and audit it. |
| AC-5 | THE SYSTEM SHALL compute the score as the average, rounded to two decimals, of the answers to the scale questions of the questionnaire (Q-25: integer numbers 1–5, or select/radio fields whose option values are all 1–5) and leave it empty when the questionnaire has no scale question answered. |
| AC-6 | WHILE a campaign is open, THE SYSTEM SHALL allow the evaluator to correct a submitted evaluation (audited); WHEN the campaign is closed by `hr.evaluation.manage`, no evaluation of it SHALL change and a closed campaign SHALL NOT reopen. |
| AC-7 | THE SYSTEM SHALL let only the assigned evaluator submit an evaluation; any other user, including HR, is refused as if it did not exist, and a user SHALL NOT be assigned to or submit an evaluation about themselves. |
| AC-8 | THE SYSTEM SHALL list evaluations (campaign, person, department, evaluator, state, score) in a PLT-10 table to holders of `hr.evaluation.read`, limited to their scope (institution, faculty, department of the evaluated person), with filters on campaign, state and department code. |
| AC-9 | WHERE the campaign's show-results flag is set, THE SYSTEM SHALL let an evaluated person (`hr.evaluation.self`) see their own submitted evaluation of a closed campaign (score and answers) and nobody else's; WHERE it is not set they see nothing. |
| AC-10 | THE SYSTEM SHALL report, per campaign and for the user's scope, the number of evaluations, the number submitted and the average score grouped by department, by faculty or for the institution (SRC-071), and SHALL show only evaluations inside the user's scope. |
| AC-11 | THE SYSTEM SHALL write the audit entries `hr.evaluation.open`, `hr.evaluation.close`, `hr.evaluation.assign`, `hr.evaluation.submit`; keep personal data out of logs; never hard-delete a campaign or evaluation. |

### Out of scope

Self-evaluations and peer/student evaluations (student surveys are QA-01), signatures or PDF output
of an evaluation, weighting of questions, tying scores to pay or contract renewal, comparing
campaigns over time, reminders to evaluators (a notification on assignment is enough), a visual
editor for questionnaires (PLT-15's editor is used), staff-quality indicators (QA-03).

### Assumptions

- Q-25 and Q-134. The actual questions are entered by HR/sysadmin before go-live; the dev seed
  publishes a short demo questionnaire for each kind.

## 3. Design

### Data model

```prisma
// prisma/schema/hr.prisma
enum EvaluationKind { LECTURER STAFF }
enum CampaignStatus { OPEN CLOSED }
enum EvaluationState { PENDING SUBMITTED }

model EvaluationCampaign {
  id, name, kind, periodStart Date, periodEnd Date,
  formDefinitionId        // the pinned questionnaire version (FormDefinition)
  resultsVisible Boolean  // evaluated person may see own result once closed
  status, closedAt?, closedById?, createdAt, createdById
  evaluations Evaluation[]
}

model Evaluation {
  id, campaignId, staffId, evaluatorId? (User), state, answers Json?, score Decimal(3,2)?,
  submittedAt?, updatedAt
  @@unique([campaignId, staffId])
}
```

Update [domain-model.md](../../02-architecture/domain-model.md).

### Permissions

| Permission | Granted to |
|---|---|
| `hr.evaluation.manage` | hr, sysadmin |
| `hr.evaluation.read` | hr, sysadmin, quality (institution); head_of_department (department scope) |
| `hr.evaluation.fill` | every staff role (the assignment is the real guard) |
| `hr.evaluation.self` | every staff role |

### Server

| Kind | Name | Purpose |
|---|---|---|
| domain | `domain/evaluation-rules.ts` | `scoreAnswers`, `aggregate(rows, level)` (pure) |
| lib | `src/lib/forms/queries.ts` | internal form prefix `hr-evaluation-` hidden from catalog/submit |
| service | `server/evaluation.service.ts` | open/close campaign, assign, submit (+ audit, notification) |
| queries | `server/evaluation.queries.ts` | campaigns, my evaluations, own results, report, scope filter |
| table | `server/evaluation.table.tsx` | PLT-10 `hr.evaluations` |
| actions | `server/evaluation.actions.ts` | wrapper actions |
| seed | `prisma/seed/hr-evaluations.ts` | demo questionnaires (dev/demo) |

### UI

| Route | Who | What |
|---|---|---|
| `/hr/evaluations` | manage / read | campaigns list, open-campaign form |
| `/hr/evaluations/[id]` | manage / read | campaign: report, evaluations table, assign evaluator, close |
| `/hr/evaluations/mine` | fill | my evaluations to do, and the evaluation form |
| `/hr/evaluations/mine/[evaluationId]` | assigned evaluator | the questionnaire |
| `/hr/evaluations/me` | self | my own results (visible ones) |

### Edge cases & errors

- No head of department found (or several) for a department: evaluator stays empty; HR assigns.
- Staff without a department in a LECTURER campaign: evaluator empty.
- A staff member joins after the campaign opened: not included (HR can open another campaign).
- The questionnaire is republished during a campaign: the campaign keeps its pinned version.
- Evaluator account deactivated: HR reassigns; an inactive evaluator cannot be chosen.

**Implementation notes:**
- Audit actions have the three-part form the audit layer requires: `hr.evaluation.open|close|assign|submit`.
- `src/lib/forms/queries.ts` gets `INTERNAL_FORM_PREFIXES` / `getInternalForm`: `getPublishedForm`
  and the catalog skip keys starting with `hr-evaluation-`; the HR module loads them with `getInternalForm`/`getFormById`.
- Permissions are registered in `src/modules/hr/evaluation-permissions.ts` (same `hr` module name).
- The audit trail records state and score only, never the evaluator's answers or comments.
- The evaluator form is its own small renderer (the PLT-15 renderer is tied to form submission); file fields are not supported.
- The dev seed (`hr-evaluations`) publishes placeholder questionnaires (three 1–5 questions and a comment).

## 4. Tasks

- [x] **T1** — Pure rules (scoring, aggregation) with unit tests. (AC-5, AC-10)
- [x] **T2** — Models + migration, permissions, hidden internal form keys in the forms lib. (AC-1, AC-11)
- [x] **T3** — Services (open, assign, submit, close), queries, actions; integration tests. (AC-2..AC-7, AC-9)
- [x] **T4** — Table, report, pages, nav, i18n, seed. (AC-8, AC-10)
- [x] **T5** — E2E, docs. (all)

## 5. Test plan

| AC | Test type | Test |
|---|---|---|
| AC-5 | unit | scale detection, mean/rounding, no scale question |
| AC-10 | unit | grouping by department / faculty / institution |
| AC-1 | integration | internal key not served by `getPublishedForm`, not in catalog |
| AC-2, AC-3 | integration | campaign creation rows and default evaluators; missing questionnaire refused; assign rules |
| AC-4, AC-6, AC-7 | integration | submit with validation, correct while open, closed refuses, non-assigned user refused, self refused |
| AC-8, AC-9, AC-10 | integration | scope filter; own result only when flag set and closed; report scoped |
| all | e2e | HR opens a campaign, the head of department evaluates, HR sees the score in the report; lecturer is refused the campaign page |

## 6. Definition of done

- [x] All tasks ticked, all ACs covered by tests
- [x] `pnpm lint && pnpm typecheck && pnpm test` pass; E2E for user-facing flows pass
- [x] Security checklist in [conventions.md](../../02-architecture/conventions.md#security-checklist-every-feature) satisfied
- [x] i18n keys added (`en` and `sq`)
- [x] Docs updated (domain model, brief)
- [x] FEATURES.md Status → `done`; `node scripts/features.mjs --write`
