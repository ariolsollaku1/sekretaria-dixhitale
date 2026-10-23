"use server";

import { action } from "@/lib/actions";
import {
  assignRoleSchema,
  createUserSchema,
  revokeRoleSchema,
  updateUserSchema,
  userIdSchema,
} from "../domain/schemas";
import { getIdentityProvider } from "./provider";
import * as users from "./user.service";

// Thin wrappers (conventions.md): permission -> Zod -> transaction -> audit live in `action`.

export const createUserAction = action({
  permission: "iam.user.write",
  input: createUserSchema,
  handler: (input, ctx) => users.createUser(ctx, getIdentityProvider(), input),
});

export const updateUserAction = action({
  permission: "iam.user.write",
  input: updateUserSchema,
  handler: (input, ctx) => users.updateUser(ctx, getIdentityProvider(), input),
});

export const deactivateUserAction = action({
  permission: "iam.user.write",
  input: userIdSchema,
  requireReason: true,
  handler: (input, ctx) => users.deactivateUser(ctx, getIdentityProvider(), input.userId),
});

export const reactivateUserAction = action({
  permission: "iam.user.write",
  input: userIdSchema,
  requireReason: true,
  handler: (input, ctx) => users.reactivateUser(ctx, getIdentityProvider(), input.userId),
});

export const addRoleAction = action({
  permission: "iam.user.write",
  input: assignRoleSchema,
  handler: (input, ctx) =>
    users.addRole(ctx, getIdentityProvider(), input.userId, input.assignment),
});

export const removeRoleAction = action({
  permission: "iam.user.write",
  input: revokeRoleSchema,
  handler: (input, ctx) =>
    users.removeRole(ctx, getIdentityProvider(), input.userId, input.assignmentId),
});

export const resendActivationAction = action({
  permission: "iam.user.write",
  input: userIdSchema,
  handler: (input, ctx) => users.resendActivation(ctx, getIdentityProvider(), input.userId),
});
