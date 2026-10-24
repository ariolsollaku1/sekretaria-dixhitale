import { registerPermissions } from "@/lib/authz/registry";
import { ROLES } from "@/lib/authz/roles";

// AC-14 (CAL-01). Everyone reads the calendar; the Secretariat and sysadmin maintain it
// (roles.md "CAL — calendar, timetable").
registerPermissions("cal", {
  permissions: ["cal.event.read", "cal.event.write"],
  grants: {
    ...Object.fromEntries(ROLES.map((r) => [r, ["cal.event.read"]])),
    sysadmin: ["cal.event.read", "cal.event.write"],
    secretary: ["cal.event.read", "cal.event.write"],
  },
});

// AC-7 (CAL-02): the Secretariat enters the timetable; staff read any group's or room's; lecturers
// and students see their own (roles.md "CAL — calendar, timetable": W/R/r).
const STAFF_READERS = [
  "sysadmin",
  "secretary",
  "student_affairs",
  "finance",
  "hr",
  "quality",
  "library",
  "administration",
  "head_of_department",
  "program_coordinator",
  "erasmus",
] as const;

registerPermissions("cal", {
  permissions: ["cal.timetable.read", "cal.timetable.write", "cal.timetable.self"],
  grants: {
    ...Object.fromEntries(STAFF_READERS.map((r) => [r, ["cal.timetable.read"]])),
    sysadmin: ["cal.timetable.read", "cal.timetable.write"],
    secretary: ["cal.timetable.read", "cal.timetable.write"],
    lecturer: ["cal.timetable.self"],
    student: ["cal.timetable.self"],
  },
});

// AC-10 (CAL-03): same split as the timetable — the Secretariat schedules exams, staff read the
// whole schedule, lecturers (as examiners) and students see their own published exams.
registerPermissions("cal", {
  permissions: ["cal.exam.read", "cal.exam.write", "cal.exam.self"],
  grants: {
    ...Object.fromEntries(STAFF_READERS.map((r) => [r, ["cal.exam.read"]])),
    sysadmin: ["cal.exam.read", "cal.exam.write"],
    secretary: ["cal.exam.read", "cal.exam.write"],
    lecturer: ["cal.exam.self"],
    student: ["cal.exam.self"],
  },
});
