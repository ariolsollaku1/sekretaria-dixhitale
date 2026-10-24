# STU-07 — Student requests (deregistration, recognition)

| | |
|---|---|
| **Phase** | P2 |
| **Depends on** | PLT-15, STU-02 |
| **Questions** | Q-70 (non-blocking): effective date = requested date clamped to [previous change, today], no fee check, program named by code when several enrollments are open; Q-71 (non-blocking): public requests identified by student number + date of birth; Q-72 (non-blocking): Secretariat / Student Affairs decide per course; Q-73 (non-blocking): recognized courses stored per enrollment with credits, no grade, voided never deleted; Q-74 (non-blocking): field lists of the two forms |
| **Source** | SRC-037, SRC-037b, SRC-037c |
| **Brief** | [../modules/stu.md](../modules/stu.md) |

> Spec lifecycle: write from this template → review with the user → set Status `specced` in
> FEATURES.md → build task by task → tick tasks → Status `done`.

## 1. Context

SRC-037b/c ask for a deregistration form and a document-recognition form that can be opened from
the website without login (alumni, people without an account) and from inside the portal. PLT-15
(forms engine) already stores definitions, submissions, the inbox and the workflow, and lets the
owning module register a handler that runs, in the approving transaction, when a submission enters
an `approved` state. STU-02 already changes an enrollment's status. This feature adds, in the STU
module, the **four form definitions** (public and in-portal variants of each form), the **handlers**,
and — for recognition — the **recognition decision**: the courses and credits the Secretariat
recognizes, stored for EXM-07 (academic record and averages).

## 2. Requirements

### User stories

- As a **student** (or a former student, without login), I want to ask to be deregistered, so that my
  studies are closed formally and I know the outcome.
- As a **student**, I want to ask for earlier studies to be recognized and attach the documents.
- As the **Secretariat / Student Affairs**, I want these requests in the forms inbox, to decide on
  them, and to have an approved deregistration change the enrollment without retyping it.
- As the **Secretariat**, I want to record which courses (and credits) were recognized, so that the
  academic record can use them later.

### Acceptance criteria (EARS)

| ID | Criterion |
|---|---|
| AC-1 | THE SYSTEM SHALL provide four published form definitions handled by the Secretariat and Student Affairs: `deregistration` and `recognition` (public, outside the shell, no files) and `deregistration-student` and `recognition-student` (signed-in, recognition with an optional attachment), each with the workflow `new` → `review` → `approved` or `rejected` (`new` may also go straight to either). |
| AC-2 | THE SYSTEM SHALL identify the student behind a request: a signed-in request by the submitter's account; a public request by the student number and date of birth given in the form, both of which must match one student. |
| AC-3 | WHEN a deregistration request is moved to `approved`, THE SYSTEM SHALL, in the same transaction, change the identified student's open enrollment to `DEREGISTERED` through the STU-02 service with the student's reason and an effective date equal to the requested date moved into the range from the previous status change to today, with the document reference `FORM:<reference>`, and notify the student as STU-02 does. |
| AC-4 | IF the student cannot be identified, has no open enrollment, or has several and the program code given does not select exactly one, THEN THE SYSTEM SHALL refuse the approval with a clear message and leave the submission and the enrollment unchanged. |
| AC-5 | WHEN the Secretariat records a recognition decision on a recognition request, THE SYSTEM SHALL store, per recognized course, the student, the enrollment, the catalog course, the credits (default: the course's credits), the source institution/note, the submission, the author and the time, and audit it; a course SHALL NOT be recognized twice for the same enrollment while a live recognition exists. |
| AC-6 | WHEN the Secretariat voids a recognized course with a reason, THE SYSTEM SHALL keep the row, mark it void with reason, author and time, audit it, and allow the course to be recognized again; recognized courses SHALL NOT be deleted. |
| AC-7 | WHEN a recognition request is moved to `approved`, THE SYSTEM SHALL require at least one live recognized course recorded for it (otherwise refuse the approval) and SHALL leave the recognized courses as the stored decision for EXM-07; moving it to `rejected` SHALL need no recorded courses. |
| AC-8 | THE SYSTEM SHALL let recognition decisions be recorded and voided only while the request is not in a final state, only by users with `stu.recognition.write` who also handle the form (inbox rules), and show the decision panel (requester, enrollment, recognized courses) on a page linked from the submission detail. |
| AC-9 | THE SYSTEM SHALL let `stu.recognition.read` holders (Secretariat, Student Affairs, sysadmin) read the recognized courses of a student, and SHALL restrict all of this to users who may see the student (scope filter); a request about a student the user cannot see is refused as if it did not exist. |
| AC-10 | THE SYSTEM SHALL keep personal data out of logs and SHALL write the audit entries `stu.recognition.record`, `stu.recognition.void` (the approvals reuse `plt.form_submission.change_state` and `stu.enrollment.change_status`). |

### Out of scope

Scholarship (SRC-037a), extracurricular (037d), alumni update (037e) and Erasmus (037f) forms; matching
recognized courses to plan courses; how recognized courses enter averages (EXM-07); fee refunds on
deregistration (FIN); reinstatement; certificate generation; identity checks beyond AC-2 (done by
people, Q-71); withdrawing a request.

### Assumptions

- Q-70..Q-74 above. The texts and fields of the forms are a first proposal (Q-74) that the sysadmin
  can edit in PLT-15 (a change is a new draft version); the handler key stays the same.
- Each form is served by two definitions because a definition has one audience (PLT-15 AC-1).
- Production gets the forms the same way any form does (admin → forms); the dev/demo seeder
  publishes them so the flow can be tried.

## 3. Design

### Data model

```prisma
// prisma/schema/students.prisma
model RecognizedCourse {
  id           String    @id @default(cuid(2))
  studentId    String
  enrollmentId String
  submissionId String            // the recognition request it decides
  courseId     String            // CUR Course
  credits      Int
  /// Earlier institution / basis (free text, optional)
  note         String?
  createdAt, createdById
  voidedAt DateTime?  voidedById String?  voidReason String?
  // partial unique index (migration SQL): (enrollment_id, course_id) WHERE voided_at IS NULL
}
```

Update [domain-model.md](../../02-architecture/domain-model.md): `Enrollment ||--o{ RecognizedCourse`.

### Definitions (handler keys `stu.deregistration`, `stu.recognition`)

| Form | Fields |
|---|---|
| `deregistration` (public) | firstName, lastName, studentNumber, birthDate, email, program (optional code), reason (textarea), requestedDate, confirm (checkbox) |
| `deregistration-student` | program (optional code), reason, requestedDate, confirm |
| `recognition` (public) | firstName, lastName, studentNumber, birthDate, email, program (optional), institution, studyProgram, courses (textarea: course, credits), notes |
| `recognition-student` | program (optional), institution, studyProgram, courses, notes, document (file, optional) |

All: `ownerRoles` = secretary, student_affairs; states `new` (initial), `review`, `approved`
(kind approved, final, runs the handler), `rejected` (kind rejected, final).

### Permissions

| Permission | Granted to |
|---|---|
| `stu.recognition.read` | sysadmin, secretary, student_affairs |
| `stu.recognition.write` | secretary, student_affairs |

Approvals use the existing `plt.form.inbox` plus the form's `ownerRoles`; the deregistration handler
additionally requires `stu.student.write`.

### Server

| Kind | Name | Purpose |
|---|---|---|
| domain | `domain/request-rules.ts` | `clampEffectiveDate`, `pickEnrollment`, `identityMatches` (pure) |
| domain | `domain/request-forms.ts` | the four definitions (JSON constants, validated by the PLT-15 schema in a test) |
| service | `server/request-resolve.ts` | find the student + open enrollment for a submission |
| service | `server/request-handlers.ts` | `registerFormHandler("stu.deregistration" / "stu.recognition")` |
| service | `server/recognition.service.ts` | `recordRecognition`, `voidRecognition`, queries (panel, by student) |
| action | `server/recognition.actions.ts` | record / void with the wrapper |
| forms | `FormHandler.detailHref?` | optional link shown on the submission detail page |
| seed | `prisma/seed/stu-requests.ts` | publish the four forms (dev/demo) |

### UI

| Route | Who | What |
|---|---|---|
| `/f/deregistration`, `/f/recognition` | anyone | public forms (PLT-15) |
| `/forms/deregistration-student`, `/forms/recognition-student` | signed in | in-portal forms (PLT-15) |
| `/forms/inbox/[id]` | inbox | existing detail; shows a "Recognition decision" link for recognition requests |
| `/stu/requests/[submissionId]` | `stu.recognition.read` | requester and enrollment, recognized courses, add/void dialogs |

### Edge cases & errors

- The public student number exists but the date of birth differs: the approval is refused, the
  message says only that the student could not be identified (no hint which field).
- A request is approved twice (two users): the second transition is refused by PLT-15 (final state).
- The student was deregistered another way meanwhile: no open enrollment, approval refused; the
  Secretariat rejects with a comment.
- Requested date after today or before the previous change: moved into range, not an error.

**Implementation notes:**
- Handlers live in `src/modules/stu/server/request-handlers.ts`; `src/lib/forms/all.ts` loads them where the inbox actions run (the registry is in-process). `FormHandler.detailHref` lets a module add a link on the submission detail.
- The recognized courses of a request are recorded *before* approval (the handler only checks that one exists); the dev/demo seeder publishes the four forms, production loads them in the forms admin.
- Courses are identified by catalog code in the decision form (no picker).

## 4. Tasks

- [x] **T1** — Pure rules and the four definitions with unit tests. (AC-1, AC-2, AC-3)
- [x] **T2** — `RecognizedCourse` model + migration (partial unique index), permissions; recognition service and actions; integration tests. (AC-5, AC-6, AC-9, AC-10)
- [x] **T3** — Resolver and handlers (deregistration → STU-02, recognition guard) registered on the forms engine; integration tests. (AC-2..AC-4, AC-7)
- [x] **T4** — Decision page, detail link, i18n, nav-free routes, seeder. (AC-1, AC-8)
- [x] **T5** — E2E, docs (domain model, brief). (all)

## 5. Test plan

| AC | Test type | Test |
|---|---|---|
| AC-1 | unit | each definition passes `validateDefinition`; workflow shape; handler keys |
| AC-2, AC-3 | unit | `identityMatches`, `clampEffectiveDate` (past, future, before last change), `pickEnrollment` |
| AC-3, AC-4 | integration | approving deregisters (status, event with document ref, audit); unknown student / no open enrollment / ambiguous program refuse and roll back |
| AC-5, AC-6 | integration | record, duplicate refused, void keeps the row, record again; audit |
| AC-7 | integration | approve recognition without courses refused; with a course allowed |
| AC-8, AC-9 | integration + e2e | scoped/forbidden user gets not-found; student has no access to the decision page |
| AC-1..AC-8 | e2e | student submits in-portal deregistration, secretary approves, enrollment shows deregistered; visitor submits public recognition, secretary records a course and approves; student forbidden on the decision page |

## 6. Definition of done

- [x] All tasks ticked, all ACs covered by tests
- [x] `pnpm lint && pnpm typecheck && pnpm test` pass; E2E for user-facing flows pass
- [x] Security checklist in [conventions.md](../../02-architecture/conventions.md#security-checklist-every-feature) satisfied
- [x] i18n keys added (`en` and `sq`)
- [x] Docs updated (domain model, brief)
- [x] FEATURES.md Status → `done`; `node scripts/features.mjs --write`
