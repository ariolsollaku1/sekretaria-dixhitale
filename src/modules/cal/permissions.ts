import { registerPermissions } from "@/lib/authz/registry";
import { ROLES } from "@/lib/authz/roles";

// AC-14 (CAL-01). Everyone reads the calendar; the Secretariat and sysadmin maintain it
// (roles.md "CAL — calendar, timetable").
registerPermissions("cal", {
  permissions: ["cal.event.read", "cal.event.write"],
  grants: {
    ...Object.fromEntries(ROLES.map((r) => [r, ["cal.event.read"]])),
    sysadmin: ["cal.event.read", "cal.event.write"],
    secretary: ["cal.event.read", "cal.event.write"],
  },
});
