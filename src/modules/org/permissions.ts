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

registerPermissions("org", {
  permissions: ["org.year.read", "org.year.write"],
  grants: {
    ...Object.fromEntries(READERS.map((r) => [r, ["org.year.read"]])),
    sysadmin: ["org.year.read", "org.year.write"],
  },
});
