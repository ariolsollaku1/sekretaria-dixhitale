# STU — Student records

Code: `src/modules/stu`. Entities: [domain model](../../02-architecture/domain-model.md#stu--adm--students--admissions).

### STU-01 — Student register
- **Goal:** the master record of every student — the system's "Main Register" data (SRC-012,
  SRC-020, SRC-040).
- **Users:** secretary (write), student-affairs (write personal data), others read per scope.
- **Scope:** `Person` + `Student` + `Enrollment` + `YearRegistration`; student list with filters
  (program, cycle, year of study, group, status, gender, residence, academic year); student detail
  page with tabs (personal data, enrollments, yearly registrations, status history; later tabs from
  other modules: grades, attendance, finance, documents); create a student manually (in addition to
  ADM-04); **NIM entered manually** (unique) until INT-01; internal student number generated.
- **Rules:** personal data changes audited; NIM unique; one ACTIVE enrollment per program.

### STU-02 — Student status changes
- **Goal:** suspension, deregistration, transfer, resumption, graduation as audited events
  (SRC-053, SRC-054, SRC-059).
- **Scope:** status transition actions with reason, effective date and optional document; allowed
  transitions in `domain/` (state machine); history tab; effects hooks (e.g. IAM-02 disables account,
  FIN stops future installments — via events).

### STU-03 — Student portal home
- **Goal:** students see their own data online (SRC-036).
- **Scope:** dashboard: profile (read-only + request correction), program/cohort/group/year, status,
  shortcuts to grades, absences, timetable, calendar, requests, notifications; later modules add
  widgets (obligations summary, upcoming exams, installments).

### STU-04 — Student statistics & demographic reports
- **Goal:** name lists and statistics by cycle, program, year of study, residence, age, gender, etc. (SRC-021).
- **Scope:** pivot-style counts (rows × columns × filters) and name lists via PLT-10; export Excel.

### STU-05 — Entry qualifications report
- **Goal:** report of the high-school results first-year students bring (SRC-022).
- **Scope:** per program/cohort: list + distribution of high-school averages (from the
  application), averages by program; export.

### STU-06 — Secretariat student lists
- **Goal:** standard yearly lists (SRC-051, SRC-053, SRC-054).
- **Scope:** registered at start of year by type (first time / second program / transfer);
  deregistered during the year by cycle/program/faculty; suspended in the year. Each list:
  filters, counts, export.

### STU-07 — Student requests (deregistration, recognition)
- **Goal:** forms for deregistration and recognition of prior documents/studies (SRC-037b, SRC-037c).
- **Scope:** form definitions in PLT-15 (public + in-portal); Secretariat inbox; approval of a
  deregistration triggers STU-02 transition; recognition decision records recognized courses/credits
  (stored for EXM-07).
