import { registerPermissions } from "./registry";
import { ROLES } from "./roles";

// AC-11: platform permissions. Every other module registers its own next to its code.
export const PLATFORM_PERMISSIONS = [
  "iam.user.read",
  "iam.user.write",
  "plt.audit.read",
  "plt.settings.write",
  "plt.file.upload",
  "plt.file.read",
  "plt.view.save",
  "plt.jobs.read",
  "plt.jobs.manage",
  "plt.notification.use",
  "plt.form.manage",
  "plt.form.inbox",
  "plt.form.submit",
  "plt.document.manage",
] as const;

registerPermissions("iam", {
  permissions: ["iam.user.read", "iam.user.write"],
  grants: { sysadmin: ["iam.user.read", "iam.user.write"] },
});
registerPermissions("plt", {
  permissions: [
    "plt.audit.read",
    "plt.settings.write",
    "plt.file.upload",
    "plt.file.read",
    "plt.view.save",
    "plt.jobs.read",
    "plt.jobs.manage",
    "plt.notification.use",
    "plt.form.manage",
    "plt.form.inbox",
    "plt.form.submit",
    "plt.document.manage",
  ],
  grants: {
    sysadmin: [
      "plt.audit.read",
      "plt.settings.write",
      "plt.file.upload",
      "plt.file.read",
      "plt.jobs.read",
      "plt.jobs.manage",
      "plt.form.manage",
      "plt.document.manage",
    ],
  },
});
// Own-data conveniences that every role has: saving a table filter (PLT-10) and reading / managing
// one's own notifications (PLT-11).
registerPermissions("plt", {
  permissions: [],
  grants: Object.fromEntries(ROLES.map((r) => [r, ["plt.view.save", "plt.notification.use"]])),
});

// PLT-15: every signed-in user may submit authenticated forms and follow their own submissions;
// staff roles may open the inbox (which each form narrows to its `ownerRoles`).
registerPermissions("plt", {
  permissions: [],
  grants: Object.fromEntries(
    ROLES.map((r) => [
      r,
      r === "student" ? ["plt.form.submit"] : ["plt.form.submit", "plt.form.inbox"],
    ]),
  ),
});
