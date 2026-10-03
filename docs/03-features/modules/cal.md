# CAL — Calendar, timetable, exam schedule

Code: `src/modules/cal`.

### CAL-01 — Academic calendar
- **Goal:** the academic year's calendar organized by weeks, with predefined deadlines (SRC-025,
  SRC-034, SRC-036c).
- **Users:** secretary/sysadmin (edit), everyone (read).
- **Scope:** events per academic year with type (teaching week, holiday, deadline, exam period,
  registration period, event), audience (all / cycle / program); week numbering; month and list
  views; copy the previous year's calendar shifted to new dates; iCal feed per user (read-only).

### CAL-02 — Class timetable
- **Goal:** weekly timetable per group, visible to students and lecturers (SRC-034, SRC-036d).
- **Scope:** entries per teaching assignment (weekday, time, room, validity period); grid editor
  per group; clash detection (group, lecturer, room); CSV import; views: my timetable (student,
  lecturer), per group, per room; print.
- **Assumption (Q-21):** entered/imported by the Secretariat; no automatic scheduling.

### CAL-03 — Exam sessions & exam schedule
- **Goal:** define winter/summer/autumn sessions and the mini-session, and schedule each exam
  (SRC-014, SRC-034, SRC-036d, SRC-052).
- **Scope:** sessions per academic year with dates and type; mini-session restricted to final-year
  students (3rd-year bachelor, master); exam per plan course with date/time/room/examiners; clash
  detection per group; publish schedule to students (portal + calendar).
