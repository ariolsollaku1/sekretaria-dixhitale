import type { Role, ScopeType } from "./roles";

/** `<module>.<resource>.<action>`, e.g. `stu.student.read`. */
export type Permission = string;

export type Assignment = {
  role: Role;
  scopeType: ScopeType;
  scopeId: string | null;
  validFrom: Date;
  validTo: Date | null;
};

export type Actor = { id: string; active: boolean };

/** Where a record sits in the hierarchy, plus who owns it (SELF scope). */
export type TargetScope = {
  facultyId?: string;
  departmentId?: string;
  programId?: string;
  /** Users who are "the owner": the student, or every lecturer teaching the course. */
  ownerUserIds?: readonly string[];
};

/** A reference a module can resolve to a TargetScope, e.g. `{ kind: "student", id }`. */
export type Target = { kind: string; id: string };

/** AC-7: which parts of the institution a user may see for a permission. */
export type GrantScopes = {
  institution: boolean;
  facultyIds: string[];
  departmentIds: string[];
  programIds: string[];
  self: boolean;
};
