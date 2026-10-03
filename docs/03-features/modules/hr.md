# HR — Human resources

Code: `src/modules/hr`. HR data needed by Finance must be readable by `finance` (SRC-063…069).

### HR-01 — Staff register
- **Goal:** every academic and administrative staff member from day 1 of employment (SRC-027,
  SRC-060, SRC-062).
- **Users:** hr (write), finance/secretary/head-of-dept (read per scope).
- **Scope:** `Person` + `Staff`: kind (academic/administrative), category (PAE internal full-time,
  PAK external part-time, volunteer), degree and title, department(s), retired flag, primary
  employer (for external), contract start/end dates (full contracts in HR-02); list with filters;
  detail page; offer to create a user account (IAM-02); import from Excel.

### HR-02 — Employment contracts
- **Goal:** generate employment contracts from the standard template with general and employment
  data (SRC-062).
- **Scope:** contract records (type, start/end, position, hours/salary basis), PDF from template
  (PLT-09), signed upload, amendments.
- **Blocked by:** Q-10.

### HR-03 — Contract expiry tracking
- **Goal:** the system automatically lists academic staff whose engagement has ended per contract
  end date (SRC-061).
- **Scope:** list of ended / ending-soon contracts (configurable horizon); weekly job notifies HR;
  optional auto-deactivation of account (IAM-02) after end date.

### HR-04 — Lecturer attendance & delivered hours
- **Goal:** lecturer attendance list and record of hours delivered per month/semester per course (SRC-061, SRC-066).
- **Scope:** delivered hours derived from sessions marked "held" in ATT-01; lecturer monthly
  summary; head of department approval per month; adjustments with reason; reports per
  lecturer/course/month/semester, PAE vs PAK.
- **Assumption (Q-22).**

### HR-05 — HR lists & reports
- **Goal:** the lists Finance and management need (SRC-063, SRC-064, SRC-067, SRC-068, SRC-069).
- **Scope:** internal/external lecturers by department, faculty, semester with degree/title;
  lecturers by title, degree, gender, age; external lecturers with primary employment; retired
  external lecturers; volunteer lecturers by department/faculty/semester/program. All via PLT-10.

### HR-06 — Performance evaluations
- **Goal:** lecturer evaluation by head of department, staff evaluation by direct supervisor, and
  performance reports (SRC-065, SRC-071, SRC-141).
- **Scope:** evaluation campaigns per period; forms from PLT-15 (definitions owned by HR);
  evaluator fills, evaluated person sees result (configurable); reports by department/faculty/
  institution.
- **Assumption (Q-25):** questionnaire content configured later.

### HR-07 — Lecturer workspace
- **Goal:** lecturers' online access to their courses, rosters, grades and absences (SRC-070).
- **Scope:** "My teaching" hub: assignments this semester, timetable, quick links to take
  attendance (ATT-01), enter partial results/grades (EXM-02/05) once available, view rosters.
