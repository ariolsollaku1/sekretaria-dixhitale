import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { getScopeResolver } from "@/lib/authz/registry";
import { ALLOWED_SCOPES, ID_SCOPES, ROLES, type Role, type ScopeType } from "@/lib/authz/roles";
import { canResendActivation } from "../domain/rules";

export const USERS_PAGE_SIZE = 25;

export type UserFilters = { q?: string; role?: string; status?: string };

export type UserListRow = {
  id: string;
  name: string;
  email: string;
  active: boolean;
  lastLoginAt: Date | null;
  roles: Role[];
};

function where(filters: UserFilters): Prisma.UserWhereInput {
  const w: Prisma.UserWhereInput = {};
  const q = filters.q?.trim();
  if (q)
    w.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
    ];
  if (filters.role && (ROLES as readonly string[]).includes(filters.role))
    w.roles = { some: { role: filters.role as Role } };
  if (filters.status === "active") w.active = true;
  if (filters.status === "inactive") w.active = false;
  return w;
}

/** AC-1: search by name/email, filter by role and status, server-side pagination. */
export async function listUsers(filters: UserFilters, page: number) {
  const w = where(filters);
  const total = await db.user.count({ where: w });
  const pageCount = Math.max(1, Math.ceil(total / USERS_PAGE_SIZE));
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pageCount);
  const rows = await db.user.findMany({
    where: w,
    orderBy: [{ name: "asc" }, { id: "asc" }],
    skip: (current - 1) * USERS_PAGE_SIZE,
    take: USERS_PAGE_SIZE,
    select: {
      id: true,
      name: true,
      email: true,
      active: true,
      lastLoginAt: true,
      roles: { select: { role: true } },
    },
  });
  const list: UserListRow[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    active: r.active,
    lastLoginAt: r.lastLoginAt,
    roles: [...new Set(r.roles.map((x) => x.role))],
  }));
  return { rows: list, total, page: current, pageCount };
}

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
