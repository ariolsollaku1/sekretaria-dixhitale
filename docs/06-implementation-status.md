# Implementation status

_Snapshot of `main` on 2026-10-24. The source of truth stays [03-features/FEATURES.md](03-features/FEATURES.md); regenerate the tables from it. This page explains the state in plain words so work can continue in a new session._

**94 features in total: 42 built and merged · 15 ready to build · 4 waiting on a dependency · 33 blocked by a client answer.**

## How to continue in a new window

1. `git pull` on `main`; `pnpm install`; `pnpm infra:up`; `pnpm db:deploy && pnpm db:seed`; `pnpm dev` (http://localhost:3100).
2. Dev logins: `<role>@dev.logos.test` / `Dev-Pass-12345` (roles: `secretary`, `student-affairs`, `program-coordinator`, `head-of-department`, `lecturer`, `student`, `finance`, `sysadmin`, …; see `prisma/seed`).
3. `node scripts/features.mjs --ready` lists what can be built now. Then `/spec <ID>` and `/build <ID>` (see [CLAUDE.md](../CLAUDE.md)).
4. Tests: `pnpm lint && pnpm typecheck && pnpm i18n:check && pnpm test`. Integration tests need a database whose name ends in `_test` (`TEST_DATABASE_URL`). e2e: `pnpm test:e2e` (uses the dev database and port 3100).
5. One feature per branch `feat/<ID>-<slug>`, commits `<ID>: <summary>`, PR to `main`.

## 1. Built and merged (42)

All of these have a spec in `docs/03-features/specs/`, integration tests against Postgres, and (for user-facing ones) a Playwright spec in `e2e/`.

| ID | Feature | Phase | Depends on | Questions / assumptions |
|---|---|---|---|---|
| PLT-01 | Project scaffolding | P0 | — | — |
| PLT-02 | Docker Compose stack | P0 | PLT-01 | — |
| PLT-03 | Database layer & migrations | P0 | PLT-02 | — |
| PLT-04 | Authentication with Keycloak | P0 | PLT-03 | Q-18, Q-19 |
| PLT-05 | Authorization: roles, permissions, scopes | P0 | PLT-04 | Q-18 |
| PLT-06 | App shell, UI kit & i18n | P0 | PLT-05 | Q-17 |
| PLT-07 | Audit log | P0 | PLT-05 | — |
| IAM-01 | User & role administration | P0 | PLT-06, PLT-07 | Q-18 |
| PLT-08 | File storage | P1 | PLT-05 | Q-26, Q-27 |
| PLT-10 | Data tables, filters & export | P1 | PLT-06 | — |
| PLT-13 | Backups, restore & full data export | P1 | PLT-02, PLT-08 | Q-26, Q-65, Q-66, Q-67, Q-68, Q-69 |
| ORG-01 | Academic years & semesters | P1 | PLT-06, PLT-07 | — |
| ORG-02 | Faculties & departments | P1 | PLT-06, PLT-07 | — |
| ORG-03 | Study cycles & programs | P1 | ORG-02 | — |
| CUR-01 | Course catalog | P1 | ORG-03 | Q-28 |
| CUR-02 | Curriculum plans | P1 | CUR-01, ORG-01 | Q-32 |
| ORG-04 | Cohorts & student groups | P1 | ORG-01, CUR-02 | Q-33 |
| HR-01 | Staff register | P1 | ORG-02, PLT-10 | Q-31 |
| CUR-03 | Syllabi | P1 | CUR-02, PLT-08 | Q-41 |
| CUR-04 | Teaching assignments | P1 | ORG-04, HR-01 | Q-35 |
| STU-01 | Student register | P1 | ORG-04, PLT-10 | Q-34 |
| CAL-01 | Academic calendar | P1 | ORG-01 | Q-29 |
| PLT-12 | Background jobs & scheduler | P2 | PLT-03 | — |
| PLT-11 | Notifications (in-app + email) | P2 | PLT-06, PLT-12 | Q-20 |
| PLT-15 | Forms engine | P2 | PLT-08, PLT-10, PLT-11 | Q-37 |
| NTF-01 | Announcements | P2 | PLT-11 | Q-30 |
| NTF-03 | Targeted messaging to lists | P2 | PLT-10, PLT-11 | Q-20, Q-50, Q-51, Q-52, Q-53, Q-54 |
| STU-02 | Student status changes | P2 | STU-01 | Q-36 |
| STU-03 | Student portal home | P2 | STU-01 | Q-55, Q-56, Q-57, Q-58, Q-59 |
| STU-04 | Student statistics & demographic reports | P2 | STU-01 | Q-34 |
| STU-06 | Secretariat student lists | P2 | STU-02 | Q-36 |
| STU-07 | Student requests (deregistration, recognition) | P2 | PLT-15, STU-02 | Q-70, Q-71, Q-72, Q-73, Q-74 |
| PLT-09 | PDF document engine | P3 | PLT-08 | Q-40 |
| FIN-01 | Fee structure & payment plans | P3 | STU-01 | Q-24, Q-85, Q-86, Q-87, Q-88, Q-89 |
| CAL-02 | Class timetable | P4 | CUR-04 | Q-21, Q-39 |
| CAL-03 | Exam sessions & exam schedule | P4 | CAL-01, CUR-04 | Q-75, Q-76, Q-77, Q-78, Q-79 |
| ATT-01 | Attendance recording | P4 | CUR-04, STU-01 | Q-60, Q-61, Q-62, Q-63, Q-64 |
| ATT-02 | Attendance reports & student absences view | P4 | ATT-01, STU-03 | Q-90, Q-91, Q-92, Q-93, Q-94 |
| HR-07 | Lecturer workspace | P4 | CUR-04, CAL-02 | Q-80, Q-81, Q-82, Q-83, Q-84 |
| HR-03 | Contract expiry tracking | P6 | HR-01, PLT-12 | Q-38 |
| HR-05 | HR lists & reports | P6 | HR-01, CUR-04 | Q-31 |
| CUR-05 | Teaching load report | P6 | CUR-04 | Q-35 |

"Questions / assumptions" are the open-question IDs whose **working assumptions** the code uses. They are non-blocking, but the client has not confirmed them, so each one is a rule that may change.

## 2. Ready to build now (15)

No blocking question and all dependencies are done.

| ID | Feature | Phase | Depends on | Questions |
|---|---|---|---|---|
| IAM-02 | Account provisioning lifecycle | P2 | IAM-01, STU-02, HR-01 | Q-19 |
| ADM-01 | Interest form & leads | P2 | PLT-15, ORG-03 | — |
| ADM-02 | Online application | P2 | PLT-15, ORG-03 | Q-19 |
| ADM-06 | Registration campaign notices | P2 | NTF-01 | Q-24 |
| INT-06 | Website links to public forms | P2 | PLT-15 | Q-06 |
| FIN-02 | Payments & financial status | P3 | FIN-01 | — |
| FIN-03 | Scholarships | P3 | FIN-01, PLT-15 | Q-23 |
| CUR-07 | Approved documents archive | P5 | CUR-03 | — |
| CUR-06 | Curriculum & syllabi package for students | P5 | CUR-03, PLT-09 | — |
| HR-04 | Lecturer attendance & delivered hours | P6 | ATT-01 | Q-22 |
| HR-06 | Performance evaluations | P6 | HR-01, PLT-15 | Q-25 |
| OFF-01 | Staff requests (leave, supplies, certificates, authorizations) | P6 | PLT-15, HR-01 | — |
| QA-01 | Student evaluations of lecturers & administration | P7 | PLT-15, CUR-04 | Q-25 |
| ERS-01 | Erasmus applications | P7 | PLT-15 | — |
| NTF-02 | Events & extracurricular registration | P7 | NTF-01, PLT-15 | — |

**HR-04** shows as ready, but its question **Q-22** is still open, so build it only after reading that question. **FIN-02** was unblocked by FIN-01.

## 3. Waiting on another feature (4)

Not blocked by a question; they start once their dependency is built.

| ID | Feature | Waits for |
|---|---|---|
| ADM-04 | Enrollment of accepted candidates | ADM-02, STU-01 |
| STU-05 | Entry qualifications report | ADM-04 |
| FIN-04 | Payment reminders | FIN-02, PLT-11 |
| FIN-05 | Shared Finance & Secretariat lists | FIN-02 |

## 4. Blocked by an open client question (33)

Do not build these. Each needs the answer to a **blocking** question in [04-open-questions.md](04-open-questions.md). `blocked-dep` means a dependency is itself blocked.

| ID | Feature | State | Depends on | Questions |
|---|---|---|---|---|
| ADM-03 | Application review & candidate ranking | 🔴 blocked | ADM-02 | Q-13 |
| ADM-05 | Student contract & invoicing | 🔴 blocked | ADM-04, FIN-01, PLT-09 | Q-10 |
| EXM-01 | Grading scheme & rules | 🔴 blocked | ORG-01 | Q-11 |
| EXM-02 | Partial assessments | 🟠 blocked-dep | EXM-01, CUR-04, STU-01 | — |
| EXM-03 | Exam eligibility | 🔴 blocked | EXM-02, ATT-01, FIN-02 | Q-12 |
| EXM-04 | Exam registration & rosters | 🟠 blocked-dep | EXM-03, CAL-03 | — |
| EXM-05 | Grade entry, finalization & corrections | 🟠 blocked-dep | EXM-04, PLT-07 | — |
| EXM-06 | Student grades view | 🟠 blocked-dep | EXM-05, STU-03 | — |
| EXM-07 | Academic record & weighted averages | 🟠 blocked-dep | EXM-05 | — |
| EXM-08 | Exam session & backlog reports | 🟠 blocked-dep | EXM-07 | — |
| EXM-09 | Course register & student results list | 🔴 blocked | EXM-07, ATT-02, PLT-09 | Q-08 |
| EXM-10 | Exam record (procesverbal) & grade sheet PDFs | 🔴 blocked | EXM-05, PLT-09 | Q-08 |
| DOC-01 | Certificate requests & status certificate | 🔴 blocked | STU-03, PLT-09 | Q-07 |
| DOC-02 | Grades certificate & transcript | 🔴 blocked | DOC-01, EXM-07 | Q-07 |
| DOC-03 | Attendance certificate | 🔴 blocked | DOC-01, ATT-02 | Q-07 |
| GRD-01 | Graduation clearance | 🟠 blocked-dep | EXM-07, FIN-02, STU-02 | — |
| GRD-02 | Diplomas & supplements | 🔴 blocked | GRD-01, PLT-09, CUR-07 | Q-09 |
| GRD-03 | Official registers | 🔴 blocked | GRD-02 | Q-09 |
| HR-02 | Employment contracts | 🔴 blocked | HR-01, PLT-09 | Q-10 |
| FIN-06 | Staff payment data for F5 | 🔴 blocked | HR-04 | Q-02 |
| QA-02 | Alumni tracking | 🟠 blocked-dep | PLT-15, GRD-01 | — |
| QA-03 | Staff quality indicators | 🔴 blocked | QA-01, HR-06 | Q-15 |
| INT-03 | PLEJADES integration | 🔴 blocked | STU-01 | Q-03 |
| LIB-01 | Library catalogue & online library users | 🔴 blocked | INT-03 | Q-03 |
| LIB-02 | Online library card request | 🔴 blocked | PLT-15 | Q-03 |
| LIB-03 | Library obligations clearance | 🔴 blocked | INT-03 | Q-03 |
| INT-01 | SMIAL integration | 🔴 blocked | STU-01 | Q-01 |
| INT-02 | Financa 5 integration | 🔴 blocked | FIN-02, HR-01 | Q-02 |
| INT-04 | MS Teams integration | 🔴 blocked | IAM-02, CUR-04 | Q-04 |
| INT-05 | Access-control entry/exit report | 🔴 blocked | HR-01 | Q-05 |
| INT-07 | Legacy data migration | 🔴 blocked | STU-01, HR-01, FIN-02, EXM-07 | Q-14 |
| RPT-01 | Combined report builder | 🟠 blocked-dep | STU-04, EXM-07, FIN-05, HR-05 | — |
| PLT-14 | Personal data protection controls | 🔴 blocked | PLT-07, PLT-15 | Q-16 |

### The questions that unblock the most

| Question | Topic | Unblocks |
|---|---|---|
| Q-11 | Grading and assessment rules | EXM-01, and through it all of EXM-02…08, DOC-02, GRD-01…03 |
| Q-12 | Exam eligibility rules | EXM-03 → exam registration and grade entry |
| Q-03 | PLEJADES library system | INT-03, LIB-01, LIB-02, LIB-03 |
| Q-07 | Certificate templates and numbering | DOC-01, DOC-02, DOC-03 |
| Q-02 | Financa 5 integration and payment data | FIN-06, INT-02 |
| Q-10 | Student and staff contract templates | ADM-05, HR-02 |
| Q-08 | Exam document templates | EXM-09, EXM-10 |
| Q-09 | Diploma, supplement and register formats | GRD-02, GRD-03 |
| Q-13 | Admission requirements and ranking | ADM-03 |
| Q-01, Q-04, Q-05, Q-14, Q-15, Q-16 | SMIAL, MS Teams, access control, legacy data, staff-quality metrics, data protection | INT-01, INT-04, INT-05, INT-07, QA-03, PLT-14 |

## 5. What the system can do today

- **Platform:** sign-in via Keycloak, roles/permissions/scopes, audit log, file storage, PDF engine with templates and public verification page (`/verify/<code>`), data tables with filters and Excel/CSV export, background jobs, in-app and e-mail notifications, forms engine, backups and full data export (`/admin/backups`).
- **Organisation and curriculum:** academic years, faculties, departments, programs, cohorts and groups, course catalog, curriculum plans, syllabi, teaching assignments, teaching-load report.
- **Students:** register, status changes, secretariat lists, statistics, student portal home (`/stu/home`), deregistration and recognition requests.
- **Calendar and teaching:** academic calendar (with iCal feed), class timetable, exam sessions and schedule (clash checks, publishing), attendance recording, attendance reports and a student absences view, lecturer workspace (`/hr/teaching`).
- **Communication:** announcements, targeted messages to lists.
- **Finance:** fee structure with installments and discounts, payment plans per student (`/fin/fees`, `/fin/plans`).
- **HR:** staff register, contract expiry tracking, HR lists and reports.

## 6. What the system cannot do yet

- **No grades at all.** Grading rules (Q-11) and eligibility (Q-12) are unanswered, so the whole EXM chain is missing: assessments, exam registration, grade entry, student grades view, academic record, averages, exam-record PDFs.
- **No payments.** FIN-01 defines what is owed; recording payments and a student's financial status (FIN-02) is not built, nor reminders, scholarships, or the shared Finance/Secretariat lists.
- **No admissions pipeline.** Interest form, online application, ranking and enrollment of candidates are not built (ADM-01, ADM-02 are ready; ADM-03 needs Q-13).
- **No student documents.** Certificates, transcripts, diplomas and official registers need template answers (Q-07, Q-08, Q-09).
- **No external integrations** (SMIAL, Financa 5, MS Teams, PLEJADES, access control) and no library module.
- **No account lifecycle** (IAM-02): accounts are created by an administrator, not automatically for new students and staff.
- **Not built, no blocker:** quality evaluations, Erasmus, events, staff requests, performance evaluations, approved-documents archive, curriculum package for students.
- **Not built, other:** combined report builder (RPT-01), personal-data protection controls (PLT-14, needs Q-16), legacy data migration (INT-07).

## 7. Caveats to know before building on this

- **Assumptions are unconfirmed.** Every feature above was built on a *working assumption* recorded as a non-blocking question (for example the 75 % attendance threshold, the 7-day attendance edit window, installment rules, the recognition workflow). Review the open questions with the client; some will change code.
- **Not verified on the final tree.** Features were built in parallel and merged one after another. Each ran lint, typecheck, i18n and the unit/integration suite; e2e was run per feature (its own spec plus a smoke test), and the full Playwright suite was last run when CUR-03 merged (95 passing). Run `pnpm test:e2e` once on current `main`. Pull-request CI results were not observed for the later merges.
- **One e2e test looked flaky:** "lecturer records absences" in `e2e/att-attendance.spec.ts` (toast wait timed out twice, then passed).
- **Production set-up still needed:** the four student-request forms (STU-07) are seeded only in dev/demo; in production create them in the forms admin. No fee amounts, timetable, rooms or sessions are seeded.
- **Hand-edited migrations:** FIN-01 and CAL-03 appended check constraints to the generated SQL. Fresh and test databases get them; an existing dev database may report the migration as modified.
- **Module import cycles:** the HR module imports CUR, CAL, ATT and NTF, which import HR in return. They are used only inside functions and the tests pass, but keep this in mind when adding imports.
- **Test database naming:** the guard requires database names ending in `_test`; it was deliberately left unchanged.
- **Leftover dev databases** named `sekretari_dev_*`, `sekretari_shadow_*`, `sekretari_*_test` from the parallel builds can be dropped.
