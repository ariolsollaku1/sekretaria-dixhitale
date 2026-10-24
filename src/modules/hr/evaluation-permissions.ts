import { registerPermissions } from "@/lib/authz/registry";
import { ROLES } from "@/lib/authz/roles";

// HR-06 AC-3..AC-10. Managing campaigns is HR's job; reading evaluations is limited to HR, quality
// and (by scope) heads of department. Filling is open to every staff role because the real guard
// is the assignment (AC-7); the evaluated person reads only their own visible result (AC-9).
const STAFF_ROLES = ROLES.filter((r) => r !== "student");

registerPermissions("hr", {
  permissions: [
    "hr.evaluation.manage",
    "hr.evaluation.read",
    "hr.evaluation.fill",
    "hr.evaluation.self",
  ],
  grants: {
    ...Object.fromEntries(
      STAFF_ROLES.map((r) => [r, ["hr.evaluation.fill", "hr.evaluation.self"]]),
    ),
    sysadmin: [
      "hr.evaluation.manage",
      "hr.evaluation.read",
      "hr.evaluation.fill",
      "hr.evaluation.self",
    ],
    hr: ["hr.evaluation.manage", "hr.evaluation.read", "hr.evaluation.fill", "hr.evaluation.self"],
    quality: ["hr.evaluation.read", "hr.evaluation.fill", "hr.evaluation.self"],
    head_of_department: ["hr.evaluation.read", "hr.evaluation.fill", "hr.evaluation.self"],
  },
});
