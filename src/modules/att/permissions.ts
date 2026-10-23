import { registerPermissions } from "@/lib/authz/registry";

// AC-11 (ATT-01), roles.md "ATT — attendance": lecturers write their own, the Secretariat reads and
// corrects, heads and coordinators read their scope, students see their own absences.
registerPermissions("att", {
  permissions: [
    "att.attendance.read",
    "att.attendance.record",
    "att.attendance.correct",
    "att.attendance.self",
  ],
  grants: {
    secretary: ["att.attendance.read", "att.attendance.correct"],
    head_of_department: ["att.attendance.read"],
    program_coordinator: ["att.attendance.read"],
    lecturer: ["att.attendance.record"],
    student: ["att.attendance.self"],
  },
});
