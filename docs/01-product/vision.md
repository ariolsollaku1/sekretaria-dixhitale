# Product vision — Sekretari Dixhitale

## What we are building

A web-based academic administration system ("digital secretariat") for **Kolegji Universitar
LOGOS**. It replaces paper and spreadsheet processes across the Secretariat, Student Affairs,
Finance, HR, Library, Departments, the Quality Assurance Unit (NJSBC), the Erasmus Office and
Administration, and gives students and lecturers online self-service.

Source of truth for scope: [../00-source/requirements-en.md](../00-source/requirements-en.md).

## Goals

1. **One record per student, from first contact to alumni** — interest form → application →
   enrollment → yearly registration → exams → graduation → alumni (SRC-012, SRC-030, SRC-059).
2. **Exams and grades without paper chasing** — eligibility lists, exam records ready to sign,
   grades entered once and visible to students immediately after finalization (SRC-014…016).
3. **Official documents on demand** — certificates, transcripts, diplomas and supplements generated
   from the data, in the approved formats (SRC-012a–d, SRC-047, SRC-048, SRC-059).
4. **Shared, consistent data across offices** — Finance and Secretariat see the same payment
   status; Finance sees HR data it needs; no double entry with F5 (SRC-081, SRC-087).
5. **Reports instead of manual counting** — lists and statistics by cycle, program, year,
   gender, age, residence, etc. (SRC-021, SRC-082).
6. **Personal data handled lawfully** — EU/Albanian-compliant storage, backups, exportable data
   (SRC-150…152).

## Non-goals (for now)

- Replacing **Financa 5** (accounting/payroll) or **PLEJADES** (library) — we integrate with them.
- A learning management system (course content, assignments) — out of scope.
- A public marketing website — the LOGOS website stays; we provide forms it can link/embed.
- Automatic timetable optimization — timetables are entered, not solved (Q-21).
- Mobile native apps — the web app must be responsive and work on phones.

## Organizing principles

- **Academic year is the main axis.** Almost every academic record belongs to an academic year;
  finance uses calendar years (SRC-001, [ADR-0006](../02-architecture/adr/0006-academic-year-scoping.md)).
- **Approved things are versioned, never overwritten.** Curriculum plans, syllabi, diploma and
  supplement formats are approved per academic year and past versions stay accessible (SRC-111, SRC-112).
- **Grades are append-only in spirit.** Every correction keeps who/when/why (SRC-043).
- **Forms are configuration, not code**, where possible — there are many forms (SRC-037, SRC-130…141)
  so they share one forms engine ([ADR-0009](../02-architecture/adr/0009-forms-engine.md)).
- **Business rules are never guessed.** If a rule is unknown it becomes an open question and the
  feature is marked blocked ([../04-open-questions.md](../04-open-questions.md)).

## Users (summary)

Staff of each office, lecturers, students. Candidates and alumni interact only through public
forms. Details: [roles.md](roles.md).

## Language

- Documentation, code and identifiers: **English**.
- UI: **Albanian by default**, English as a second, user-switchable language (Q-17); built with
  i18n from day one (ADR-0011).
- Official documents (certificates, diplomas, contracts): in the language of the approved templates
  (Albanian, and English where required, e.g. the diploma supplement).
