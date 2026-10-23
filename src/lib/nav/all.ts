import { registerNav } from "./registry";

// Each module registers its entries here (one import per module index.ts) so the shell never
// depends on module internals. Platform entry:
registerNav({ id: "dashboard", labelKey: "dashboard", href: "/", icon: "home", order: 0 });
registerNav({
  id: "audit",
  labelKey: "audit",
  href: "/admin/audit",
  icon: "shield",
  permission: "plt.audit.read",
  group: "system",
  order: 10,
});
registerNav({
  id: "users",
  labelKey: "users",
  href: "/admin/users",
  icon: "users",
  permission: "iam.user.read",
  group: "system",
  order: 5,
});
