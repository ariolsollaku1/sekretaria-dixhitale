import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { Tx } from "@/lib/db";
import { AssignmentError, checkAssignmentShape, type AssignmentInput } from "./assignment-rules";
import { getScopeResolver } from "./registry";
import { ID_SCOPES } from "./roles";

/**
 * AC-9: validates, then stores a role assignment. Runs inside the caller's transaction (IAM-01's
 * action wrapper adds permission check and audit). Assignments take effect on the user's next
 * request because nothing caches them across requests (AC-8).
 */
export async function assignRole(
  tx: Tx,
  userId: string,
  input: AssignmentInput,
  createdById?: string,
) {
  const shapeError = checkAssignmentShape(input);
  if (shapeError) throw shapeError;

  if (ID_SCOPES.includes(input.scopeType)) {
    const resolver = getScopeResolver(input.scopeType);
    if (!resolver)
      throw new AssignmentError("NO_RESOLVER", `No resolver registered for ${input.scopeType}`);
    if (!(await resolver.exists(input.scopeId!))) {
      throw new AssignmentError(
        "SCOPE_NOT_FOUND",
        `${input.scopeType} ${input.scopeId} does not exist`,
      );
    }
  }

  try {
    return await tx.userRole.create({
      data: {
        userId,
        role: input.role,
        scopeType: input.scopeType,
        scopeId: input.scopeId ?? null,
        validFrom: input.validFrom,
        validTo: input.validTo ?? null,
        createdById,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AssignmentError("DUPLICATE", "The user already has this role with this scope");
    }
    throw error;
  }
}

/** Removes an assignment (a technical row; the audit log of PLT-07 keeps the history). */
export async function revokeRole(tx: Tx, assignmentId: string): Promise<void> {
  await tx.userRole.deleteMany({ where: { id: assignmentId } });
}

export { AssignmentError };
