import { registerPermissions } from "@/lib/authz/registry";

// AC-12 (ORG-01). Roles follow the access matrix in docs/01-product/roles.md ("ORG — structure").
const READERS = [
  "sysadmin",
  "secretary",
  "student_affairs",
  "lecturer",
  "finance",
  "hr",
  "quality",
  "head_of_department",
  "program_coordinator",
] as const;

const READ = ["org.year.read", "org.faculty.read", "org.department.read", "org.program.read"];
const WRITE = ["org.year.write", "org.faculty.write", "org.department.write", "org.program.write"];

registerPermissions("org", {
  permissions: [...READ, ...WRITE],
  grants: {
    ...Object.fromEntries(READERS.map((r) => [r, READ])),
    sysadmin: [...READ, ...WRITE],
  },
});
