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
