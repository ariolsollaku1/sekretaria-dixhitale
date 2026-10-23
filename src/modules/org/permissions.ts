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

// AC-12 (ORG-04): cohorts and student groups. Everyone who reads the structure reads them (the
// assignment scope narrows heads and coordinators to their programs); the offices that run the
// students write (Q-33).
const COHORT_READ = ["org.cohort.read", "org.group.read"];
const COHORT_WRITE = ["org.cohort.write", "org.group.write"];

registerPermissions("org", {
  permissions: [...COHORT_READ, ...COHORT_WRITE],
  grants: {
    ...Object.fromEntries(READERS.map((r) => [r, COHORT_READ])),
    sysadmin: [...COHORT_READ, ...COHORT_WRITE],
    secretary: [...COHORT_READ, ...COHORT_WRITE],
    student_affairs: [...COHORT_READ, ...COHORT_WRITE],
  },
});
