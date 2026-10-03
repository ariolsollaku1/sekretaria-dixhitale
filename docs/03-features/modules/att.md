# ATT — Attendance

Code: `src/modules/att`.

### ATT-01 — Attendance recording
- **Goal:** lecturers record absences online; students see them (SRC-036b, SRC-043).
- **Users:** lecturer (own assignments), secretary (correct with reason).
- **Scope:** class sessions per teaching assignment (generated from the timetable when CAL-02 exists,
  or created ad hoc: date, hours, topic); roster of the group with present/absent/excused; mark the
  session "held" (feeds HR-04 delivered hours); edit window (e.g. 7 days, configurable), later edits
  by secretary with reason; mobile-friendly.

### ATT-02 — Attendance reports & student absences view
- **Goal:** attendance reports and student self-view (SRC-036b, SRC-042).
- **Scope:** per student per course: sessions, absences, % attendance; per group/course summary;
  students below a threshold (threshold configurable — rule confirmed in Q-12); student portal
  absences page; export.
