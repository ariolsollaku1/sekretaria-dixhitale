"use client";
import { createContext, useContext, useMemo, type ReactNode } from "react";

// AC-10: only a flat list of permission strings reaches the browser. This is for hiding UI; the
// server re-checks every read and write.
const PermissionsContext = createContext<ReadonlySet<string>>(new Set());

export function PermissionsProvider({
  permissions,
  children,
}: {
  permissions: readonly string[];
  children: ReactNode;
}) {
  const set = useMemo(() => new Set(permissions), [permissions]);
  return <PermissionsContext.Provider value={set}>{children}</PermissionsContext.Provider>;
}

export function useCan(permission: string): boolean {
  return useContext(PermissionsContext).has(permission);
}
