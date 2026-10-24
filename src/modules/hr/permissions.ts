import { registerPermissions } from "@/lib/authz/registry";
import { ROLES } from "@/lib/authz/roles";
import { registerSensitiveFields } from "@/lib/audit/diff";

// AC-13 (HR-01), roles.md "HR — staff". Reads are role-based and scoped by the assignment (a head
// of department sees their department); personal identifiers need `hr.staff.sensitive` (Q-31).
const READ = ["hr.staff.read"];

registerPermissions("hr", {
  permissions: [
    "hr.staff.read",
    "hr.staff.write",
    "hr.staff.sensitive",
    "hr.staff.self",
    "hr.workspace.self",
  ],
  grants: {
    ...Object.fromEntries(ROLES.filter((r) => r !== "student").map((r) => [r, ["hr.staff.self"]])),
    // HR-07 (Q-80): the lecturer workspace is for the lecturer role.
    lecturer: ["hr.staff.self", "hr.workspace.self"],
    sysadmin: [...READ, "hr.staff.sensitive", "hr.staff.self"],
    secretary: [...READ, "hr.staff.self"],
    finance: [...READ, "hr.staff.self"],
    quality: [...READ, "hr.staff.self"],
    head_of_department: [...READ, "hr.staff.self"],
    hr: [...READ, "hr.staff.write", "hr.staff.sensitive", "hr.staff.self"],
  },
});

// AC-6: personal values never reach the audit trail (national ID is masked by default).
registerSensitiveFields("birthDate", "phone", "address");
