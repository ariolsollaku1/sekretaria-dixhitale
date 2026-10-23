import { ROLES } from "@/lib/authz/roles";
import { registerPermissions } from "@/lib/authz/registry";

// AC-12 (CUR-01). The write permission is role-based; its *scope* comes from the assignment, so a
// head of department (DEPARTMENT scope) writes only their department's courses.
registerPermissions("cur", {
  permissions: ["cur.course.read", "cur.course.write", "cur.category.write"],
  grants: {
    sysadmin: ["cur.course.read", "cur.course.write", "cur.category.write"],
    head_of_department: ["cur.course.read", "cur.course.write"],
    secretary: ["cur.course.read"],
    student_affairs: ["cur.course.read"],
    lecturer: ["cur.course.read"],
    hr: ["cur.course.read"],
    quality: ["cur.course.read"],
    program_coordinator: ["cur.course.read"],
  },
});

// AC-11 (CUR-02): plans. `view` shows approved plans (everyone who may look at plans); `read` adds
// the drafts and archive; `write` is scoped to the programs of the assignment (a coordinator: their
// program, a head of department: their department's programs).
registerPermissions("cur", {
  permissions: ["cur.plan.read", "cur.plan.view", "cur.plan.write"],
  grants: {
    sysadmin: ["cur.plan.read", "cur.plan.view", "cur.plan.write"],
    head_of_department: ["cur.plan.read", "cur.plan.view", "cur.plan.write"],
    program_coordinator: ["cur.plan.read", "cur.plan.view", "cur.plan.write"],
    secretary: ["cur.plan.read", "cur.plan.view"],
    student_affairs: ["cur.plan.read", "cur.plan.view"],
    hr: ["cur.plan.read", "cur.plan.view"],
    quality: ["cur.plan.read", "cur.plan.view"],
    lecturer: ["cur.plan.view"],
    student: ["cur.plan.view"],
  },
});

// AC-9 (CUR-04): teaching assignments. Writes are scoped to the group's program (a head of
// department assigns inside their department); everyone with a staff record sees their own.
registerPermissions("cur", {
  permissions: ["cur.teaching.read", "cur.teaching.write", "cur.teaching.self"],
  grants: {
    ...Object.fromEntries(
      ROLES.filter((r) => r !== "student").map((r) => [r, ["cur.teaching.self"]]),
    ),
    sysadmin: ["cur.teaching.read", "cur.teaching.write", "cur.teaching.self"],
    secretary: ["cur.teaching.read", "cur.teaching.write", "cur.teaching.self"],
    head_of_department: ["cur.teaching.read", "cur.teaching.write", "cur.teaching.self"],
    student_affairs: ["cur.teaching.read", "cur.teaching.self"],
    finance: ["cur.teaching.read", "cur.teaching.self"],
    hr: ["cur.teaching.read", "cur.teaching.self"],
    quality: ["cur.teaching.read", "cur.teaching.self"],
    program_coordinator: ["cur.teaching.read", "cur.teaching.self"],
  },
});

// AC-9/AC-10 (CUR-03): syllabi. `view` opens approved ones (as for plans, students included);
// `read` adds drafts and archived versions; `write` is scoped to the plan's program.
registerPermissions("cur", {
  permissions: ["cur.syllabus.view", "cur.syllabus.read", "cur.syllabus.write"],
  grants: {
    sysadmin: ["cur.syllabus.view", "cur.syllabus.read", "cur.syllabus.write"],
    head_of_department: ["cur.syllabus.view", "cur.syllabus.read", "cur.syllabus.write"],
    program_coordinator: ["cur.syllabus.view", "cur.syllabus.read", "cur.syllabus.write"],
    secretary: ["cur.syllabus.view", "cur.syllabus.read"],
    student_affairs: ["cur.syllabus.view", "cur.syllabus.read"],
    hr: ["cur.syllabus.view", "cur.syllabus.read"],
    quality: ["cur.syllabus.view", "cur.syllabus.read"],
    lecturer: ["cur.syllabus.view"],
    student: ["cur.syllabus.view"],
  },
});
