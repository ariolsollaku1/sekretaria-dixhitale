// Pure validation of a role assignment's shape (AC-9). Existence of the scope target is checked
// against the registered scope resolver in assignments.ts.
import { ALLOWED_SCOPES, ID_SCOPES, type Role, type ScopeType } from "./roles";

export type AssignmentInput = {
  role: Role;
  scopeType: ScopeType;
  scopeId?: string | null;
  validFrom?: Date;
  validTo?: Date | null;
};

export type AssignmentErrorCode =
  | "SCOPE_NOT_ALLOWED"
  | "SCOPE_ID_REQUIRED"
  | "SCOPE_ID_FORBIDDEN"
  | "INVALID_PERIOD"
  | "NO_RESOLVER"
  | "SCOPE_NOT_FOUND"
  | "DUPLICATE";

export class AssignmentError extends Error {
  constructor(
    readonly code: AssignmentErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AssignmentError";
  }
}

/** Returns the first problem found, or null when the shape is valid. */
export function checkAssignmentShape(input: AssignmentInput): AssignmentError | null {
  if (!ALLOWED_SCOPES[input.role].includes(input.scopeType)) {
    return new AssignmentError(
      "SCOPE_NOT_ALLOWED",
      `${input.role} cannot have scope ${input.scopeType}`,
    );
  }
  const needsId = ID_SCOPES.includes(input.scopeType);
  if (needsId && !input.scopeId) {
    return new AssignmentError("SCOPE_ID_REQUIRED", `${input.scopeType} scope needs a scopeId`);
  }
  if (!needsId && input.scopeId) {
    return new AssignmentError("SCOPE_ID_FORBIDDEN", `${input.scopeType} scope takes no scopeId`);
  }
  if (input.validFrom && input.validTo && input.validTo <= input.validFrom) {
    return new AssignmentError("INVALID_PERIOD", "validTo must be after validFrom");
  }
  return null;
}
