# ADM-02 — Online application

| | |
|---|---|
| **Phase** | P2 |
| **Depends on** | PLT-15, ORG-03 |
| **Questions** | Q-122..Q-125 (all non-blocking): application fields and one application per program and cycle; cycles, program offer and document list; status link and e-mails; staff access. Builds on Q-19 (answered: candidates have no account). |
| **Source** | SRC-020, SRC-022, SRC-030, SRC-032 |
| **Brief** | [../modules/adm.md](../modules/adm.md) |

> Spec lifecycle: write from this template → review with the user → set Status `specced` in
> FEATURES.md → build task by task → tick tasks → Status `done`.

## 1. Context

SRC-030 wants candidates to enter their own personal data on the LOGOS website, and SRC-020 says
the Secretariat later only *confirms* those data and gives the final approval (ADM-04), so nothing
is retyped. SRC-022 asks for the high-school average that a first-year student brings. Candidates
have no account (Q-19): they use a public page, receive an e-mail with a **reference number** and a
**private link** (a long random token) to look at their application and add missing documents.

PLT-15 (forms engine) is *not* used for the form itself: it forbids file fields in public forms,
has no per-cycle document list, and its submissions are generic JSON. ADM-02 therefore has its own
typed tables (`Application`, `ApplicationCycle`…) and reuses the platform pieces of PLT-15: the
database rate limiter, the honeypot idea, and the PLT-08 file store.

## 2. Requirements

### User stories

- As a **candidate**, I want to fill in one online application (personal data, contact, previous
  education with the average, program choice) without creating an account.
- As a **candidate**, I want a confirmation e-mail with a reference and a private link, to see the
  state of my application and to upload the documents I still owe.
- As the **Secretariat / Student Affairs**, I want to open an application cycle with its dates and
  the list of required documents, and to see every application with its status and missing documents.
- As a **Finance officer or sysadmin**, I want to read applications (not change them).

### Acceptance criteria (EARS)

| ID | Criterion |
|---|---|
| AC-1 | THE SYSTEM SHALL store application cycles (`academicYear`, `name`, `opensOn`, `closesOn`, `active`) with a configurable list of required or optional document types (`key`, Albanian label, optional English label, `required`, order), and let `adm.cycle.write` create and edit them with an audit entry. |
| AC-2 | THE SYSTEM SHALL serve `/apply` without login and list the cycles that are active and open on today's date (Europe/Tirane) with the active study programs; IF no cycle is open THEN it SHALL say so and offer no form. |
| AC-3 | WHEN a candidate submits the multi-step form (personal data, contact, previous education incl. high-school average, program, consent) THE SYSTEM SHALL validate it on the server, store an `Application` with status `SUBMITTED`, a unique reference (`AP-` + 8 characters) and the cycle, show the reference, and audit it as a public action. |
| AC-4 | IF the cycle is closed or inactive, the program is inactive, a required field is invalid, the consent is missing, the birth date or the average is out of range, or the same e-mail already applied to the same program in the same cycle THEN THE SYSTEM SHALL refuse with a field error and store nothing. |
| AC-5 | THE SYSTEM SHALL protect the public form with a hidden honeypot (a filled honeypot is answered like a success and stores nothing) and a rate limit of 5 submissions per IP address per 10 minutes, and SHALL store no IP address with the application. |
| AC-6 | WHEN an application is stored THE SYSTEM SHALL queue a confirmation e-mail (in the candidate's form language) with the reference and the private status link, in the same transaction. |
| AC-7 | THE SYSTEM SHALL give each application a private link `/apply/status/<token>` (32 random bytes, only the SHA-256 hash stored, valid 180 days); a malformed, unknown or expired token SHALL answer 404 and the page SHALL send `Referrer-Policy: no-referrer`. |
| AC-8 | WHEN a candidate opens a valid link THE SYSTEM SHALL show the reference, the status, the cycle and program, a summary of the submitted data and, per document type of the cycle, whether it is required, received (file name, date) or missing. |
| AC-9 | WHEN a candidate uploads a file for a document type of the application's cycle through the link THE SYSTEM SHALL check type and size (PDF, JPEG, PNG; 10 MB), store it with the PLT-08 store attached to the application, void the earlier file of that type (never delete), and audit it; uploads are rate limited (30 per IP per 10 minutes) and refused when the status is no longer `SUBMITTED` or `IN_REVIEW`. |
| AC-10 | WHEN a candidate enters an e-mail and a reference on `/apply/link` THE SYSTEM SHALL, if they match, issue a new link (the old one stops working) and e-mail it; the answer SHALL be the same whether or not they match; the form is rate limited (5 per IP per 10 minutes). |
| AC-11 | THE SYSTEM SHALL list applications for `adm.application.read` in a PLT-10 table (reference, name, program, cycle, status, submitted, missing required documents) with filters on reference, name, e-mail, program, cycle and status, export included, and a detail page with all data, the documents (download through the PLT-08 route) and the status. |
| AC-12 | THE SYSTEM SHALL grant `adm.application.read` and `adm.cycle.read` to secretary, student-affairs, finance and sysadmin, and `adm.cycle.write` to secretary and student-affairs only; candidates and other roles are refused, and the file purpose `application-document` is readable only with `adm.application.read`. |

### Out of scope

Reviewing, ranking, accepting and rejecting (ADM-03: status stays `SUBMITTED` here), turning an
application into a student (ADM-04), staff editing of the applicant's data, interest form and leads
(ADM-01), fees and contract (ADM-05), SMS, CAPTCHA, a saved draft of an unfinished form.

### Assumptions

- Q-122: the field list below; the high-school average is between 5.00 and 10.00 (Albanian scale);
  for a Master program the "previous education" fields describe the previous (Bachelor) studies.
- Q-123: every active program is offered in every open cycle; documents are uploaded **after** the
  form is submitted, on the status page (the form itself has no file step, because a visitor has no
  draft to come back to); missing documents do not stop the application.
- Q-124: link valid 180 days, replaced by a new link on request; e-mail in the language of the page.
- Q-125: staff read; only Secretariat and Student Affairs configure cycles.

## 3. Design

### Data model

```prisma
// prisma/schema/admissions.prisma
enum ApplicationStatus { SUBMITTED IN_REVIEW ACCEPTED REJECTED ENROLLED }

model ApplicationCycle {
  id, academicYearId, name, opensOn Date, closesOn Date, active Boolean, audit columns
  documents ApplicationCycleDocument[]; applications Application[]
  @@unique([academicYearId, name])
}
model ApplicationCycleDocument {
  id, cycleId, key, labelSq, labelEn?, required Boolean, sequence Int
  @@unique([cycleId, key])
}
model Application {
  id, reference @unique, cycleId, programId, status, locale
  firstName, lastName, fatherName?, gender, birthDate Date, birthPlace?, nationalId?,
  email, phone, address, residence?,
  schoolName, schoolCity?, graduationYear Int, averageGrade Decimal(4,2),
  consentAt, tokenHash @unique, tokenExpiresAt, submittedAt, updatedAt
  documents ApplicationDocument[]
  @@unique([cycleId, programId, emailKey])   // emailKey = lower-cased e-mail
}
model ApplicationDocument { id, applicationId, documentKey, fileId @unique, uploadedAt, voidedAt? }
```

### Permissions

| Permission | Granted to |
|---|---|
| `adm.application.read` | sysadmin, secretary, student_affairs, finance |
| `adm.cycle.read` | sysadmin, secretary, student_affairs, finance |
| `adm.cycle.write` | secretary, student_affairs |
| `adm.application.upload` (file purpose upload only) | nobody — candidates upload through the token route |

### Server

| Kind | Name | Purpose |
|---|---|---|
| domain | `domain/application-rules.ts`, `domain/schemas.ts` | field validation, reference, token expiry, missing documents, open-cycle test |
| service | `server/application.service.ts` | public submit, link request, token lookup, document upload |
| service | `server/cycle.service.ts` + `cycle.actions.ts` | cycles with their document list (wrapper actions) |
| mail | `server/application-mail.ts` | confirmation / new-link e-mail into the outbox |
| queries | `server/application.queries.ts`, `application.table.tsx` | staff list and detail; PLT-10 table `adm.applications` |
| route | `/api/adm/applications/[token]/documents` | candidate upload (multipart) |

### UI

| Route | Who | What |
|---|---|---|
| `/apply` | anyone | open cycles, multi-step form (4 steps), reference screen |
| `/apply/status/[token]` | holder of the link | status, summary, documents with upload |
| `/apply/link` | anyone | ask for a new link |
| `/adm/cycles` | cycle.read / write | cycles and their document lists |
| `/adm/applications`, `/adm/applications/[id]` | application.read | list and detail |

### Edge cases & errors

- A cycle closes while a candidate fills the form: refused with `cycleClosed`; nothing stored.
- Same e-mail, same program, same cycle twice (also differing in letter case): refused `duplicate`.
- A document type removed from a cycle after files were uploaded: refused `inUse` (deactivate by not requiring it).
- A second upload for the same type voids the first file; both stay in the store.
- A honeypot hit writes nothing and still shows a believable reference (checked before the rate limit, as in PLT-15).

**Implementation notes:**
- Module `src/modules/adm` (`domain`, `server`, `ui`); public pages in `src/app/(public)/apply`, the candidate upload at `POST /api/adm/applications/[token]/documents`; the proxy lets `/apply` through.
- The candidate e-mails go to `EmailOutbox` with `userId = null` (no account, no preferences), rendered with the notification catalog (`notifications.adm.*`, `mail.adm.*`); sent by the existing `plt.mail.send` job, which the minutely flush job backs up.
- The audit trail of public actions is `PUBLIC` without IP and holds ids only (no personal data).
- The file purpose `application-document` is registered in `src/lib/files/all.ts`; its upload permission `adm.application.upload` is granted to nobody so `/api/files` cannot be used to upload it.
- The honeypot field is `hp_note`; rate limits use the PLT-15 table with buckets `adm:apply`, `adm:upload`, `adm:link`.
- Dev seed: the open cycle "Regjistrimi 2026-2027 (demo)" with four example documents (open until 2026-12-31).
- After the form is sent the browser is redirected to the private status page (`?new=<reference>` shows the confirmation); the token is only in that URL and in the e-mail.

## 4. Tasks

- [x] **T1** — `admissions.prisma` + migration; permissions; nav; proxy lets `/apply` through. (AC-1, AC-12)
- [x] **T2** — Pure rules and Zod schemas with unit tests. (AC-3, AC-4, AC-7, AC-8)
- [x] **T3** — Cycle service and actions; integration tests. (AC-1, AC-12)
- [x] **T4** — Application service (submit, token lookup, link request, upload), mail, file purpose; integration tests. (AC-3..AC-10)
- [x] **T5** — Public pages and upload route; i18n sq/en. (AC-2, AC-3, AC-7..AC-10)
- [x] **T6** — Staff cycles page, applications table and detail; seed. (AC-1, AC-11)
- [x] **T7** — E2E, docs (domain model, brief, questions, FEATURES). (all)

## 5. Test plan

| AC | Test type | Test |
|---|---|---|
| AC-3, AC-4 | unit | schema and rules: every rule has failing and passing cases |
| AC-3..AC-6 | integration | submit stores one row + e-mail outbox + audit PUBLIC; closed cycle, duplicate, honeypot, 6th submission refused |
| AC-7..AC-9 | integration | token lookup (valid/expired/malformed); upload stores, voids the earlier file, refuses wrong type/key/status |
| AC-10 | integration | link request rotates token, same answer for a wrong e-mail |
| AC-1, AC-11, AC-12 | integration | cycle create/edit with documents, `inUse` refusal, permissions, table scope of the read permission |
| main flow + forbidden | e2e | staff opens a cycle; visitor applies, uploads a document through the link; secretary sees it; student role cannot open `/adm/applications`; unknown token 404 |

## 6. Definition of done

- [x] All tasks ticked, all ACs covered by tests
- [x] `pnpm lint && pnpm typecheck && pnpm test` pass; E2E for user-facing flows pass
- [x] Security checklist in [conventions.md](../../02-architecture/conventions.md#security-checklist-every-feature) satisfied
- [x] i18n keys added (`en` and `sq`)
- [x] Docs updated (domain model, brief)
- [x] FEATURES.md Status → `done`; `node scripts/features.mjs --write`
