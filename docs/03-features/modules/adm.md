# ADM — Admissions

Code: `src/modules/adm`. Flow: interest → application → review/ranking → enrollment → contract/invoice.

### ADM-01 — Interest form & leads
- **Goal:** capture prospective students from the website, campaigns and events (SRC-030, SRC-031).
- **Users:** public (submit), student-affairs (manage), secretariat & finance (read).
- **Scope:** public interest form (PLT-15) with program of interest, contact data, source, consent;
  manual/bulk entry for event leads (CSV import); leads list with status (new/contacted/applied/
  lost), notes, assignment; convert lead → application invitation email.

### ADM-02 — Online application
- **Goal:** candidates enter their own data once; staff only confirm it later (SRC-020, SRC-030, SRC-032).
- **Scope:** public multi-step application (personal data, contact, previous education incl.
  high-school average, program choice, document uploads — configurable list per cycle), email
  confirmation with reference number and a magic link to view status/complete missing documents;
  staff view of applications with status.
- **Assumption (Q-19):** candidates have no Keycloak account; status access via signed link.

### ADM-03 — Application review & candidate ranking
- **Goal:** review completeness and rank candidates by cycle and category (SRC-114).
- **Scope:** checklist review, request missing documents, ranking per program/cycle/category using
  the official formula, capacity cut-off, publish/export ranking, accept/reject with notification.
- **Blocked by:** Q-13 (criteria, formula, categories).

### ADM-04 — Enrollment of accepted candidates
- **Goal:** turn an accepted application into a student without retyping (SRC-020, SRC-032, SRC-051).
- **Scope:** Secretariat confirms personal data ("final approval"), sets registration type (first
  time / second program / transfer), cohort and group → creates Person/Student/Enrollment/
  YearRegistration (STU-01); triggers account creation (IAM-02) and payment plan (FIN-01) when
  those exist; bulk enrollment for a list of accepted candidates.

### ADM-05 — Student contract & invoicing
- **Goal:** generate the student contract with its installment annex and the first invoice (SRC-032, SRC-085).
- **Scope:** contract PDF from template (PLT-09) with fee/installment data from FIN-01, contract
  number, signed-copy upload, invoice/payment-order document for the first installment.
- **Blocked by:** Q-10 (contract template).

### ADM-06 — Registration campaign notices
- **Goal:** publish registration deadlines, preferential-fee days, required documents, fees and
  contract excerpts (SRC-033).
- **Scope:** announcement type "registration notice" (NTF-01) with structured fields (deadline
  dates, preferential fee windows from FIN config, document checklist); shown on public application
  page and sent to leads.
- **Status:** built as [ADM-06](../specs/ADM-06-registration-notices.md): an announcement plus
  campaign data; fees read live from FIN-01. The public page and the lead mailing call
  `liveRegistrationNotices()` once ADM-01/ADM-02 exist (Q-98, Q-99).
