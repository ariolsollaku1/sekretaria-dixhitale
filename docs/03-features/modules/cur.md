# CUR — Curriculum

Code: `src/modules/cur`. Entities: [domain model](../../02-architecture/domain-model.md#cur--curriculum).

### CUR-01 — Course catalog
- **Goal:** one catalog of courses reused by plans (SRC-013).
- **Scope:** CRUD course: code, name (sq/en), default credits, category, hours (lecture/seminar/
  lab), owning department, active; search; import from Excel/CSV (initial load).

### CUR-02 — Curriculum plans
- **Goal:** the 1/2/3-year plan of each program, per cohort, with courses, category, credits,
  hours (SRC-013, SRC-026, SRC-110).
- **Users:** head of department / program coordinator (edit draft), secretary (read), sysadmin.
- **Scope:** plan versions per program (`DRAFT` → `APPROVED` → `ARCHIVED`), valid from an academic
  year; plan editor grid: year × semester × courses with credits, category, hours, elective flag;
  totals per semester/year (credits, hours) with warnings (e.g. 30 credits/semester, 180 for a
  3-year bachelor — thresholds configurable); copy a plan to start a new version; approval action
  (records who/when, freezes the plan); printable view.
- **Rules:** approved plans are immutable; cohorts reference approved plans (ORG-04).

### CUR-03 — Syllabi
- **Goal:** each course in a plan has a syllabus per academic year (SRC-055, SRC-110).
- **Scope:** upload PDF (v1) or structured syllabus form (later), per plan course × academic year;
  status draft/approved; carry forward previous year's syllabus; history kept.

### CUR-04 — Teaching assignments
- **Goal:** which lecturer teaches which course to which group, per semester (SRC-026, SRC-027).
- **Users:** head of department, secretary.
- **Scope:** for an academic year/semester, list plan courses × groups and assign lecturer(s) per
  kind (lecture/seminar/lab) with planned hours; copy from previous year; conflicts/warnings
  (unassigned courses, lecturer over a max load); lecturer sees own assignments.
- **Notes:** this is the backbone for attendance, grades, timetable, teaching load and evaluations.

### CUR-05 — Teaching load report
- **Goal:** annual teaching load of internal and external lecturers by semester (SRC-113).
- **Scope:** report per lecturer/department/faculty: planned hours (CUR-04) and delivered hours
  (HR-04 when available), PAE vs PAK; export.

### CUR-06 — Curriculum & syllabi package for students
- **Goal:** students/graduates often request "the plan with credits and the syllabi" (SRC-055).
- **Scope:** generate a PDF bundle (plan with credits + all syllabi of the student's cohort/plan)
  on request by the Secretariat; optionally self-service for students; issued as a document (PLT-09).
- **Implemented (CUR-06, [spec](../specs/CUR-06-student-package.md)):** document type `cur.study-package` (`PLN-YYYY-NNNNN`); pages `/cur/packages` (secretariat: search, preview, issue, list) and `/cur/my-package` (student, own enrollments, 3 per hour); per course the approved syllabus of the year the student studied it, else the latest; courses without one are marked and counted, not blocking (Q-114..Q-117). The sysadmin publishes the cover template per language in PLT-09 (a default is seeded for development); `pdf-lib` merges the PDFs.

### CUR-07 — Approved documents archive
- **Goal:** approved plans, syllabi, diploma form and supplement per academic year, current and
  past (SRC-111, SRC-112).
- **Users:** department, secretariat, sysadmin, program coordinator (read).
- **Scope:** archive view by academic year and program; upload approved scanned decisions; link to
  the template versions used by GRD-02.
