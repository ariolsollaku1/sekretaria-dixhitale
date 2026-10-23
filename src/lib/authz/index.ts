export { can, assertCan, requirePermission, grantScopes, permissionsFor } from "./guard";
export { ForbiddenError, type ForbiddenResult } from "./check";
export { actionErrorFrom } from "./errors";
export {
  registerPermissions,
  registerScopeResolver,
  registerTargetResolver,
  type ScopeResolver,
  type TargetResolver,
} from "./registry";
export { ROLES, SCOPE_TYPES, ALLOWED_SCOPES, type Role, type ScopeType } from "./roles";
export type { Permission, Target, TargetScope, GrantScopes } from "./types";
export { assignRole, revokeRole, AssignmentError } from "./assignments";
export type { AssignmentInput } from "./assignment-rules";
