# Open questions

Every unknown that affects what we build. A question is **blocking** when a feature cannot be built
correctly without the answer. **Non-blocking** questions have a documented working assumption —
the feature is built configurable around it, and the answer only confirms or adjusts settings.

- Which features each question blocks is defined by the **Questions** column in
  [03-features/FEATURES.md](03-features/FEATURES.md) (only `Blocking: yes` + `open` questions block);
  run `node scripts/features.mjs` to see the impact ranking (how many features each answer would
  unblock).
- To record an answer: run `/answer Q-xx <answer>` in Claude Code, or edit the table (Status →
  `answered`), fill **Answer** in the details, and re-run `node scripts/features.mjs --write`.

Status: `open` | `answered`. Blocking: `yes` | `no`.

## Summary

| ID | Topic | Blocking | Status | Ask |
|---|---|---|---|---|
| Q-01 | SMIAL integration (NIM) | yes | open | Secretariat / IT |
| Q-02 | Financa 5 integration & payment data source | yes | open | Finance / F5 vendor |
| Q-03 | PLEJADES library system | yes | open | Library / PLEJADES vendor |
| Q-04 | MS Teams integration | yes | open | Management / IT |
| Q-05 | Access-control (entry/exit) system | yes | open | Administration / IT |
| Q-06 | LOGOS website platform & form embedding | yes | answered | Marketing / IT |
| Q-07 | Student certificate templates & numbering | yes | open | Secretariat |
| Q-08 | Exam document templates (procesverbal, grade sheet, course register) | yes | open | Secretariat |
| Q-09 | Diploma, supplement and official register formats | yes | open | Secretariat / Rectorate |
| Q-10 | Student contract & employment contract templates | yes | open | Finance / HR / Legal |
| Q-11 | Grading & assessment rules | yes | open | Secretariat / Rectorate |
| Q-12 | Exam eligibility rules | yes | open | Secretariat / Finance |
| Q-13 | Admission requirements & candidate ranking | yes | open | Student Affairs / Secretariat |
| Q-14 | Existing data to migrate | yes | open | Secretariat / IT |
| Q-15 | NJSBC: staff-quality metrics | yes | open | NJSBC |
| Q-16 | Personal data protection requirements | yes | open | Legal / DPO |
| Q-17 | UI language(s) | no | answered | Management |
| Q-18 | Roles: multiple roles, scopes, derived roles, 2FA | no | answered | Management |
| Q-19 | Account lifecycle (candidates, students, alumni) | no | answered | Secretariat / IT |
| Q-20 | Notification channels (email provider, SMS) | no | answered | IT |
| Q-21 | How timetables are produced | no | answered | Secretariat |
| Q-22 | How lecturer delivered hours are recorded & approved | no | open | HR / Finance |
| Q-23 | Scholarship types & effect on fees | no | open | Finance |
| Q-24 | Fee structure & installment rules | no | open | Finance |
| Q-25 | Evaluation questionnaires content | no | answered | NJSBC / HR |
| Q-26 | Hosting & data location | no | answered | Client |
| Q-27 | Uploaded files: size/type limits & retention | no | open | Secretariat / DPO |
| Q-28 | Course categories & credit values | no | open | Secretariat / Heads of department |
| Q-29 | Academic calendar: week numbering & carrying it over | no | open | Secretariat |
| Q-30 | Announcements: who publishes to whom, format, expiry | no | open | Secretariat / Communications |
| Q-31 | Staff register: fields, lists and who sees personal data | no | open | HR / DPO |
| Q-32 | Curriculum plans: totals, versions and approval | no | open | Secretariat / Heads of department |
| Q-33 | Cohorts and student groups: naming, sizes, who maintains them | no | open | Secretariat |
| Q-34 | Student register: student number, NIM, fields and visibility | no | open | Secretariat / DPO |
| Q-35 | Teaching assignments: kinds, load limits and who assigns | no | open | Heads of department / HR |
| Q-36 | Student status changes: allowed transitions and documents | no | open | Secretariat |
| Q-37 | Forms: public submissions, anti-abuse, retention and notifications | no | open | IT / DPO / Secretariat |
| Q-38 | Contract expiry: horizon, who is told and what happens at the end | no | open | HR |
| Q-39 | Timetable: rooms, time slots and clashes | no | open | Secretariat |
| Q-40 | Issued documents: numbering, verification and cancellation | no | open | Secretariat / Legal |
| Q-41 | Syllabi: format, who uploads and approves, carrying forward | no | open | Heads of department / Quality |
| Q-50 | Targeted messages: who may send, consent and opt-out | no | open | Secretariat / Legal |
| Q-51 | Targeted messages: recipient limits and sending rhythm | no | open | Secretariat / IT |
| Q-52 | Targeted messages: templates and placeholders | no | open | Secretariat |
| Q-53 | Targeted messages: people without a portal account | no | open | Secretariat / IT |
| Q-54 | Targeted messages: retention of content and delivery log | no | open | Secretariat / Legal |
| Q-60 | Attendance: hours of a class session | no | open | Secretariat |
| Q-61 | Attendance: edit window and corrections | no | open | Secretariat |
| Q-62 | Attendance: statuses, roster and excused absences | no | open | Secretariat |
| Q-63 | Attendance: creating class sessions | no | open | Secretariat |
| Q-64 | Attendance: who sees what | no | open | Secretariat |

---

## Details

### Q-01 — SMIAL integration (NIM)
- **Context:** SRC-023 — NIM is generated in the Ministry's SMIAL for every person with STUDENT status.
- **Questions:** Does SMIAL offer an API, a file import/export (Excel/CSV/XML), or only manual entry
  in its web UI? Which student data must be sent to SMIAL and when? Who receives the NIM back and how?
- **Working assumption (until answered):** NIM is typed in manually by the Secretariat on the student
  record (STU-01). Only the automated exchange (INT-01) is blocked.
- **Answer:** —

### Q-02 — Financa 5 integration & payment data source
- **Context:** SRC-080, SRC-081 — Finance uses Financa 5; avoid entering students/lecturers twice.
- **Questions:** Is F5 the source of truth for student payments, or should our system be? Does F5
  expose an API, direct DB access, or CSV/Excel import/export? Which direction(s): students & staff
  → F5, payments → us? How is staff payroll data (hours, supplements) handed to F5?
- **Working assumption:** our system holds payment plans and payment status; payments are entered
  manually or imported from an F5 CSV export (FIN-02). Automated sync (INT-02) and the payroll export
  format (FIN-06) are blocked.
- **Answer:** —

### Q-03 — PLEJADES library system
- **Context:** SRC-100…104.
- **Questions:** Does PLEJADES have an API or exports? Is the library card created in PLEJADES? Can
  we read "user has outstanding loans/fines" to use in graduation clearance? Is the online library a
  separate site we just link to?
- **Answer:** —

### Q-04 — MS Teams integration
- **Context:** SRC-024 says "Possibly … MS Teams??".
- **Questions:** Is it in scope? Is LOGOS on Microsoft 365 (Entra ID)? Desired behavior: create
  Teams per course/group? Sync rosters? Single sign-on via Entra ID through Keycloak?
- **Research findings (2026-10-03, to confirm with the client):** LOGOS **is on Microsoft 365**: the MX record of `kulogos.edu.al` is
  `kulogos-edu-al.mail.protection.outlook.com` and SPF includes `spf.protection.outlook.com`.
  So Entra ID SSO through Keycloak (identity brokering, ADR-0004) is technically possible. Still
  open: is Teams integration in scope at all, and if so which behavior (teams per course, roster sync)?
- **Answer:** —

### Q-05 — Access-control (entry/exit) system
- **Context:** SRC-072 — entry/exit report of lecturers linked to the building access system.
- **Questions:** Vendor/product? Can it export events (CSV/API)? How are people identified (card
  number ↔ staff)?
- **Answer:** —

### Q-06 — LOGOS website platform & form embedding
- **Context:** SRC-030, SRC-037, SRC-114, SRC-133 — forms reachable from the website.
- **Questions:** Which platform is the website on (WordPress, custom…)? Who maintains it? Is linking
  to our public form pages enough, or must forms be embedded (iframe) / styled like the site?
- **Working assumption:** public forms live on our domain at `/f/<form-key>` and the website links
  to them — works without any website change. Only the deeper integration (INT-06) is blocked.
- **Answer (2026-10-03):** Link only, no embedding. The website (`http://www.kulogos.edu.al`) is a
  custom static site (Node/Express serving AngularJS 1.5.6 + Bootstrap 4 pages, no CMS); HTTPS does
  not respond and the linked subpages currently return 404. Embedding/styling forms inside it is not
  realistic, so public forms stay on our domain at `/f/<form-key>` and the website only adds links.
  INT-06 reduces to "publish the list of form URLs". To confirm with Marketing/IT: who adds the links.

### Q-07 — Student certificate templates & numbering
- **Context:** SRC-012a–d, SRC-047, SRC-048.
- **Needed:** current templates (Word/PDF samples) for: student status certificate, grades
  certificate, grades & credits certificate (transcript), attendance certificate. Do they need a
  protocol number, signature/stamp image, QR verification? Are there fees for certificates?
- **Answer:** —

### Q-08 — Exam document templates
- **Context:** SRC-014, SRC-015, SRC-041.
- **Needed:** samples of the **procesverbal** (exam record), the grade sheet signed by lecturers, the
  **course register**. Who signs (one lecturer or a commission)? Is the signed paper scanned back?
- **Research findings (2026-10-03, to confirm with the client):** per the [ASCAL EER 2017](https://ascal.al/media/documents/qaa%20eer/Logos%20University%20College%20EER%20AL.pdf) §4.15, a graded paper needed **four signatures**, and exams were
  **not marked anonymously** — ASCAL recommended introducing anonymous marking immediately. Ask
  whether anonymous marking (exam-paper codes) is now in place, since it changes the exam record design.
- **Answer:** —

### Q-09 — Diploma, supplement and official register formats
- **Context:** SRC-040, SRC-059, SRC-111.
- **Needed:** approved diploma and supplement formats (LOGOS + MAS), diploma numbering rules, the
  format of the **Main Register** and **Diploma Register**. Does the Ministry require these in a
  specific format or system?
- **Answer:** —

### Q-10 — Student contract & employment contract templates
- **Context:** SRC-032, SRC-062, SRC-085.
- **Needed:** the student contract with its installment **annex**, and the standard employment
  contract(s) for academic and administrative staff. Which fields are variable?
- **Answer:** —

### Q-11 — Grading & assessment rules
- **Context:** SRC-043, SRC-044, SRC-046.
- **Questions:** Grade scale (4–10?) and pass mark? How is the final grade composed (partial
  assessments %, exam %)? How many exam attempts, and in which sessions? Retake vs. backlog vs.
  improvement — which grade counts (latest, highest)? Can a passed grade be improved, and only in
  autumn? Rounding of averages (decimals)? Are failed attempts shown on transcripts?
- **Research findings (2026-10-03, to confirm with the client):**
  - National scale **4–10**, **4 = fail**; assessment in points (0–100 %) converted to the 4–10
    scale ([Eurydice](https://eurydice.eacea.ec.europa.eu/national-education-systems/albania/bachelor)).
  - LOGOS computes **credit-weighted averages** with the national formula (SRC-046; [ASCAL EER 2017](https://ascal.al/media/documents/qaa%20eer/Logos%20University%20College%20EER%20AL.pdf) §4.14).
  - 2015-16 standard scheme: **30 % midterm, 60 % end-of-semester exam, 10 % seminars** (§4.13).
  - Students may be re-assessed to improve results, "up to three points per year" (§4.13 — wording
    ambiguous: three exams or three grade points?). Formal grade-appeal process exists (§4.12).
  - Sessions: winter, summer, autumn (SRC-049); autumn grade improvement (SRC-044).
  - Still needed: current **Rregullore** / student handbook — the % → grade conversion table, which
    grade counts after retake/improvement, rounding, attempts per year. The 2017 rules may be outdated.
- **Answer:** —

### Q-12 — Exam eligibility rules
- **Context:** SRC-014, SRC-049 — "students who closed all academic and financial obligations".
- **Questions:** Which **academic** obligations: minimum attendance % (lecture/seminar separately?),
  passed partial assessments, coursework? Which **financial** obligations: all installments due
  before the session date? Fee for backlog exams? Can the Secretariat override with a reason?
- **Research findings (2026-10-03, to confirm with the client):** **75 % attendance** is required to be admitted to an exam ([ASCAL EER 2017](https://ascal.al/media/documents/qaa%20eer/Logos%20University%20College%20EER%20AL.pdf) §4.13–4.14).
  Financial clearance is checked per session — winter/summer/autumn (SRC-049). Still open: lecture vs.
  seminar attendance counted separately? Which installments must be paid? Override allowed?
- **Answer:** —

### Q-13 — Admission requirements & candidate ranking
- **Context:** SRC-114 — standardized formats for admission, registration, ranking by cycle and category.
- **Questions:** Required documents per cycle; ranking criteria and formula (high-school average,
  state matura, bachelor average for master); candidate categories (quotas?); capacity per program;
  publication of rankings.
- **Answer:** —

### Q-14 — Existing data to migrate
- **Questions:** Where are current students, grades, staff, payments kept (Excel, old system, paper)?
  How many students (active + alumni) and staff? How many past years must be migrated?
- **Research findings (2026-10-03, to confirm with the client):** in 2017 LOGOS already had an **online system** giving each student their
  timetable, grades and notices, and was developing an electronic student-records system ([ASCAL EER 2017](https://ascal.al/media/documents/qaa%20eer/Logos%20University%20College%20EER%20AL.pdf)
  §2.11, §3.8). Older site domain: `shlplogos.edu.al`. 2016-17 size: 336 first-cycle + 39
  second-cycle students. Ask: which system is it today, who built it, can it export data?
- **Answer:** —

### Q-15 — NJSBC: staff-quality metrics
- **Context:** SRC-123 "Staff quality" — no detail in the source.
- **Questions:** What should be measured and reported (evaluation scores, qualifications,
  publications, trainings)? At what level (department/faculty/institution)?
- **Answer:** —

### Q-16 — Personal data protection requirements
- **Context:** SRC-150, SRC-152.
- **Questions:** Who is the Data Protection Officer? Retention periods per data type (applications
  of non-enrolled candidates, alumni data, survey data)? Consent texts for public forms? Any
  requirement from the Albanian data protection authority (IDP) on processing records?
- **Research findings (2026-10-03, to confirm with the client):** the legal framework is **Law No. 124/2024 "On personal data protection"**,
  aligned with the GDPR; in force since **1 Feb 2025** (it repealed Law 9887/2008), with some
  provisions applying from **17 Jan 2027**. Supervisory authority: **IDP** (Information and Data
  Protection Commissioner) — [law text](https://idp.al/wp-content/uploads/2025/03/Law-no.124-2024.pdf).
  Design implication: build to GDPR-level requirements (records of processing, data-subject rights,
  retention, breach logging). Still open: DPO, retention periods, consent texts.
- **Answer:** —

### Q-17 — UI language(s)
- **Working assumption:** UI in English first, built with i18n so Albanian can be added/made
  default without code changes (ADR-0011). Official documents in Albanian.
- **Answer (2026-10-03):** **Albanian (`sq`) is the default UI language**, English (`en`) the second
  locale, user-switchable. All users are Albanian staff/students and the LOGOS website already runs
  with the `sq-al` locale. Official documents in Albanian (+ English where the template requires it,
  e.g. the diploma supplement). Follow-up: ADR-0011 and vision.md still say "`en` default".

### Q-18 — Roles: multiple roles, scopes, derived roles, 2FA
- **Working assumption:** a user can hold several roles; roles can be scoped to faculty /
  department / program; "head of department", "program coordinator" and "Erasmus officer" exist as
  roles; 2FA mandatory for `sysadmin`, optional for others ([roles.md](01-product/roles.md)).
- **Answer (2026-10-03):** Working assumption adopted as the design — it is an internal design
  decision and the model supports single-role use too, so no client input changes it.

### Q-19 — Account lifecycle
- **Working assumption:** candidates have **no account** (public forms + email updates); a student
  account is created at enrollment; accounts are disabled on graduation/deregistration (alumni use
  public forms, SRC-037); staff accounts created by HR/sysadmin. Usernames = email; do students get
  an institutional email?
- **Answer (2026-10-03):** Working assumption adopted — it follows directly from SRC-030 and SRC-037
  (candidates and alumni use public forms without logging in). Login identifier = email. Remaining
  detail, not blocking: whether students get a `@kulogos.edu.al` Microsoft 365 mailbox or use a
  personal email (the email field is the same either way).

### Q-20 — Notification channels
- **Working assumption:** email (institution's SMTP) + in-app notifications. SMS not included.
- **Questions:** Which SMTP/provider (Microsoft 365, Google, other)? Is SMS needed (payment
  reminders)?
- **Answer (2026-10-03):** Email via the institution's **Microsoft 365 / Exchange Online** (MX of
  `kulogos.edu.al` points to `mail.protection.outlook.com`) — SMTP AUTH or Microsoft Graph, through
  a configurable mail adapter, plus in-app notifications. **No SMS in v1**; the payment reminders
  of SRC-086 go by email + in-app. SMS can be added later behind the same notification interface.

### Q-21 — How timetables are produced
- **Working assumption:** the Secretariat enters the weekly timetable per group in the system (or
  imports a CSV); no automatic scheduling.
- **Answer (2026-10-03):** Working assumption adopted — matches the non-goal in
  [vision.md](01-product/vision.md) (timetables are entered, not solved).

### Q-22 — Lecturer delivered hours
- **Context:** SRC-061, SRC-066, SRC-080c.
- **Working assumption:** a class session marked "held" by the lecturer (when taking attendance)
  counts its hours as delivered; the head of department approves monthly; approved hours feed the
  HR/Finance reports.
- **Answer:** —

### Q-23 — Scholarship types & effect on fees
- **Working assumption:** scholarship = full (100%) or partial (percentage) reduction of tuition for
  one academic year; reduces the installments of that year's payment plan.
- **Research findings (2026-10-03, to confirm with the client):** per the [ASCAL EER 2017](https://ascal.al/media/documents/qaa%20eer/Logos%20University%20College%20EER%20AL.pdf) §5.4, LOGOS has scholarships for **excellent students**,
  **students in need** and **students with disabilities**. Excellence scholarship by average grade:
  **50 %** of the fee for 9.1–9.5, **80 %** for 9.6–9.8, **100 %** for 9.8–10. Finance administers
  them in their finance program. Consistent with the working assumption; bands should be configurable.
- **Answer:** —

### Q-24 — Fee structure & installment rules
- **Working assumption:** fees configured per program × academic year × fee type; each student's
  payment plan copies the schedule from their contract annex; preferential (early) fees configured
  as date-bound discounts.
- **Answer:** —

### Q-25 — Evaluation questionnaires content
- **Working assumption:** questionnaires are configured in the forms engine by NJSBC/HR; scoring =
  average of 1–5 scale questions.
- **Answer (2026-10-03):** Working assumption adopted — the forms engine (ADR-0009) is ours; the
  question content is configuration that NJSBC/HR enter before go-live, so it blocks nothing.

### Q-28 — Course categories & credit values
- **Questions:** Which course categories does LOGOS use in its curriculum plans (SRC-013 names a
  "course category")? For example compulsory / elective / general / professional / practice /
  thesis — and which of them carry special rules (e.g. electives chosen by the student)? Are credits
  always whole numbers, or are half credits used? What is the largest number of weekly hours per
  type?
- **Working assumption:** categories are a list the administrators maintain (code, Albanian and
  English name, active) — nothing is hard-coded; no special rules are attached to a category in
  CUR-01 (the elective flag is a property of the plan entry in CUR-02). Credits are whole numbers
  0–60 and hours whole numbers 0–500 per type.
- **Impact:** only the initial category list and the numeric limits (constants in one file).

### Q-27 — Uploaded files: size/type limits & retention
- **Questions:** What is the largest file a candidate, student or staff member may upload, and
  which formats are acceptable (PDF only? images? Office documents)? How long must uploaded
  documents (application papers, signed records, contracts) be kept, and what happens to them when a
  candidate is rejected or a student leaves? Is antivirus scanning required?
- **Working assumption:** 10 MB per file; PDF, JPEG and PNG (plus DOCX/XLSX for staff purposes) —
  all configurable per upload purpose in code; no virus scanning; files are never deleted once
  attached (soft-deleted only); unattached uploads older than 24 h are purged. Retention periods
  follow the answer to Q-16.
- **Impact:** only configuration values (per-purpose limits) and the cleanup/retention job.

### Q-26 — Hosting & data location
- **Answer (2026-10-03):** Deployment is not a concern for the documentation phase; the client will
  comply with the data-location requirements (SRC-150). The stack stays host-agnostic (Docker
  Compose, no third-party storage of personal data).

---

## Decisions log

Decisions taken in conversation that aren't architecture ADRs.

| Date | Decision |
|---|---|
| 2026-10-03 | Documentation language: **English**. |
| 2026-10-03 | Documentation approach: tool-agnostic spec-driven Markdown (ADR-0001). |
| 2026-10-03 | No deadline pressure — build in roadmap order, phase by phase. |
| 2026-10-03 | Stack: Next.js + PostgreSQL, Keycloak for authentication, Docker for deployment. |
| 2026-10-03 | Answered internally: Q-06, Q-17, Q-18, Q-19, Q-20, Q-21, Q-25. Research findings (DNS, LOGOS website, ASCAL 2017 report, Law 124/2024) added to Q-04, Q-08, Q-11, Q-12, Q-14, Q-16, Q-23 — to confirm with the client. |

### Q-29 — Academic calendar: week numbering & carrying it over
- **Context:** SRC-025 — the calendar is "organized by weeks"; the Secretariat prepares a new one each year.
- **Questions:** Is week 1 the first week of the academic year, the first teaching week, or the first
  week of each semester? Which weekday does a week start on? When a new year's calendar is prepared
  from the previous one, should the dates move by whole weeks (keeping weekdays), or are all dates
  entered again? Which event types are needed besides teaching week, holiday, deadline, exam period,
  registration period and general event?
- **Working assumption:** weeks run Monday to Sunday; week 1 is the week containing the academic
  year's start date and numbering continues through the year. Copying a calendar moves each date by
  the whole number of weeks closest to the difference between the two year start dates (weekdays are
  kept). The six event types above are a fixed list in code.
- **Impact:** only the week-numbering helper and the copy shift (one pure module) and the type list.

### Q-30 — Announcements: who publishes to whom, format, expiry
- **Context:** SRC-033, SRC-035, SRC-036c — notices, open lectures, workshops, registration deadlines.
- **Questions:** Which offices may publish to everyone, and which only to their own faculty,
  program or department? Is plain text enough or are formatting (bold, lists, links) and images
  needed? Should notices expire by default (e.g. after the event date)? Must a notice be approved
  before it appears? Which audiences matter besides everyone, staff, students, cycle and program
  (faculty, year of study, group)? Should the public website show announcements (needs a rate-limited
  public endpoint, not built yet)?
- **Working assumption:** offices with the publish permission may publish to everyone, staff,
  students and a cycle when their role is institution-wide, and to a program only inside their own
  scope; text is plain (line breaks kept, no HTML); no default expiry (the author sets one); no
  approval step; audiences are those five. A website feed is not provided.
- **Impact:** audience list, the format of the body, defaults — not the structure.

### Q-31 — Staff register: fields, lists and who sees personal data
- **Context:** SRC-027, SRC-060, SRC-062, SRC-063 — lecturers (PAE internal full-time, PAK external
  part-time), administrative staff, data for the employment contract and for Finance.
- **Questions:** Which data must be kept for every staff member (national ID number, birth date and
  place, address, phone, bank details, social-security number)? Are degrees and titles chosen from a
  fixed list (which?) or typed? Can one person work in several departments? Which categories exist
  besides PAE, PAK and volunteer? Which offices may see national ID, birth date and address
  (Finance? Heads of department?) and who only the qualifications? How should the existing staff
  list be loaded (Excel columns)?
- **Working assumption:** a staff record holds name, father's name, gender (female/male), birth
  date, national ID number (optional, unique), phone, e-mail, address, kind, category, degree and
  title (typed text), one department, retired flag, primary employer (external staff), contract
  start (required) and end (optional). HR and the sysadmin see national ID, birth date and address;
  every other reader sees the rest. Heads of department see their department's staff; a staff member
  sees only their own record. The import uses the template columns shown on the import page.
- **Impact:** field list, controlled lists for degree/title, visibility of personal fields.

### Q-32 — Curriculum plans: totals, versions and approval
- **Context:** SRC-013, SRC-026, SRC-110, SRC-111/112 — the 1/2/3-year plan per program and cohort,
  approved plans kept as an archive.
- **Questions:** How many credits per semester and per year must a plan have (30 / 60 / 180 / 120?),
  and is a plan with other totals refused or only warned about? May the same course appear twice in a
  plan (e.g. a two-semester course)? Who approves a plan (head of department, program coordinator,
  the academic council) and is the decision recorded elsewhere? How are electives grouped (choose N
  from a list)? Can an approved plan be corrected, or only replaced by a new version?
- **Working assumption:** 30 credits per semester (setting `cur.plan.creditsPerSemester`) and the
  program's total credits for the whole plan; deviations are warnings, never blockers; a course
  appears at most once per plan; the head of department or program coordinator of the program (or
  the sysadmin) approves, and the approval records who and when; electives are a simple flag with no
  grouping rule; an approved plan is immutable and is replaced by a new version.
- **Impact:** the credit thresholds, the duplicate-course rule, who approves, elective grouping.

### Q-33 — Cohorts and student groups: naming, sizes, who maintains them
- **Context:** SRC-011, SRC-013 — students are divided into groups; a cohort follows one curriculum plan.
- **Questions:** How are cohorts named (by intake year, e.g. "2026", with a suffix for evening or
  part-time intakes)? How are groups named and how large may a group be (a maximum per lecture,
  seminar, laboratory)? How many groups per year of study are created at the start of a year? Who
  creates cohorts and groups (secretariat, student affairs, program coordinators)? Can a cohort be
  moved to another plan version after it has started?
- **Working assumption:** a cohort has a free name (default the start year code) and is unique per
  program and start year by name; groups have a free name (default "Grupi 1") and an optional
  capacity that is informational (not enforced); the "start of year" tool creates one default group
  per cohort and expected year of study; sysadmin, secretary and student affairs create and change
  cohorts and groups (the others read); a cohort's plan can be changed to another approved plan of
  the same program, with a reason, as long as the cohort has no students (checked once STU-01 exists).
- **Impact:** default names, who writes, the plan-change rule.

### Q-34 — Student register: student number, NIM, fields and visibility
- **Context:** SRC-012, SRC-020, SRC-023, SRC-040 — the Main Register; NIM comes from the Ministry's SMIAL (Q-01).
- **Questions:** What is the format of the internal student number (sequence, year prefix, program
  code)? What does a NIM look like (length, characters) and is it always present for a registered
  student? Which personal data must the register hold beyond name, father's name, gender, birth date
  and place, national ID number, phone, e-mail, address and residence (e.g. citizenship, nationality,
  parent contacts, photo)? Which offices may see national ID number, birth date and address? Can a
  student be enrolled in two programs at the same time (second program, double degree)?
- **Working assumption:** the internal student number is a zero-padded sequence of 6 digits
  (`000001`, `000002`, …) generated by the database and never reused; the NIM is typed text up to 30
  characters (upper case, unique, optional) until the SMIAL exchange (INT-01); the personal fields are
  those listed, with national ID, birth date and address visible only to the Secretariat, Student
  Affairs and the sysadmin; a student may hold one ACTIVE or SUSPENDED enrollment per program and
  several programs at once (second program is a registration type).
- **Impact:** number format, NIM validation, field list, visibility.

### Q-35 — Teaching assignments: kinds, load limits and who assigns
- **Context:** SRC-026, SRC-027, SRC-066 — the curriculum plan names the lecturer; hours delivered are recorded per lecturer.
- **Questions:** Are lectures, seminars and laboratory sessions always assigned separately (and can
  one course have several lecturers of the same kind)? What is the maximum teaching load of a
  full-time (PAE) and of a part-time (PAK) lecturer, per semester or year, and is it counted in
  hours or in credits? May administrative staff or volunteers teach? Who assigns lecturers (head of
  department, the Secretariat) and is an approval needed? Do co-lecturers of one course share the
  planned hours or each carry the full hours?
- **Working assumption:** an assignment is one lecturer for one kind (lecture, seminar or
  laboratory) of one plan course in one group, with its planned hours (default: the plan course's
  hours for that kind); several lecturers per kind are allowed and each carries the hours entered;
  only active academic staff can be assigned; the load limit is a setting
  (`cur.teaching.maxPlannedHours`, annual planned hours) that is **off by default** and only warns;
  the head of department (own department), the Secretariat and the sysadmin assign, without approval.
- **Impact:** the kinds, the load limit and its unit, who may be assigned and who assigns.

### Q-36 — Student status changes: allowed transitions and documents
- **Context:** SRC-053, SRC-054, SRC-059 — lists of deregistered and suspended students; graduation closes the studies.
- **Questions:** Which changes exist (suspension, resumption, deregistration, transfer to another
  program, graduation) and which are reversible — can a deregistered student be reinstated? Is a
  document required for each (a student request, a decision number)? What must be settled before
  graduation (grades, fees)? May a suspension be backdated? Who may perform each change?
- **Working assumption:** allowed: ACTIVE → SUSPENDED, DEREGISTERED or GRADUATED; SUSPENDED →
  ACTIVE (resumption) or DEREGISTERED; DEREGISTERED and GRADUATED are final; a transfer closes the
  enrollment as DEREGISTERED and opens a new ACTIVE one of type TRANSFER in the other program; every
  change needs a reason and an effective date (not before the enrollment's start or the previous
  change) and may carry a document reference (free text); graduation is recorded by the Secretariat
  without automatic checks until EXM/FIN exist; the Secretariat and Student Affairs perform changes.
- **Impact:** the transition table, required documents, graduation preconditions.

### Q-37 — Forms: public submissions, anti-abuse, retention and notifications
- **Context:** SRC-037, SRC-133 — forms are opened from the LOGOS website without logging in; their data flow into the system (ADR-0009).
- **Questions:** Which forms are public (no login) and which need a login? Is a CAPTCHA required
  (which service is acceptable for personal data)? How long are submissions kept, and what happens to
  the personal data of rejected or abandoned ones (Q-16)? Must an anonymous submitter get an e-mail
  confirmation and status updates? May public forms carry file uploads (documents, photos), and of
  what size and type? Who sees the submissions of each form?
- **Working assumption:** a form's definition says whether it is public or needs a login; public
  forms are protected by a hidden honeypot field and a rate limit (5 submissions per IP and form per
  10 minutes) — no CAPTCHA yet; submissions are kept (soft states only), retention follows Q-16;
  anonymous submitters get a reference code on screen only; logged-in submitters are notified of
  state changes; file fields are available in logged-in forms only; each definition names the roles
  that handle its submissions (plus the sysadmin).
- **Impact:** CAPTCHA, retention, anonymous e-mails, public file uploads.

### Q-38 — Contract expiry: horizon, who is told and what happens at the end
- **Context:** SRC-061 — the system lists the academic staff whose engagement ended according to the contract end date.
- **Questions:** How many days ahead should HR be warned about a contract ending? Who is told (HR
  only, the head of department too)? How often? Should the staff member's account be disabled
  automatically after the end date, and the person removed from the lecturer lists? Are open-ended
  contracts (no end date) normal, and how are renewals recorded (HR-02)?
- **Working assumption:** warning horizon 60 days (setting `hr.contractHorizonDays`); HR users are
  notified once a week (Monday 07:00 Europe/Tirane) when something ended or is about to end; staff
  without an end date never expire; nothing changes automatically — HR ends the employment by hand
  (and IAM-02 will later disable the account on that event).
- **Impact:** the horizon, recipients and rhythm; automatic effects.

### Q-39 — Timetable: rooms, time slots and clashes
- **Context:** SRC-034, SRC-036d — class timetable; Q-21 says the Secretariat enters it.
- **Questions:** Does LOGOS have fixed time slots (e.g. 45-minute periods) or free start/end times?
  Is there a list of rooms with capacities, and must a room be booked once? May a lecturer teach
  several groups together (a joint class)? Which weekdays are used (Saturday)? Is a clash ever
  allowed with a warning?
- **Working assumption:** free start and end times; rooms are free text compared without regard to
  case; every clash of group, lecturer or room is refused; joint classes are not modelled; all seven
  weekdays are allowed.
- **Impact:** fixed slots, room master data, joint classes.

### Q-40 — Issued documents: numbering, verification and cancellation
- **Context:** SRC-012, SRC-059 — certificates, transcripts, exam records, contracts and diplomas are issued as official documents (ADR-0007); their layouts and numbering depend on Q-07…Q-10.
- **Questions:** What is the numbering scheme of each document type (prefix, year, sequence, a
  register book)? Does the sequence restart each year or run on? Must documents carry a QR code that
  anyone can scan to confirm them, and what may that page show? Can an issued document be cancelled
  or replaced, and how is that marked? Which signatures/stamps are printed?
- **Working assumption:** number = `<PREFIX>-<year>-<5-digit sequence>`, the sequence per type and
  calendar year, no gaps reused; each document gets a random verification code and a QR code to
  `/verify/<code>` that shows only the type, number and date of issue and whether it is still valid;
  an issued document is never edited — it can be cancelled with a reason (the verification page then
  says so); signatures and stamps are part of the template.
- **Impact:** the number format per type, the verification page content, cancellation rules.

### Q-41 — Syllabi: format, who uploads and approves, carrying forward
- **Context:** SRC-055, SRC-110, SRC-112 — the curriculum plan and the syllabi of each program for each academic year are kept, approved and archived; students ask for them (further studies, employment).
- **Questions:** Is a syllabus a document the lecturer or department writes (PDF/Word) or a structured form (objectives, contents, literature, assessment…)? Who uploads (the lecturer, the head of department, the program coordinator) and who approves? Is a syllabus re-approved every academic year or only when it changes? Must students see it before enrolling?
- **Working assumption:** version 1 stores a PDF per course of an approved plan and academic year (the structured form is a later increment); the program coordinator, the head of department (inside their scope) and the sysadmin upload and approve; each upload is a new version, approving a version archives the previous one; the previous approved syllabus of the course can be carried forward into a new year as a draft that still needs approval; approved syllabi are readable by everyone who may see the plan, students included; drafts and archived versions only by staff.
- **Impact:** the format (a structured form would need its fields), the roles that upload and approve, the carry-forward rule.

### Q-50 — Targeted messages: who may send, consent and opt-out
- **Context:** SRC-057 — contact the students of a list (e.g. backlog students) about sessions and academic and financial obligations; NTF-03.
- **Questions:** Which offices may message which lists? Must students consent to e-mail from the college, and may they switch it off? Are obligation notices (fees, exam sessions) mandatory?
- **Working assumption:** sending needs `ntf.message.send` (system administrator, secretary, student affairs, finance, HR, administration, head of department, program coordinator) **and** read access to the list the recipients come from, so the list's own scope limits who can be reached. A message is a normal (optional) notification type: everyone gets the in-app notice, the e-mail follows the recipient's preference (default on). Nothing is mandatory.
- **Impact:** the sender roles, a mandatory type for obligations, an unsubscribe rule.

### Q-51 — Targeted messages: recipient limits and sending rhythm
- **Context:** NTF-03; the Microsoft 365 mailbox has sending limits (Q-20).
- **Questions:** Largest audience of one message? Daily mail quota of the mailbox? May the same person be messaged repeatedly?
- **Working assumption:** at most 2 000 recipients per message (narrow the filters otherwise), sent in batches of 200 by a background job; no per-day quota and no throttling of repeated messages in v1.
- **Impact:** the cap, throttling, approval for large audiences.

### Q-52 — Targeted messages: templates and placeholders
- **Context:** NTF-03 — "compose with templates/placeholders".
- **Questions:** Which standard texts does the Secretariat use (session reminder, obligation notice…)? Which personal data may a text contain? Are templates shared or personal?
- **Working assumption:** no official wording is shipped. Senders save their own templates (name, subject, text) which every sender sees and which are archived, never deleted. Placeholders are only `{firstName}`, `{lastName}` and `{fullName}`; any other `{…}` is refused. Plain text, no attachments, no reply handling.
- **Impact:** a list of official templates, more placeholders (student number, program, amount due), attachments.

### Q-53 — Targeted messages: people without a portal account
- **Context:** NTF-03; students and staff exist as persons before their account is provisioned (IAM-02).
- **Questions:** Should the college write to the personal e-mail kept on the person record when there is no account?
- **Working assumption:** only portal users are reached (in-app notice + e-mail to the account address). People without an account are kept in the delivery log as "no account" and nothing is sent to the address on the person record.
- **Impact:** a second delivery path to the personal e-mail address.

### Q-54 — Targeted messages: retention of content and delivery log
- **Context:** NTF-03 — delivery log; the content may refer to a person's obligations.
- **Questions:** How long are sent messages and their per-person delivery results kept? Who may read them?
- **Working assumption:** kept indefinitely (no hard deletes); the sender sees the messages they sent and system administrators (holders of `plt.audit.read`) see all; the log stores person ids and delivery state only, never the e-mail address.
- **Impact:** retention period, wider access (e.g. head of office).

### Q-60 — Attendance: hours of a class session
- **Context:** SRC-043, HR-04 delivered hours — a class session carries the hours it counts for.
- **Questions:** How long is an academic hour (45 minutes?) and are fractions of an hour allowed? Must
  the hours of a session equal the timetable slot, or may the lecturer change them?
- **Working assumption:** whole hours (1–12) per session; an academic hour is 45 minutes, so a session
  generated from the timetable defaults to `round(minutes / 45)` (at least 1); the lecturer may change it.
- **Impact:** the default, fractional hours, the input of HR-04.

### Q-61 — Attendance: edit window and corrections
- **Context:** SRC-043 — absences are stored and may be modified in case of error.
- **Questions:** For how many days after a class may the lecturer still enter or change attendance?
  Who may correct later, and must a reason be given? May attendance be entered for a class that has not happened yet?
- **Working assumption:** the lecturer may enter and change the attendance of their own session from
  the day of the class until 7 days after it (setting `att.editWindowDays`, whole days, 0 or more);
  not before the class day; after that only the Secretariat, always with a written reason, audited;
  nobody once the academic year is closed.
- **Impact:** the window length, who corrects, the reason rule.

### Q-62 — Attendance: statuses, roster and excused absences
- **Context:** SRC-036b, SRC-043 — the roster of a group is marked present, absent or excused.
- **Questions:** Who decides that an absence is excused and is a document needed? Does an excused
  absence count as absence in the attendance percentage (Q-12, ATT-02)? Which students are on the
  roster (suspended ones, students who changed group)?
- **Working assumption:** the lecturer (or the Secretariat) marks present / absent / excused with an
  optional note, no document; ATT-01 only records the status, how it counts is decided in ATT-02 with
  Q-12; the roster is the students with an active enrollment whose yearly registration in the session's
  academic year is in the group, as of saving; every roster student gets a mark on save.
- **Impact:** the roster rule, who sets excused, counting.

### Q-63 — Attendance: creating class sessions
- **Context:** SRC-043 — attendance is entered per class.
- **Questions:** Should sessions appear automatically from the timetable, and what about holidays
  and cancelled classes? May lecturers add extra classes (make-up, replacements)?
- **Working assumption:** a lecturer (or the Secretariat) generates the sessions of an assignment for
  a date range from its timetable slots (at most 120 days, existing ones skipped, holidays are not
  excluded automatically — a class that did not take place is marked cancelled); extra classes are
  added by hand (date, time, hours, topic); sessions are never deleted, only cancelled.
- **Impact:** automatic generation, holiday handling, deletion.

### Q-64 — Attendance: who sees what
- **Context:** SRC-036b, SRC-070 — students see their absences, lecturers theirs, staff reports.
- **Questions:** May a lecturer see the attendance of colleagues' classes in the same group? May a
  student see the excused status and notes? Do program coordinators and heads see their programs?
- **Working assumption:** a lecturer sees and records only sessions of their own assignments; the
  Secretariat reads and corrects all; heads of department and program coordinators read the sessions
  of their scope; a student sees only their own absent and excused marks (with the status, without notes).
- **Impact:** visibility of notes and of colleagues' classes.
