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
