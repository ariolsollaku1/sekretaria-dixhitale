# FIN — Finance

Code: `src/modules/fin`. Finance reports by **calendar year**, payment plans reference the
**academic year** they pay for (SRC-001, ADR-0006). Integration with Financa 5 is INT-02.

### FIN-01 — Fee structure & payment plans
- **Goal:** fees per program/year and each student's installment plan (SRC-080a, SRC-085).
- **Users:** finance (write), secretary/student-affairs (read).
- **Scope:** fee schedule per program × academic year × fee type (tuition, administrative,
  diploma, backlog exam, other); preferential/early-payment discounts with date windows; payment
  plan per enrollment × academic year generated from schedule (installments with due dates and
  amounts) and adjustable per student (audited); scholarships applied (FIN-03).
- **Assumption (Q-24):** structure is configurable; values entered by Finance. Details and working
  assumptions in Q-85 (currency, fee keys), Q-86 (installments), Q-87 (discounts), Q-88 (who gets a
  plan), Q-89 (adjustments). Spec: [FIN-01](../specs/FIN-01-fee-structure.md).

### FIN-02 — Payments & financial status
- **Goal:** record payments and know who owes what — shared by Finance and Secretariat (SRC-080a, SRC-087).
- **Scope:** record payment (amount, date, reference, method) against installments; **CSV import**
  of payments (e.g. exported from F5 or bank) with matching by student number/NIM and preview;
  per-student balance; financial clearance status per date/exam session (used by EXM-03, GRD-01);
  student portal "my installments".
- **Note:** works without F5 integration; INT-02 can later feed payments automatically.

### FIN-03 — Scholarships
- **Goal:** full/partial scholarships and their lists/reports (SRC-037a, SRC-083, SRC-084).
- **Scope:** scholarship application form (PLT-15, public + portal); Finance decision creates a
  `Scholarship` (type, % or amount, academic year, reason) → payment plan recalculated; lists of
  students with scholarships and resulting fees; counts per academic year and program.
- **Assumption (Q-23).**

### FIN-04 — Payment reminders
- **Goal:** automatic reminder two weeks before each installment (SRC-086).
- **Scope:** daily job finds installments due in 14 days (configurable) and unpaid → email +
  in-app notification (once per installment, idempotent); overdue reminder (optional); log of
  reminders sent.

### FIN-05 — Shared Finance & Secretariat lists
- **Goal:** the payment lists both offices use (SRC-049, SRC-085, SRC-087).
- **Scope:** students grouped by payment deadlines; students who have / have not closed financial
  obligations before a given exam session (winter/summer/autumn); debtors list with contact data
  (→ NTF-03); exports.

### FIN-06 — Staff payment data for F5
- **Goal:** hand over payroll inputs: hours delivered by hourly-paid lecturers and supplements (SRC-080b, SRC-080c).
- **Scope:** monthly approved delivered hours (HR-04) × rates → export in the format F5 needs;
  supplements entry; export history.
- **Blocked by:** Q-02 (format, what F5 already holds).
