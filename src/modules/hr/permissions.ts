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
    "hr.hours.read",
    "hr.hours.self",
    "hr.hours.approve",
    "hr.hours.adjust",
  ],
  grants: {
    ...Object.fromEntries(ROLES.filter((r) => r !== "student").map((r) => [r, ["hr.staff.self"]])),
    // HR-07 (Q-80): the lecturer workspace is for the lecturer role. HR-04 (Q-133): own hours.
    lecturer: ["hr.staff.self", "hr.workspace.self", "hr.hours.self"],
    // HR-04 (Q-131..Q-133): delivered hours are read by HR, Finance, the Secretariat and the sysadmin;
    // a head of department reads, adjusts and approves those of their department.
    sysadmin: [...READ, "hr.staff.sensitive", "hr.staff.self", "hr.hours.read"],
    secretary: [...READ, "hr.staff.self", "hr.hours.read"],
    finance: [...READ, "hr.staff.self", "hr.hours.read"],
    quality: [...READ, "hr.staff.self"],
    head_of_department: [
      ...READ,
      "hr.staff.self",
      "hr.hours.read",
      "hr.hours.approve",
      "hr.hours.adjust",
    ],
    hr: [
      ...READ,
      "hr.staff.write",
      "hr.staff.sensitive",
      "hr.staff.self",
      "hr.hours.read",
      "hr.hours.adjust",
    ],
  },
});

// AC-6: personal values never reach the audit trail (national ID is masked by default).
registerSensitiveFields("birthDate", "phone", "address");
