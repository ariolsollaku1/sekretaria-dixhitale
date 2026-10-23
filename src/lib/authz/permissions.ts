import { registerPermissions } from "./registry";

// AC-11: platform permissions. Every other module registers its own next to its code.
export const PLATFORM_PERMISSIONS = [
  "iam.user.read",
  "iam.user.write",
  "plt.audit.read",
  "plt.settings.write",
] as const;

registerPermissions("iam", {
  permissions: ["iam.user.read", "iam.user.write"],
  grants: { sysadmin: ["iam.user.read", "iam.user.write"] },
});
registerPermissions("plt", {
  permissions: ["plt.audit.read", "plt.settings.write"],
  grants: { sysadmin: ["plt.audit.read", "plt.settings.write"] },
});
