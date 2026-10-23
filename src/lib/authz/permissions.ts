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
  ],
  grants: {
    sysadmin: ["plt.audit.read", "plt.settings.write", "plt.file.upload", "plt.file.read"],
  },
});
// PLT-10: saving a personal table filter is not sensitive, so every role may.
registerPermissions("plt", {
  permissions: [],
  grants: Object.fromEntries(ROLES.map((r) => [r, ["plt.view.save"]])),
});
