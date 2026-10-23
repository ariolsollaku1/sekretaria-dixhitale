import { ROLES, type Role, type ScopeType } from "./roles";
import type { Permission, Target, TargetScope } from "./types";

// Modules contribute permissions and grants by calling the register* functions at import time.
// Process-wide singletons; tests use resetRegistry().

type Grants = Partial<Record<Role, readonly Permission[]>>;

const PERMISSION_FORMAT = /^[a-z]+\.[a-z_]+\.[a-z_]+$/;

const permissions = new Set<Permission>();
const grantsByRole = new Map<Role, Set<Permission>>();

export function registerPermissions(
  moduleName: string,
  def: { permissions: readonly Permission[]; grants: Grants },
): void {
  for (const p of def.permissions) {
    if (!PERMISSION_FORMAT.test(p))
      throw new Error(`Invalid permission "${p}" (module ${moduleName})`);
    if (!p.startsWith(`${moduleName}.`)) {
      throw new Error(`Permission "${p}" must start with its module "${moduleName}."`);
    }
    permissions.add(p);
  }
  for (const role of Object.keys(def.grants) as Role[]) {
    if (!ROLES.includes(role)) throw new Error(`Unknown role "${role}" (module ${moduleName})`);
    for (const p of def.grants[role] ?? []) {
      if (!permissions.has(p))
        throw new Error(`Grant of unregistered permission "${p}" to ${role}`);
      let set = grantsByRole.get(role);
      if (!set) grantsByRole.set(role, (set = new Set()));
      set.add(p);
    }
  }
}

export function isRegisteredPermission(p: Permission): boolean {
  return permissions.has(p);
}

export function roleGrants(role: Role, permission: Permission): boolean {
  return grantsByRole.get(role)?.has(permission) ?? false;
}

/** All permissions a role grants (for flattening to the client). */
export function permissionsOfRole(role: Role): readonly Permission[] {
  return [...(grantsByRole.get(role) ?? [])];
}

export function allPermissions(): readonly Permission[] {
  return [...permissions];
}

// ---- scope resolvers (ORG-02/ORG-03 register FACULTY, DEPARTMENT, PROGRAM) ----------------------

export type ScopeResolver = {
  exists(id: string): Promise<boolean>;
  /** Choices for a scope picker (e.g. all faculties). Without it the UI cannot offer this scope. */
  options?(): Promise<{ id: string; label: string }[]>;
  /** Parents of the node, e.g. a program -> its department and faculty. */
  ancestors(id: string): Promise<Pick<TargetScope, "facultyId" | "departmentId">>;
};

const scopeResolvers = new Map<ScopeType, ScopeResolver>();

export function registerScopeResolver(scopeType: ScopeType, resolver: ScopeResolver): void {
  scopeResolvers.set(scopeType, resolver);
}

export function getScopeResolver(scopeType: ScopeType): ScopeResolver | undefined {
  return scopeResolvers.get(scopeType);
}

// ---- target resolvers --------------------------------------------------------------------------

export type TargetResolver = (id: string) => Promise<TargetScope | null>;

const targetResolvers = new Map<string, TargetResolver>();

export function registerTargetResolver(kind: string, resolver: TargetResolver): void {
  targetResolvers.set(kind, resolver);
}

/** Resolves a target reference to its scope chain. Unknown kind or record -> null (deny). */
export async function resolveTarget(target: Target): Promise<TargetScope | null> {
  const resolver = targetResolvers.get(target.kind);
  return resolver ? resolver(target.id) : null;
}

export function resetRegistry(): void {
  permissions.clear();
  grantsByRole.clear();
  scopeResolvers.clear();
  targetResolvers.clear();
}
