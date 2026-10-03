# QA — Quality assurance (NJSBC)

Code: `src/modules/qa`.

### QA-01 — Student evaluations of lecturers & administration
- **Goal:** students evaluate lecturers and the administration (SRC-120, SRC-121) — possibly in one
  combined questionnaire.
- **Scope:** evaluation campaigns per semester; questionnaire definitions (PLT-15 renderer);
  students get one survey per teaching assignment they attend (+ administration section);
  **anonymous**: responses stored without student identity, participation tracked separately to
  prevent double submission; minimum response count before results are shown (e.g. 5); results per
  lecturer/course/department; lecturer sees own aggregated results.
- **Assumption (Q-25).**

### QA-02 — Alumni tracking
- **Goal:** track alumni progress (SRC-122) and let alumni update their data without an account (SRC-037e).
- **Scope:** alumni record created at graduation (GRD-01); public alumni update form (identity
  check by email link); employment / further studies over time; reports (employment rate, field).

### QA-03 — Staff quality indicators
- **Goal:** "staff quality" (SRC-123) — undefined in the source.
- **Blocked by:** Q-15 (what to measure).
