import { registerPermissions } from "@/lib/authz/registry";
import { ROLES } from "@/lib/authz/roles";

// AC-12 (NTF-01), roles.md "NTF — announcements": everyone reads; these offices publish. The
// write permission's scope comes from the role assignment (checked per audience in the service).
const WRITERS = [
  "sysadmin",
  "secretary",
  "student_affairs",
  "finance",
  "hr",
  "quality",
  "administration",
  "head_of_department",
  "program_coordinator",
] as const;

registerPermissions("ntf", {
  permissions: ["ntf.announcement.read", "ntf.announcement.write"],
  grants: {
    ...Object.fromEntries(ROLES.map((r) => [r, ["ntf.announcement.read"]])),
    ...Object.fromEntries(
      WRITERS.map((r) => [r, ["ntf.announcement.read", "ntf.announcement.write"]]),
    ),
  },
});
