# ERS — Erasmus

Code: `src/modules/ers`.

### ERS-01 — Erasmus applications
- **Goal:** Erasmus application forms for students, academic staff and administrative staff,
  available from the website, with applicant data stored in the system (SRC-037f, SRC-130…133).
- **Users:** public/students/staff (apply), erasmus officer (manage).
- **Scope:** three form definitions (PLT-15), public and in-portal (prefilled when logged in);
  Erasmus inbox with statuses (submitted, shortlisted, selected, rejected, mobility done); link to
  student/staff record when the applicant is known; exports for reporting.
- **Built (ERS-01):** six definitions (`erasmus-student|academic|admin`, public and `-portal`),
  list `/ers/applications` (`ers.application.read`), status changes in the forms inbox. Prefilling
  the in-portal forms needs a PLT-15 engine feature and is not done. See
  [the spec](../specs/ERS-01-erasmus-applications.md).
