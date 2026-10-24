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
| Q-65 | Full data export: contents, format and what is left out | no | open | IT / DPO |
| Q-66 | Backups: frequency, retention, recovery targets | no | open | IT / Management |
| Q-67 | Backups: off-site copy, encryption and who runs `pg_dump` | no | open | IT / Client host |
| Q-68 | Backup and integrity failures: who is alerted | no | open | IT |
| Q-69 | Export download: who may export and can it contain personal data | no | open | DPO / Management |
| Q-55 | Student portal: requesting a correction of own data | no | open | Secretariat |
| Q-56 | Student portal: which curriculum courses a student sees | no | open | Academic Affairs |
| Q-57 | Student portal: access after the studies end (suspended, deregistered, graduated) | no | open | Secretariat / Management |
| Q-58 | Student portal: how much the home page shows (horizons and counts) | no | open | Secretariat |
| Q-59 | Student portal: where the home page lives | no | open | Secretariat |
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
| Q-75 | Exam sessions: kinds, dates and who sets them | no | open | Secretariat / Academic Affairs |
| Q-76 | Mini-session: which students and which courses | no | open | Secretariat / Academic Affairs |
| Q-77 | Exam schedule: one exam per course, clashes and electives | no | open | Secretariat |
| Q-78 | Exam schedule: publication, changes after publication and notices | no | open | Secretariat |
| Q-79 | Exam schedule: examiners and rooms | no | open | Secretariat |
| Q-70 | Deregistration request: effective date, which enrollment, fees | no | open | Secretariat / Finance |
| Q-71 | Student requests: identifying a requester who is not logged in | no | open | Secretariat / DPO |
| Q-72 | Recognition of documents: who decides and on what basis | no | open | Secretariat / Academic board |
| Q-73 | Recognized courses: how they are recorded and used | no | open | Secretariat / Academic board |
| Q-74 | Student requests: attachments and the forms' texts | no | open | Secretariat |
| Q-85 | Fees: currency, amounts and what a fee depends on | no | open | Finance |
| Q-86 | Fees: installments of a fee | no | open | Finance |
| Q-87 | Fees: early-payment and preferential discounts | no | open | Finance |
| Q-88 | Payment plans: who gets one and when | no | open | Finance |
| Q-89 | Payment plans: adjusting a student's installments | no | open | Finance |
| Q-90 | Attendance: how the percentage is computed | no | open | Secretariat |
| Q-91 | Attendance: threshold and what it applies to | no | open | Secretariat |
| Q-92 | Attendance: which classes and marks count | no | open | Secretariat |
| Q-93 | Attendance: what the student sees of the percentage | no | open | Secretariat |
| Q-94 | Attendance: who may run the reports and the period | no | open | Secretariat |
| Q-80 | Lecturer workspace: who gets it | no | open | Rectorate / HR |
| Q-81 | Lecturer workspace: what a lecturer sees of a roster | no | open | Secretariat |
| Q-82 | Lecturer workspace: "this semester" | no | open | Secretariat |
| Q-83 | Lecturer workspace: grades and absences views | no | open | Secretariat |
| Q-84 | Lecturer workspace: location and dashboard card | no | open | Secretariat |

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

### Q-65 — Full data export: contents, format and what is left out
- **Context:** SRC-151 — data must be convertible to standard programmes for migration (PLT-13).
- **Questions:** Is "CSV per table + JSON Lines + the original files in one ZIP" enough as the open
  format? Should an Excel version also be produced? Which data must be left out?
- **Working assumption:** one ZIP: `csv/<table>.csv` (UTF-8, header row, empty field = no value),
  `jsonl/<table>.jsonl` (one JSON object per line, exact values), `files/` with every stored file,
  `manifest.json` with row counts and SHA-256 per entry, and a `README.txt`. All business tables are
  included. Left out: sessions, accounts, verification tokens, calendar feed tokens, rate-limit
  hits, job-system tables and the run log itself (secrets or operational noise).
- **Impact:** the table list and formats of the export job.

### Q-66 — Backups: frequency, retention, recovery targets
- **Context:** SRC-150 — "how can the institution maintain backups in soft copy".
- **Questions:** How often must a backup run, how long is each kept, and what are the maximum
  data loss (RPO) and restore time (RTO) the institution accepts?
- **Working assumption:** full export nightly at 02:30 (Europe/Tirane); the newest 7 exports are
  kept, older ones are deleted from disk (the run log keeps the record); integrity check every
  Sunday 04:00. Database dumps follow the retention in deployment.md (7 daily / 4 weekly /
  12 monthly). RPO 24 hours, RTO one working day.
- **Impact:** the cron expressions and the retention count (constants in one file).

### Q-67 — Backups: off-site copy, encryption and who runs `pg_dump`
- **Context:** SRC-150 — the host is the client's concern (Q-26); the app cannot copy to another
  site or encrypt the volume on its own.
- **Questions:** Where do backups go (second server, NAS, EU cloud storage)? Are they encrypted? Who
  runs and monitors the nightly `pg_dump` and file copy?
- **Working assumption:** the app produces the export and verifies it; the client's operator runs
  `scripts/backup.sh` (database dump + files archive) from cron on the host, copies the results
  off-site inside the EU and encrypts the disk or the archive. The app does not encrypt exports.
- **Impact:** a possible encryption step or storage adapter later; no code change now.

### Q-68 — Backup and integrity failures: who is alerted
- **Context:** a backup nobody notices failing is worthless.
- **Questions:** Who must be told when a scheduled export or the integrity check fails or finds a
  problem, and how (e-mail, dashboard)?
- **Working assumption:** the failure is shown on `/admin/backups` (latest status banner), written
  to the log (ids and counts only) and the job system keeps the failed job visible on
  `/admin/jobs`. No e-mail yet.
- **Impact:** a notification to the sysadmin role via PLT-11 once confirmed.

### Q-69 — Export download: who may export and can it contain personal data
- **Context:** the full export holds every personal record (SRC-152, Q-16).
- **Questions:** Is the sysadmin the only person who may start and download an export? Must a
  second person approve? Should downloads expire?
- **Working assumption:** only `sysadmin` (`plt.backup.manage`); every start and every download is
  audited; no second approval; exports stay downloadable until the retention removes them.
- **Impact:** the permission grants and a possible approval step.
### Q-55 — Student portal: requesting a correction of own data
- **Context:** SRC-036, SRC-020 — the portal shows a student their data read-only; the brief mentions "request correction".
- **Questions:** How does a student ask for a correction (a request form, e-mail to the Secretariat, in person)? Which fields may they ask to change? Who approves?
- **Working assumption:** STU-03 only displays the data read-only with a note to contact the Secretariat; no correction flow is built until STU-07 (student requests) defines one.
- **Impact:** a "request correction" action and its approval chain.

### Q-56 — Student portal: which curriculum courses a student sees
- **Context:** SRC-036 — the portal builds on the curriculum plan of the student's cohort (CUR-02).
- **Questions:** Should a student see the whole plan, only the current year of study, or only courses they may register for? Are elective courses shown? Is a plan visible while still a draft?
- **Working assumption:** the courses of the student's current year of study from the cohort's plan, grouped by semester, with credits and an elective mark; a plan in draft is never shown.
- **Impact:** the course list and its filter.

### Q-57 — Student portal: access after the studies end
- **Context:** SRC-036, SRC-054 — students may be suspended, deregistered or graduated.
- **Questions:** May such a student still sign in and see their home page and record? For how long? Are timetable and announcements still shown?
- **Working assumption:** the account keeps working (account lifecycle is IAM-02); the home page shows the status prominently, lists past enrollments, and shows the timetable, calendar and plan only for active enrollments.
- **Impact:** what a former student sees, and the cut-off.

### Q-58 — Student portal: how much the home page shows
- **Context:** SRC-036c, SRC-036d — calendar, timetable and announcements shown on the home page.
- **Questions:** How many items and how far ahead are useful (next events, announcements, notifications)?
- **Working assumption:** today's classes, the next 5 calendar events that end today or later, the latest 3 announcements and the latest 5 notifications (with the unread count); each links to its full page.
- **Impact:** the counts and horizon only.

### Q-59 — Student portal: where the home page lives
- **Context:** SRC-036 — the platform has a dashboard at `/` with module widgets (PLT-06).
- **Questions:** Should students land on a dedicated page or on the shared dashboard?
- **Working assumption:** a dedicated page `/stu/home` (first item of the student menu) plus a "My studies" widget on the dashboard that links to it.
- **Impact:** navigation and the post-login landing page.

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

### Q-75 — Exam sessions: kinds, dates and who sets them
- **Context:** SRC-014, SRC-034, SRC-052 — winter, summer and autumn sessions and a mini-session.
- **Questions:** Is there exactly one session of each kind per academic year? Are there other kinds
  (extraordinary, thesis defence)? Which semester's courses belong to which session? Who sets the dates?
- **Working assumption:** at most one session of each of the four kinds (winter, summer, autumn, mini) per
  academic year, with a start and end date inside the year, set by the Secretariat; sessions of a year may
  overlap; any plan course may be scheduled in any session (the winter/summer/autumn split by semester,
  and retakes, are not enforced).
- **Impact:** the session kinds, uniqueness, whether courses are limited per session.

### Q-76 — Mini-session: which students and which courses
- **Context:** SRC-052 — list for third-year bachelor or master students — mini-session.
- **Questions:** Is "final year" the last year of the program (3 for bachelor of 3 years, 2 for master of
  2 years) or literally year 3 / master? Which courses may be examined in it?
- **Working assumption:** final year = the program's `durationYears`; in the mini-session only courses of
  that final year of study can be scheduled (CAL-03); which students may register is checked by EXM-04.
- **Impact:** the course filter of the mini-session, EXM-04 registration.

### Q-77 — Exam schedule: one exam per course, clashes and electives
- **Context:** SRC-034, SRC-036d — the exam schedule; clash detection per group.
- **Questions:** Is there one exam sitting per course per session (all groups together), or several
  (written + oral, one per group)? Do two electives of the same year of study clash?
- **Working assumption:** one sitting per plan course per session, for every group that follows that plan
  in that year of study; two sittings clash (and the second is refused) when they overlap in time on the
  same date for the same plan and year of study (electives included), the same examiner or the same room
  (case-insensitive). A sitting must lie inside its session's dates.
- **Impact:** the uniqueness and clash rules.

### Q-78 — Exam schedule: publication, changes after publication and notices
- **Context:** SRC-034, SRC-036d — the schedule is shown to students.
- **Questions:** Is the schedule published per session or per exam? May a published exam still change?
  Must students be notified?
- **Working assumption:** published per session by the Secretariat (and unpublished again); students and
  lecturers see only published sessions, staff see drafts; published sittings may still be changed (audited);
  no automatic notice yet — students see the schedule in the portal and the personal calendar feed.
- **Impact:** publication granularity, locking, notices (NTF).

### Q-79 — Exam schedule: examiners and rooms
- **Context:** SRC-014, SRC-034 — date/time/room/examiners of each exam.
- **Questions:** How many examiners per exam, must they be the course's lecturers, and are rooms master data?
- **Working assumption:** zero to six examiners chosen from the active academic staff (not tied to the
  course's lecturers); room is free text up to 50 characters as in the timetable (Q-39); the exam is
  not checked against the class timetable.
- **Impact:** examiner rules, room master data.




### Q-70 — Deregistration request: effective date, which enrollment, fees
- **Context:** SRC-037b — a student asks to be deregistered; approval triggers the STU-02 change.
- **Questions:** Which date applies — the date of the request, the date the student wants, or the
  date of the decision? Is there a notice period or a deadline in the year? What about a student
  with fees outstanding or with two open programs? May the request be withdrawn?
- **Working assumption:** the effective date is the date the student asks for, moved to today when
  it lies in the future and to the previous change of the enrollment when it lies before it; no
  notice period and no fee check (FIN does not exist yet); a student with several open enrollments
  names the program (its code) and the Secretariat refuses the approval when it does not match
  exactly one; the Secretariat may reject the request with a comment, the student cannot withdraw it.
- **Impact:** the date rule, fee preconditions, withdrawal.

### Q-71 — Student requests: identifying a requester who is not logged in
- **Context:** SRC-037 — the forms can be opened from the website without logging in (alumni, people
  without an account), so the system cannot tell who is asking.
- **Questions:** What identifies the requester — student number, national ID, date of birth,
  e-mail? Must the Secretariat verify identity (a copy of an ID) before approving?
- **Working assumption:** a public request carries the student number and the date of birth; approval
  is refused unless both match one student, and the Secretariat checks the rest by hand (the
  answers are shown beside the record). A logged-in student is identified by the account and gives nothing.
- **Impact:** the identifying fields, identity checks, whether public requests exist at all.

### Q-72 — Recognition of documents: who decides and on what basis
- **Context:** SRC-037c — a student asks for earlier studies or documents (courses passed elsewhere,
  certificates) to be recognized.
- **Questions:** Who decides — Secretariat, program coordinator, the academic board? Is the decision
  per course or for the whole request? Which documents must be attached (transcript, syllabi,
  translation) and what happens to a partly accepted request? Is there a fee or a deadline?
- **Working assumption:** the Secretariat and Student Affairs record the decision (the coordinator's
  opinion is a comment); it is per course with the credits recognized (default: the course's
  credits, editable); a request with at least one recognized course can be approved, otherwise it is
  rejected with a comment; the student attaches scans in the logged-in form (up to the platform file
  limits), the public form takes none; no fee, no deadline.
- **Impact:** who may decide, partial recognition, attachments, fees.

### Q-73 — Recognized courses: how they are recorded and used
- **Context:** SRC-037c, SRC-043 — the recognized courses count toward the student's credits and
  averages (EXM-07).
- **Questions:** Does a recognized course carry a grade (transferred) or only "recognized" with
  credits? Can a course be recognized more than once, and can a decision be revised? Does a
  recognized course replace a plan course of the student's program?
- **Working assumption:** a recognized course is stored against the student's enrollment with the
  catalog course and the credits (no grade; EXM-07 decides how it enters averages); one live
  recognition per course and enrollment; a decision is revised by voiding the line (kept, never
  deleted) and recording another; recognized courses are not matched to plan courses by the system.
- **Impact:** grades of recognized courses, replacement of plan courses, revisions.

### Q-74 — Student requests: attachments and the forms' texts
- **Context:** SRC-037b, SRC-037c — the exact questions on the deregistration and recognition forms
  are not in the source.
- **Questions:** Which fields do the official forms have, which texts and declarations (reason list,
  consent, statement of accuracy) must appear, and what must the student attach?
- **Working assumption:** deregistration asks for the reason (free text), the requested date, the
  program (optional) and a confirmation that the student understands the request ends their studies;
  recognition asks for the earlier institution, the programme and the courses with their credits in
  free text, plus an optional scan (logged-in form only). The sysadmin can change any of it in the
  form definition without code (PLT-15).
- **Impact:** the wording and fields of the two forms.
### Q-85 — Fees: currency, amounts and what a fee depends on
- **Context:** SRC-080a, SRC-085 (FIN-01, refines Q-24) — fees per program and academic year.
- **Questions:** In which currency are fees set (lek only, or euro for some students)? Does a fee also
  depend on the year of study, cohort, registration type, or on whether the student is Albanian or
  foreign? Which fee types exist beyond tuition, administrative, diploma and backlog exam?
- **Working assumption:** one currency (lek, shown with two decimals); a fee is set per program ×
  academic year × type (tuition, administrative, diploma, backlog exam, other) with an optional
  label to tell apart several fees of one type; amounts are entered by Finance, nothing is preset.
- **Impact:** fee keys (more dimensions), a currency column, the list of types.

### Q-86 — Fees: installments of a fee
- **Context:** SRC-085 — students pay in installments with deadlines from the annex of the contract.
- **Questions:** How many installments does each fee have and on which dates? Are they equal? Do
  all programs of a year share the same dates? What if a fee has no installments defined?
- **Working assumption:** Finance defines the installments of each fee (amount and due date); they
  must add up to the fee; a fee without installments is paid in one installment due on the first
  day of the academic year.
- **Impact:** the validation (sum equals fee), the fallback due date, shared date templates.

### Q-87 — Fees: early-payment and preferential discounts
- **Context:** SRC-085 / Q-24 — preferential fees for early payment with a date window.
- **Questions:** Is a discount a percentage or an amount? Does it apply to the whole fee or to each
  installment paid by a date? May several discounts apply together? Is the window relative to the
  installment due date or fixed dates?
- **Working assumption:** a discount of a fee is a percentage or an amount with a date window
  (from, to); a plan installment records the amount to pay if paid by the end of the best window
  (an amount discount is shared across installments in proportion to their amounts, never below
  zero); discounts do not combine (the lowest resulting amount is used); recording and honoring
  early payments belongs to FIN-02.
- **Impact:** how the early amount is computed, combining, relative windows.

### Q-88 — Payment plans: who gets one and when
- **Context:** SRC-080a, SRC-085 — one plan per enrollment and academic year (Q-24).
- **Questions:** Which students get a plan (active only? suspended ones?) and when is it created
  (at yearly registration, or on Finance's request)? What happens to a plan if the student
  deregisters mid-year? Are backlog-exam fees part of the yearly plan?
- **Working assumption:** Finance generates a plan for an enrollment with a yearly registration in
  the year (open enrollment, active or suspended), one by one or for a whole program; existing
  plans are never overwritten; the plan copies every active fee of the program and year (backlog-exam
  and other fees included); a deregistered student's plan is left as is for Finance to adjust.
- **Impact:** eligibility, automatic creation, treatment of deregistration.

### Q-89 — Payment plans: adjusting a student's installments
- **Context:** SRC-085 — plans are adjustable per student (Q-24).
- **Questions:** What may Finance change (amount, date, add or cancel an installment) and must a
  reason be recorded? Is there an approval step or an upper limit? May a plan of a closed year change?
- **Working assumption:** Finance may change the amount and due date of an installment, add one, or
  cancel one, always with a reason; every change is audited with before and after; no approval step;
  nothing changes once the academic year is closed; cancelled installments are kept, not deleted.
- **Impact:** approval, limits, reasons, closed years.
### Q-90 — Attendance: how the percentage is computed
- **Context:** SRC-042, SRC-036b — the attendance report; Q-12 (the 75 % rule needs a definition).
- **Questions:** Is attendance measured in hours or in classes? Does an excused absence count as
  attended or as absent?
- **Working assumption:** in **hours** (the hours of each held class): attendance % = hours present /
  hours of the held classes the student has a mark for, rounded to one decimal. **Excused counts as
  absent** for the percentage (it is reported separately, so the Secretariat can see it). One
  institution-wide switch can change this later without a deployment (not built now).
- **Impact:** the percentage; EXM-03 eligibility and DOC-03 reuse the same function.

### Q-91 — Attendance: threshold and what it applies to
- **Context:** Q-12 research finding — 75 % attendance is required for exams; lecture vs. seminar
  not confirmed.
- **Questions:** Which percentage, and is it per course as a whole or separately for lecture, seminar
  and lab?
- **Working assumption:** 75 % (setting `att.thresholdPercent`, a whole number 0–100), applied
  **separately per student and teaching assignment** (course and kind), because the report rows are
  assignments. "Below the threshold" means strictly less than the threshold.
- **Impact:** which students are flagged; the setting.

### Q-92 — Attendance: which classes and marks count
- **Context:** SRC-043 — classes can be planned, held or cancelled; students may join a group late.
- **Questions:** Do planned or cancelled classes count? What about classes before a student joined?
- **Working assumption:** only classes marked **held** count; planned and cancelled ones never do. A
  student is counted only for the held classes they have a mark for (classes saved before they were on
  the roster do not count against them). The report can be limited to a date range.
- **Impact:** denominators of the percentage.

### Q-93 — Attendance: what the student sees of the percentage
- **Context:** SRC-036b — students see their absences.
- **Questions:** May students see their own attendance % per course and whether they are under the
  threshold?
- **Working assumption:** yes: per course and kind, the held hours, absent and excused hours and the
  percentage, with a note when it is under the threshold; no other students' data, no notes.
- **Impact:** the student page.

### Q-94 — Attendance: who may run the reports and the period
- **Context:** SRC-042 — the attendance report; roles.md.
- **Questions:** Who may see reports, and for which period (year, semester, month)?
- **Working assumption:** whoever has `att.attendance.read` (Secretariat, heads of department,
  program coordinators; by scope of the program), for the selected academic year, optionally limited
  by a from and to date; exportable like any list. Lecturers get no report yet (they see their own
  classes); semesters are not a filter until the calendar defines them for attendance.
- **Impact:** access, period, exports.
### Q-80 — Lecturer workspace: who gets it
- **Context:** SRC-070 — online access for lecturers; HR-07 "My teaching".
- **Questions:** Is the workspace only for the `lecturer` role, or also for heads of department and program coordinators who teach?
- **Working assumption:** only the `lecturer` role holds `hr.workspace.self`; anybody else with teaching assignments still has the "My teaching assignments" list (CUR-04). Granting it to more roles is one line in the permission grants.
- **Impact:** the grant list, the dashboard card.

### Q-81 — Lecturer workspace: what a lecturer sees of a roster
- **Context:** SRC-070 — lecturers view rosters of their courses.
- **Questions:** Which student fields may a lecturer see (photo, e-mail, program, status)? May they see rosters of colleagues' groups?
- **Working assumption:** only for groups of their own teaching assignments; student number and name, nothing else; the roster is the one of ATT-01 (Q-62: active enrollments registered in the group for the year).
- **Impact:** fields on the roster, visibility across assignments.

### Q-82 — Lecturer workspace: "this semester"
- **Context:** HR-07 — "assignments this semester"; the model has semesters of a plan course but no dated semester.
- **Questions:** Where does a semester start and end? Should the hub show only the running semester?
- **Working assumption:** the hub shows all assignments of the selected academic year grouped by plan semester; there is no "running semester" filter until the calendar defines semester dates.
- **Impact:** a semester filter, hiding past semesters.

### Q-83 — Lecturer workspace: grades and absences views
- **Context:** SRC-070 — "viewing grades, absences, etc."; exams and grades (EXM) do not exist yet and Q-11 (grading rules) is open.
- **Questions:** What exactly should a lecturer see of grades (own courses only? final grades?) and absences (totals per student?).
- **Working assumption:** now the hub shows, per assignment, attendance progress (sessions held, still to record, absences marked) with a link to the attendance pages; grade shortcuts are added by EXM-02/05 through the hub's link registry once those pages exist.
- **Impact:** grade and absence summaries on the hub.

### Q-84 — Lecturer workspace: location and dashboard card
- **Context:** HR-07 — hub placement.
- **Questions:** Should the hub be the lecturer's landing page after sign-in?
- **Working assumption:** page `/hr/teaching` (navigation group "teaching", first entry) and a "My teaching" card on the dashboard of lecturers; the post-login landing page is unchanged (as Q-59).
- **Impact:** landing page, navigation.
