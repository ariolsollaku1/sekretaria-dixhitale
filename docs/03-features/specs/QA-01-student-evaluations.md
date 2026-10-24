# QA-01 — Student evaluations of lecturers & administration

| | |
|---|---|
| **Phase** | P7 |
| **Depends on** | PLT-15 (forms engine conventions), CUR-04 (teaching assignments), STU-01 (rosters) |
| **Questions** | Q-25 (answered: content is configuration, scale 1–5 average), Q-104…Q-108 (all non-blocking working assumptions, see Assumptions) |
| **Source** | SRC-120, SRC-121 |
| **Brief** | [../modules/qa.md](../modules/qa.md) |

> Spec lifecycle: write → review → `specced` → build → tick tasks → `done`.

## 1. Context

Students fill in an evaluation form for each lecturer (SRC-120) and one for the administration
(SRC-121; the source allows merging them into one form). The Quality Assurance Unit (NJSBC, role
`quality`) runs an **evaluation campaign** per academic year, defines the questions, opens and closes
it; students get one survey per teaching assignment of their group plus one for the administration.
Answers are **anonymous**: the response is stored without any student identity, the fact that a
student has answered is stored separately (so nobody answers twice). Results appear only after the
campaign is closed and only when enough students answered (ADR-0009: anonymous surveys use a storage
path that never links responses to identities; the questions are configuration, Q-25).

## 2. Requirements

### User stories

- As a **quality officer**, I want to prepare a campaign with its questions, open it, watch the
  participation and close it, so that every student can evaluate once.
- As a **student**, I want a list of what I can evaluate and to answer in a few taps on my phone,
  knowing nobody can see that the answers are mine.
- As a **quality officer**, I want the results per course and lecturer, per department and for the
  administration.
- As a **head of department or program coordinator**, I want the results of my scope.
- As a **lecturer**, I want to see my own aggregated results.

### Acceptance criteria (EARS)

| ID | Criterion |
|---|---|
| AC-1 | WHEN a quality officer creates a campaign for an academic year with a name (optionally copying the questions of an earlier campaign), THE SYSTEM SHALL store it as `DRAFT`, unique per year and name, and audit it. |
| AC-2 | WHILE a campaign is `DRAFT`, THE SYSTEM SHALL let the quality officer replace its questions: 1–40 questions, each with a unique key, a section (`LECTURER` or `ADMINISTRATION`), a type (`SCALE` 1–5 or `TEXT`), an Albanian label (English optional); scale questions are always required; IF the campaign is not `DRAFT` THEN THE SYSTEM SHALL refuse the change. |
| AC-3 | WHEN the quality officer opens a campaign, THE SYSTEM SHALL require at least one `SCALE` question and an academic year that is not closed, and set it `OPEN`; WHEN the campaign is closed THE SYSTEM SHALL set it `CLOSED` for good (no reopening); both transitions are audited. |
| AC-4 | WHILE a campaign is `OPEN`, THE SYSTEM SHALL list to a student, for the campaign's year, one survey per teaching assignment of the group they are registered in (active enrollment) and one administration survey (if the campaign has administration questions), each marked done or open. |
| AC-5 | WHEN a student submits a survey, THE SYSTEM SHALL validate the answers against the campaign's questions of that section (every scale question 1–5, text ≤ 2000 characters, no unknown keys), store the response without student, timestamp or any link to the participation record, and store one participation record (student, campaign, target, date only) in the same transaction. |
| AC-6 | IF the student already evaluated the target, the campaign is not `OPEN`, the target is not one of the student's, or the student has no active registration in the year, THEN THE SYSTEM SHALL refuse the submission and store nothing. |
| AC-7 | THE SYSTEM SHALL never put answers or response ids in the audit log; the audit entry of a submission names only the campaign and the target. |
| AC-8 | THE SYSTEM SHALL show results only for a `CLOSED` campaign; for a target with fewer responses than `qa.minResponses` (default 5) THE SYSTEM SHALL show "not enough responses" and no figures, no distribution and no comments. |
| AC-9 | THE SYSTEM SHALL compute per scale question the number of answers, the mean and the distribution 1–5, and per target the overall mean of all scale answers (Q-108). |
| AC-10 | THE SYSTEM SHALL show the quality officer, for each campaign, the participation (answered / eligible students) per target at any time, never who answered or what. |
| AC-11 | THE SYSTEM SHALL list the results of a closed campaign per teaching assignment (course, kind, group, lecturer, department, responses, mean) limited to the viewer: the quality officer sees all; a head of department or program coordinator the assignments whose group is in their scope; a lecturer their own; and, for the quality officer only, per department roll-ups, the administration results and the free-text comments (unattributed, in stable order). |
| AC-12 | THE SYSTEM SHALL restrict campaign management to `qa.campaign.manage` (quality), results to `qa.result.read` (quality, head of department, program coordinator; scoped) or `qa.result.self` (lecturer, own assignments), and submission to `qa.survey.submit` (student), and audit every change. |
| AC-13 | THE SYSTEM SHALL let a student fill in a survey at 360 px width: one question per block with large 1–5 buttons. |

### Out of scope

Staff quality indicators (QA-03), alumni (QA-02), comparison between years, exports/PDF of results,
reminders to students who have not answered (notifications can be added later), evaluation of
programs or facilities, moderation of free-text comments.

### Assumptions

- **Q-104** — questionnaire model: own question list per campaign (not a forms-engine definition);
  sections lecturer/administration in one campaign; scale 1–5 and text only; a campaign covers all
  teaching assignments of one academic year (no dated semesters, as Q-82).
- **Q-105** — who evaluates what: every student with an active registration in the year evaluates
  each teaching assignment (every kind and lecturer) of their group, plus the administration once.
- **Q-106** — anonymity: the participation row has a date, the response has no time; the minimum
  number of responses is the setting `qa.minResponses` (5); results only after the campaign is closed.
- **Q-107** — visibility: comments and the administration results only for the quality officer;
  lecturers, heads and coordinators see scale figures of lecturer sections only.
- **Q-108** — scoring: mean of 1–5 answers (Q-25), no weights, no normalisation.

## 3. Design

### Data model

```prisma
// prisma/schema/qa.prisma
enum EvalCampaignStatus { DRAFT OPEN CLOSED }
enum EvalSection { LECTURER ADMINISTRATION }

model EvalCampaign {
  id, academicYearId, name, status, questions Json, openedAt?, closedAt?, createdAt, updatedAt, createdById, updatedById
  @@unique([academicYearId, name])
}
model EvalParticipation {   // who answered what, never how
  id, campaignId, studentId, targetKey (assignment id or "ADMIN"), assignmentId?, completedOn Date
  @@unique([campaignId, studentId, targetKey])
}
model EvalResponse {        // how it was answered, never by whom: no student, no timestamp
  id, campaignId, assignmentId?, section, answers Json
  @@index([campaignId, assignmentId])
}
```

### Permissions

| Permission | Granted to |
|---|---|
| `qa.campaign.manage` | quality |
| `qa.result.read` | quality, head_of_department, program_coordinator (by scope of the group) |
| `qa.result.self` | lecturer |
| `qa.survey.submit` | student |

### Server

| Kind | Name | Purpose |
|---|---|---|
| domain | `question-rules.ts`, `result-rules.ts`, `schemas.ts` | question and answers validation, aggregation, threshold |
| service | `campaign.service.ts` | create, replace questions, open, close |
| service | `survey.service.ts` | submit (participation + response) |
| queries | `campaign.queries.ts`, `survey.queries.ts`, `result.queries.ts` | list/detail, student surveys, results by viewer |
| actions | `campaign.actions.ts`, `survey.actions.ts` | wrappers |

### UI

| Route | Who | What |
|---|---|---|
| `/qa/campaigns` | manage | campaigns, create form |
| `/qa/campaigns/[id]` | manage | question editor (draft), open/close, participation |
| `/qa/surveys` | submit | open surveys of the student |
| `/qa/surveys/[campaignId]/[target]` | submit | the questionnaire |
| `/qa/results` | read / self | closed campaigns |
| `/qa/results/[campaignId]` | read / self | results per assignment (+ departments, administration for quality) |
| `/qa/results/[campaignId]/[target]` | read / self | per-question figures (+ comments for quality) |

### Edge cases & errors

- Two concurrent submissions of the same target: the unique index makes the second fail with CONFLICT.
- A student moves group after answering: the participation stays; they only see targets of the
  current registration.
- Closed academic year: the campaign cannot be opened; an open one can still be closed.
- Known limit: the audit entry of a submission carries the user and the time (it must, for the
  audit trail) next to the response insert; a database administrator could correlate the two by
  time. The application never exposes it, and the response row itself has no time or user.

## 4. Tasks

- [x] **T1** — Model, migration, permissions, setting `qa.minResponses`, nav. (AC-12)
- [x] **T2** — Pure rules: question and answer validation, aggregation, threshold; unit tests. (AC-2, AC-5, AC-8, AC-9)
- [x] **T3** — Campaign and survey services, queries; integration tests incl. anonymity. (AC-1..AC-7, AC-10)
- [x] **T4** — Results queries with viewer filtering; integration tests. (AC-8..AC-11)
- [x] **T5** — Pages and forms (mobile-first), i18n sq + en. (AC-4, AC-13)
- [x] **T6** — Seed (sample draft campaign), e2e, docs. (all)

## 5. Test plan

| AC | Test |
|---|---|
| AC-2, AC-5, AC-9 | unit (question/answer validation, mean, distribution) |
| AC-8 | unit (threshold) + integration (withheld below minimum) |
| AC-1..AC-3 | integration (draft only, open/close, closed year) |
| AC-4..AC-7 | integration (targets, double submission, foreign target, no link between tables, audit has no answers) |
| AC-10..AC-12 | integration (scope filter for head, own for lecturer, quality extras) |
| AC-13, flow | e2e (quality creates + opens, student answers at 360 px, quality closes and sees results; forbidden: student on `/qa/campaigns`) |

## 6. Definition of done

- [x] Tasks ticked, ACs tested; lint, typecheck, tests, e2e pass; i18n sq+en; FEATURES.md `done`
