# INT — Integrations & migration

Code: `src/modules/int`. Each integration is isolated behind an adapter interface so the rest of
the system works without it (manual entry / CSV import fallbacks).

### INT-01 — SMIAL integration
- **Goal:** obtain the NIM for each student and report student data to the Ministry (SRC-023).
- **Fallback until done:** NIM typed in manually (STU-01).
- **Blocked by:** Q-01.

### INT-02 — Financa 5 integration
- **Goal:** avoid entering students and lecturers twice; bring payments in automatically (SRC-080, SRC-081).
- **Fallback until done:** payments CSV import (FIN-02).
- **Blocked by:** Q-02.

### INT-03 — PLEJADES integration
- **Goal:** data exchange with the library system (SRC-100) for LIB-01…03.
- **Blocked by:** Q-03.

### INT-04 — MS Teams integration
- **Goal:** possibly create Teams/classes from teaching assignments and sync rosters (SRC-024).
- **Blocked by:** Q-04 (in scope at all?).

### INT-05 — Access-control entry/exit report
- **Goal:** operational report of entry/exit of internal and guest lecturers (SRC-072).
- **Scope:** import events from the access-control system, map card IDs to staff, daily/monthly report.
- **Blocked by:** Q-05.

### INT-06 — Website links to public forms
- **Goal:** forms and notices reachable from the LOGOS website (SRC-030, SRC-037, SRC-114, SRC-133).
- **Decision (Q-06, answered):** **link only, no embedding** — the website is a custom
  Express/AngularJS static site; public forms stay on our domain at `/f/<form-key>`.
- **Scope:** a public `/forms` index page listing all public forms (and the public announcements
  page), a stable URL per form, and a short hand-over note for whoever maintains the website listing
  the links to add. Re-check with Marketing/IT who adds the links.
- **Built (Q-95):** the index is at `/f` (`/forms` is the signed-in area); public notices are not
  built (announcements need login). Sysadmin page `/admin/forms/links` shows the absolute
  addresses; hand-over note in [website-links.md](../../02-architecture/website-links.md).
  Spec: [INT-06](../specs/INT-06-website-links.md).

### INT-07 — Legacy data migration
- **Goal:** load existing students, grades, staff and payment data (SRC-151).
- **Scope:** import pipeline per entity (CSV/Excel templates, validation report, dry run, idempotent
  re-runs), reconciliation reports.
- **Blocked by:** Q-14. **Note:** pull this forward as soon as Q-14 is answered — each module should
  be loaded with real data before it goes live.
