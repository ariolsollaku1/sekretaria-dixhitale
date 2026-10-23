export const ROLES = [
  "sysadmin",
  "secretary",
  "student_affairs",
  "lecturer",
  "finance",
  "hr",
  "quality",
  "library",
  "administration",
  "student",
  "head_of_department",
  "program_coordinator",
  "erasmus",
] as const;
export type Role = (typeof ROLES)[number];

export const SCOPE_TYPES = ["INSTITUTION", "FACULTY", "DEPARTMENT", "PROGRAM", "SELF"] as const;
export type ScopeType = (typeof SCOPE_TYPES)[number];

/** Scope types whose assignment needs a scopeId pointing at a faculty/department/program. */
export const ID_SCOPES: readonly ScopeType[] = ["FACULTY", "DEPARTMENT", "PROGRAM"];

/**
 * Which scope types a role may be assigned with (roles.md "Typical scope"). The first entry is the
 * default. Deliberately permissive where roles.md says "faculty or institution".
 */
export const ALLOWED_SCOPES: Record<Role, readonly ScopeType[]> = {
  sysadmin: ["INSTITUTION"],
  secretary: ["INSTITUTION", "FACULTY"],
  student_affairs: ["INSTITUTION"],
  lecturer: ["SELF"],
  finance: ["INSTITUTION"],
  hr: ["INSTITUTION"],
  quality: ["INSTITUTION"],
  library: ["INSTITUTION"],
  administration: ["INSTITUTION"],
  student: ["SELF"],
  head_of_department: ["DEPARTMENT"],
  program_coordinator: ["PROGRAM"],
  erasmus: ["INSTITUTION"],
};

/** i18n keys for role names (catalogs arrive with PLT-06). */
export const roleLabelKey = (role: Role) => `roles.${role}`;
