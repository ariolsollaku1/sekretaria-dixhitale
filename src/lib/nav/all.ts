import "@/modules/org"; // registers the ORG permissions and the academic-year provider
import "@/modules/cur";
import "@/modules/cal";
import "@/modules/ntf";
import "@/modules/hr";
import "@/modules/stu";
import "@/modules/att";
import "@/modules/fin";
import { registerNav } from "./registry";

// Each module registers its entries here (one import per module index.ts) so the shell never
// depends on module internals. Platform entry:
registerNav({ id: "dashboard", labelKey: "dashboard", href: "/", icon: "home", order: 0 });
registerNav({
  id: "audit",
  labelKey: "audit",
  href: "/admin/audit",
  icon: "shield",
  permission: "plt.audit.read",
  group: "system",
  order: 10,
});
registerNav({
  id: "users",
  labelKey: "users",
  href: "/admin/users",
  icon: "users",
  permission: "iam.user.read",
  group: "system",
  order: 5,
});
registerNav({
  id: "files",
  labelKey: "files",
  href: "/admin/files",
  icon: "file",
  permission: "plt.file.read",
  group: "system",
  order: 20,
});
registerNav({
  id: "years",
  labelKey: "years",
  href: "/org/years",
  icon: "calendar",
  permission: "org.year.read",
  group: "administration",
  order: 10,
});
registerNav(
  {
    id: "faculties",
    labelKey: "faculties",
    href: "/org/faculties",
    icon: "building",
    permission: "org.faculty.read",
    group: "administration",
    order: 20,
  },
  {
    id: "departments",
    labelKey: "departments",
    href: "/org/departments",
    icon: "building",
    permission: "org.department.read",
    group: "administration",
    order: 21,
  },
);
registerNav(
  {
    id: "cohorts",
    labelKey: "cohorts",
    href: "/org/cohorts",
    icon: "users",
    permission: "org.cohort.read",
    group: "administration",
    order: 23,
  },
  {
    id: "student-groups",
    labelKey: "studentGroups",
    href: "/org/groups",
    icon: "users",
    permission: "org.group.read",
    group: "administration",
    order: 24,
  },
);
registerNav({
  id: "programs",
  labelKey: "programs",
  href: "/org/programs",
  icon: "graduation",
  permission: "org.program.read",
  group: "administration",
  order: 22,
});
registerNav(
  {
    id: "courses",
    labelKey: "courses",
    href: "/cur/courses",
    icon: "book",
    permission: "cur.course.read",
    group: "teaching",
    order: 10,
  },
  {
    id: "plans",
    labelKey: "plans",
    href: "/cur/plans",
    icon: "clipboard",
    permission: "cur.plan.view",
    group: "teaching",
    order: 12,
  },
  {
    id: "syllabi",
    labelKey: "syllabi",
    href: "/cur/syllabi",
    icon: "clipboard",
    permission: "cur.syllabus.view",
    group: "teaching",
    order: 12.5,
  },
  {
    id: "teaching",
    labelKey: "teaching",
    href: "/cur/teaching",
    icon: "book",
    permission: "cur.teaching.read",
    group: "teaching",
    order: 13,
  },
  {
    id: "teaching-load",
    labelKey: "teachingLoad",
    href: "/cur/teaching/load",
    icon: "chart",
    permission: "cur.teaching.read",
    group: "teaching",
    order: 15,
  },
  {
    id: "teaching-hub",
    labelKey: "teachingHub",
    href: "/hr/teaching",
    icon: "book",
    permission: "hr.workspace.self",
    group: "teaching",
    order: 1,
  },
  {
    id: "my-teaching",
    labelKey: "myTeaching",
    href: "/cur/teaching/mine",
    icon: "book",
    permission: "cur.teaching.self",
    group: "teaching",
    order: 14,
  },
  {
    id: "course-categories",
    labelKey: "courseCategories",
    href: "/cur/categories",
    icon: "book",
    permission: "cur.course.read",
    group: "teaching",
    order: 11,
  },
);
registerNav({
  id: "jobs",
  labelKey: "jobs",
  href: "/admin/jobs",
  icon: "settings",
  permission: "plt.jobs.read",
  group: "system",
  order: 30,
});
registerNav({
  id: "backups",
  labelKey: "backups",
  href: "/admin/backups",
  icon: "settings",
  permission: "plt.backup.read",
  group: "system",
  order: 31,
});
registerNav({
  id: "calendar",
  labelKey: "calendar",
  href: "/calendar",
  icon: "calendar",
  permission: "cal.event.read",
  group: "teaching",
  order: 5,
});
registerNav({
  id: "announcements",
  labelKey: "announcements",
  href: "/announcements",
  icon: "bell",
  permission: "ntf.announcement.read",
  group: "teaching",
  order: 6,
});
registerNav({
  id: "messages",
  labelKey: "messages",
  href: "/messages",
  icon: "bell",
  permission: "ntf.message.send",
  group: "administration",
  order: 6,
});
registerNav(
  {
    id: "staff",
    labelKey: "staff",
    href: "/hr/staff",
    icon: "users",
    permission: "hr.staff.read",
    group: "administration",
    order: 30,
  },
  {
    id: "hr-lists",
    labelKey: "hrLists",
    href: "/hr/lists",
    icon: "chart",
    permission: "hr.staff.read",
    group: "administration",
    order: 33,
  },
  {
    id: "contracts",
    labelKey: "contracts",
    href: "/hr/contracts",
    icon: "briefcase",
    permission: "hr.staff.read",
    group: "administration",
    order: 32,
  },
  {
    id: "my-staff-record",
    labelKey: "myStaffRecord",
    href: "/hr/me",
    icon: "briefcase",
    permission: "hr.staff.self",
    group: "administration",
    order: 31,
  },
);
registerNav(
  {
    id: "students",
    labelKey: "students",
    href: "/stu/students",
    icon: "graduation",
    permission: "stu.student.read",
    group: "students",
    order: 10,
  },
  {
    id: "student-lists",
    labelKey: "studentLists",
    href: "/stu/lists",
    icon: "clipboard",
    permission: "stu.student.read",
    group: "students",
    order: 12,
  },
  {
    id: "student-statistics",
    labelKey: "studentStatistics",
    href: "/stu/statistics",
    icon: "chart",
    permission: "stu.student.read",
    group: "students",
    order: 13,
  },
  {
    id: "student-home",
    labelKey: "studentHome",
    href: "/stu/home",
    icon: "home",
    permission: "stu.student.self",
    group: "students",
    order: 10,
  },
  {
    id: "my-student-record",
    labelKey: "myStudentRecord",
    href: "/stu/me",
    icon: "graduation",
    permission: "stu.student.self",
    group: "students",
    order: 11,
  },
);
registerNav(
  {
    id: "forms",
    labelKey: "forms",
    href: "/forms",
    icon: "clipboard",
    permission: "plt.form.submit",
    group: "students",
    order: 90,
  },
  {
    id: "forms-inbox",
    labelKey: "formsInbox",
    href: "/forms/inbox",
    icon: "clipboard",
    permission: "plt.form.inbox",
    group: "administration",
    order: 40,
  },
  {
    id: "admin-forms",
    labelKey: "adminForms",
    href: "/admin/forms",
    icon: "settings",
    permission: "plt.form.manage",
    group: "system",
    order: 40,
  },
);
registerNav(
  {
    id: "timetable",
    labelKey: "timetable",
    href: "/cal/timetable",
    icon: "calendar",
    permission: "cal.timetable.read",
    group: "teaching",
    order: 7,
  },
  {
    id: "my-timetable",
    labelKey: "myTimetable",
    href: "/cal/timetable/mine",
    icon: "calendar",
    permission: "cal.timetable.self",
    group: "teaching",
    order: 8,
  },
);
registerNav({
  id: "documents",
  labelKey: "documents",
  href: "/admin/documents",
  icon: "file",
  permission: "plt.document.manage",
  group: "system",
  order: 41,
});
registerNav(
  {
    id: "my-attendance",
    labelKey: "myAttendance",
    href: "/att/mine",
    icon: "clipboard",
    permission: "att.attendance.record",
    group: "teaching",
    order: 9,
  },
  {
    id: "attendance-sessions",
    labelKey: "attendanceSessions",
    href: "/att/sessions",
    icon: "clipboard",
    permission: "att.attendance.read",
    group: "teaching",
    order: 10,
  },
  {
    id: "my-absences",
    labelKey: "myAbsences",
    href: "/att/absences",
    icon: "clipboard",
    permission: "att.attendance.self",
    group: "teaching",
    order: 11,
  },
  {
    id: "attendance-report",
    labelKey: "attendanceReport",
    href: "/att/report",
    icon: "clipboard",
    permission: "att.attendance.read",
    group: "teaching",
    order: 12,
  },
  {
    id: "attendance-summary",
    labelKey: "attendanceSummary",
    href: "/att/summary",
    icon: "clipboard",
    permission: "att.attendance.read",
    group: "teaching",
    order: 13,
  },
);
registerNav(
  {
    id: "fees",
    labelKey: "fees",
    href: "/fin/fees",
    icon: "wallet",
    permission: "fin.fee.read",
    group: "finance",
    order: 10,
  },
  {
    id: "payment-plans",
    labelKey: "paymentPlans",
    href: "/fin/plans",
    icon: "wallet",
    permission: "fin.plan.read",
    group: "finance",
    order: 20,
  },
);
