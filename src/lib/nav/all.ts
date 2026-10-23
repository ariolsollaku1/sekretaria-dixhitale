import { registerNav } from "./registry";

// Each module registers its entries here (one import per module index.ts) so the shell never
// depends on module internals. Platform entry:
registerNav({ id: "dashboard", labelKey: "dashboard", href: "/", icon: "home", order: 0 });
