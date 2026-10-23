import { registerPermissions } from "@/lib/authz/registry";
import { registerSensitiveFields } from "@/lib/audit/diff";

// AC-13 (STU-01), roles.md "STU — student records". Reads of heads and coordinators are narrowed to
// their programs by the assignment scope; identifiers need `stu.student.sensitive` (Q-34).
const READ = ["stu.student.read"];

registerPermissions("stu", {
  permissions: [
    "stu.student.read",
    "stu.student.write",
    "stu.student.sensitive",
    "stu.student.self",
  ],
  grants: {
    sysadmin: [...READ, "stu.student.sensitive"],
    secretary: [...READ, "stu.student.write", "stu.student.sensitive"],
    student_affairs: [...READ, "stu.student.write", "stu.student.sensitive"],
    finance: READ,
    library: READ,
    quality: READ,
    head_of_department: READ,
    program_coordinator: READ,
    student: ["stu.student.self"],
  },
});

// AC-6: personal values never reach the audit trail (national ID is masked by default).
registerSensitiveFields("birthDate", "phone", "address", "birthPlace");
