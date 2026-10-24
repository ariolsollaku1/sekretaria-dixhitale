import { z } from "zod";
import { ROLES, SCOPE_TYPES } from "@/lib/authz/roles";
import { normalizeEmail } from "./rules";

// One schema for the form and the server action (conventions.md). Error messages are catalog
// keys under `iam.errors.*`; the UI translates them.
export const emailSchema = z
  .string()
  .trim()
  .min(1, "required")
  .transform(normalizeEmail)
  .pipe(z.email("invalidEmail"));

export const roleAssignmentSchema = z.object({
  role: z.enum(ROLES),
  scopeType: z.enum(SCOPE_TYPES),
  scopeId: z.string().trim().min(1).nullish(),
});
export type RoleAssignmentInput = z.infer<typeof roleAssignmentSchema>;

const nameSchema = z.string().trim().min(1, "required").max(100);

export const createUserSchema = z.object({
  email: emailSchema,
  firstName: nameSchema,
  lastName: nameSchema,
  roles: z.array(roleAssignmentSchema).min(1, "atLeastOneRole").max(20),
  /** AC-3: confirm linking a Keycloak user that exists only in the identity provider. */
  linkExisting: z.boolean().default(false),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object({
  userId: z.string().min(1),
  email: emailSchema,
  firstName: nameSchema,
  lastName: nameSchema,
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const userIdSchema = z.object({ userId: z.string().min(1) });

export const assignRoleSchema = z.object({
  userId: z.string().min(1),
  assignment: roleAssignmentSchema,
});
// IAM-02 — account provisioning
export const provisionStudentSchema = z.object({ studentId: z.string().min(1) });
export const provisionStaffSchema = z.object({
  staffId: z.string().min(1),
  role: z.enum(ROLES),
});
export const cohortAccountsSchema = z.object({ cohortId: z.string().min(1) });

export const revokeRoleSchema = z.object({
  userId: z.string().min(1),
  assignmentId: z.string().min(1),
});
