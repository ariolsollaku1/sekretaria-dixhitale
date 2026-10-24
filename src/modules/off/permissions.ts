import { registerPermissions } from "@/lib/authz/registry";
import { ROLES } from "@/lib/authz/roles";

// OFF-01, roles.md "OFF — admin requests": every staff member submits requests (SRC-140);
// administration processes them (forms inbox, PLT-15); HR and administration read the history of a
// staff member (Q-102).
registerPermissions("off", {
  permissions: ["off.request.submit", "off.request.history"],
  grants: {
    ...Object.fromEntries(
      ROLES.filter((r) => r !== "student").map((r) => [r, ["off.request.submit"]]),
    ),
    sysadmin: ["off.request.submit", "off.request.history"],
    hr: ["off.request.submit", "off.request.history"],
    administration: ["off.request.submit", "off.request.history"],
  },
});
