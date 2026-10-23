import "server-only";
import { db } from "@/lib/db";
import { getScopeResolver } from "@/lib/authz/registry";
import { ALLOWED_SCOPES, ID_SCOPES, ROLES, type Role, type ScopeType } from "@/lib/authz/roles";
import { canResendActivation } from "../domain/rules";

export async function getUserDetail(id: string) {
  const user = await db.user.findUnique({
    where: { id },
    include: { roles: { orderBy: [{ role: "asc" }, { createdAt: "asc" }] } },
  });
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    active: user.active,
    lastLoginAt: user.lastLoginAt,
    canResend: canResendActivation(user),
    roles: user.roles.map((r) => ({
      id: r.id,
      role: r.role,
      scopeType: r.scopeType,
      scopeId: r.scopeId,
      validFrom: r.validFrom,
      validTo: r.validTo,
    })),
  };
}

export type ScopeChoice = { id: string; label: string };
export type RoleEditorOptions = {
  /** Scope types per role that the editor can actually offer right now. */
  allowedScopes: Record<Role, ScopeType[]>;
  /** Pickable targets for faculty/department/program scopes (only those with a resolver). */
  scopeChoices: Partial<Record<ScopeType, ScopeChoice[]>>;
};

/** Until ORG registers resolvers only INSTITUTION and SELF are offered (spec, UI section). */
export async function getRoleEditorOptions(): Promise<RoleEditorOptions> {
  const scopeChoices: RoleEditorOptions["scopeChoices"] = {};
  const usable = new Set<ScopeType>(["INSTITUTION", "SELF"]);
  for (const type of ID_SCOPES) {
    const options = await getScopeResolver(type)?.options?.();
    if (options) {
      scopeChoices[type] = options;
      usable.add(type);
    }
  }
  const allowedScopes = Object.fromEntries(
    ROLES.map((role) => [role, ALLOWED_SCOPES[role].filter((s) => usable.has(s))]),
  ) as RoleEditorOptions["allowedScopes"];
  return { allowedScopes, scopeChoices };
}
