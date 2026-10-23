import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth";
import { PermissionsProvider } from "@/lib/authz/client";
import { permissionsFor } from "@/lib/authz/guard";

// Every page below needs a signed-in user; the provider hands the flat permission list to client
// components (PLT-06 replaces this layout with the app shell).
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  return (
    <PermissionsProvider permissions={await permissionsFor(user)}>{children}</PermissionsProvider>
  );
}
