# EXM — Exams & grades

Code: `src/modules/exm`. The exam chain: rules → partial assessments → eligibility → registration
& rosters → grade entry → academic record → reports/documents.

### EXM-01 — Grading scheme & rules
- **Goal:** encode the institution's grading rules once (SRC-043, SRC-046).
- **Scope:** grading scheme per academic year: scale, pass mark, composition of final grade
  (partial assessments %, exam %), attempt rules (retake, backlog, improvement — which grade
  counts), averaging and rounding rules; all rules as pure, unit-tested functions in `domain/`.
- **Blocked by:** Q-11.

### EXM-02 — Partial assessments
- **Goal:** record partial-assessment (midterm/coursework) results (SRC-043).
- **Scope:** components per teaching assignment (name, weight, max points) within scheme limits;
  lecturer enters results per student; results visible to student after publishing.

### EXM-03 — Exam eligibility
- **Goal:** the list of students entitled to sit each exam: academic + financial obligations
  closed (SRC-014, SRC-049, SRC-050).
- **Scope:** eligibility evaluated per student × exam × session from attendance (ATT), partial
  assessments (EXM-02), financial clearance (FIN-02) and attempt rules (EXM-01); reasons shown for
  ineligibility; Secretariat override with reason (audited); recalculated on data changes.
- **Blocked by:** Q-12.

### EXM-04 — Exam registration & rosters
- **Goal:** the student list for each exam (SRC-014, SRC-058).
- **Scope:** automatic registration of eligible students per exam (first attempt / retake / backlog
  / improvement); optional student self-registration for retakes/improvements; roster view and
  export per exam; autumn lists of first-time vs retake candidates per course (SRC-058).

### EXM-05 — Grade entry, finalization & corrections
- **Goal:** lecturers enter exam grades online; Secretariat finalizes; corrections are traceable (SRC-015, SRC-043).
- **Scope:** grade entry grid per exam roster (lecturer or secretary); draft → submitted (by
  lecturer) → final (by secretary); finalized grades locked; corrections only via a correction
  action with reason + reference (audited, previous value kept); "absent" / "not eligible" markers;
  computes final course grade with partial assessments per EXM-01.
- **Open point (Q-08 finding):** ASCAL (2017) recommended **anonymous marking**. If LOGOS now uses
  it, grade entry is by exam-paper code and names are revealed only after submission — confirm
  before speccing.

### EXM-06 — Student grades view
- **Goal:** students see each exam result and their record up to now, by semester (SRC-016, SRC-036a).
- **Scope:** portal page: per semester, courses with final grade, credits, attempts; current
  weighted average; notification when a grade is finalized.

### EXM-07 — Academic record & weighted averages
- **Goal:** the Register of Academic Achievements and credit-weighted averages (SRC-040, SRC-046).
- **Scope:** `CourseResult` per enrollment × plan course (counting grade, credits earned, incl.
  recognized courses from STU-07); personal, group, program and faculty averages; credits earned
  per year; outstanding courses per student; register view/export by program, year and semester.

### EXM-08 — Exam session & backlog reports
- **Goal:** the Secretariat's session lists (SRC-044, SRC-045, SRC-052, SRC-057, SRC-058, SRC-088).
- **Scope:** session grade lists; backlog exams list; autumn improvement list; end-of-year
  outstanding-courses report for all students (before autumn); mini-session eligible list; backlog
  students with contact data (→ NTF-03 to message them); students completing studies this year.

### EXM-09 — Course register & student results list
- **Goal:** the course register for each course and the name list with credits, grades and
  attendance (SRC-041, SRC-056).
- **Scope:** per teaching assignment: students, attendance summary, partial results, final grades;
  PDF in the official format; name-list report across courses.
- **Blocked by:** Q-08 (course register format).

### EXM-10 — Exam record (procesverbal) & grade sheet PDFs
- **Goal:** official exam documents ready for signature (SRC-014, SRC-015).
- **Scope:** generate procesverbal per exam (roster + grades) and the grade sheet for lecturer
  signature from templates (PLT-09); upload of the signed scan; finalization can require the signed
  scan (configurable).
- **Blocked by:** Q-08 (templates).
