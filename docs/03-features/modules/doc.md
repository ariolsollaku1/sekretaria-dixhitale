# DOC — Student certificates

Code: `src/modules/doc`. All documents are rendered by PLT-09 and recorded as `IssuedDocument`.

### DOC-01 — Certificate requests & status certificate
- **Goal:** students request certificates online; Secretariat issues them; first type = student
  status certificate referencing NIM (SRC-012a, SRC-048).
- **Scope:** request form in the portal (type, purpose, copies, language); Secretariat queue
  (approve/issue/reject); generation from template with number/protocol number; student downloads
  or collects; issued-documents register per student; verification code (if confirmed in Q-07).
- **Blocked by:** Q-07 (templates, numbering, fees).

### DOC-02 — Grades certificate & transcript
- **Goal:** grades certificate and grades & credits certificate (SRC-012b, SRC-012c, SRC-047).
- **Scope:** two document types built on DOC-01's request flow, data from EXM-07 (only finalized
  grades; recognized courses marked).
- **Blocked by:** Q-07.

### DOC-03 — Attendance certificate
- **Goal:** attendance certificate (SRC-012d).
- **Scope:** document type on DOC-01's flow with data from ATT-02 (period, courses, attendance).
- **Blocked by:** Q-07.
