import { registerPermissions } from "@/lib/authz/registry";

// AC-4 (ERS-01), roles.md "ERS — Erasmus": the Erasmus officer (and the sysadmin) read the
// applications; changing a state goes through the forms inbox, which the form's owner role opens.
registerPermissions("ers", {
  permissions: ["ers.application.read"],
  grants: {
    sysadmin: ["ers.application.read"],
    erasmus: ["ers.application.read"],
  },
});
