# GRD — Graduation & diplomas

Code: `src/modules/grd`.

### GRD-01 — Graduation clearance
- **Goal:** detect students who closed all academic and financial obligations and move them from
  active to graduated (SRC-050, SRC-059).
- **Scope:** clearance check per final-year student: all plan credits earned (EXM-07), thesis/final
  exam recorded, no financial debt (FIN-02), library cleared (LIB-03 when available — optional
  check); clearance list (cleared / not cleared with reasons) — also SRC-050's list; "graduate"
  action (single/bulk) → STU-02 transition, final average stored, triggers GRD-02.

### GRD-02 — Diplomas & supplements
- **Goal:** diploma and diploma supplement generated automatically on graduation, in the format
  approved by LOGOS and MAS (SRC-059, SRC-111).
- **Scope:** templates per academic year (from CUR-07 approved forms), diploma numbering, supplement
  content (program description, courses, credits, grades, grading system), generation on graduation
  (job), review & print workflow, reprint as duplicate (marked), issued-document records.
- **Blocked by:** Q-09.

### GRD-03 — Official registers
- **Goal:** Main Register and Diploma Register in the required format (SRC-040).
- **Scope:** generate/export the registers per academic year and program from STU-01 and GRD-02
  data, in the official layout; lock entries once printed/signed.
- **Blocked by:** Q-09.
