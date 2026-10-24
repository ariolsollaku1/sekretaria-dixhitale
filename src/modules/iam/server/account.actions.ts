"use server";

import { z } from "zod";
import { action } from "@/lib/actions";
import {
  cohortAccountsSchema,
  provisionStaffSchema,
  provisionStudentSchema,
} from "../domain/schemas";
import "../permissions";
import "./account-hooks";
import * as accounts from "./account.service";
import { getIdentityProvider } from "./provider";

// Thin wrappers (conventions.md): permission -> Zod -> transaction -> audit live in `action`.

export const provisionStudentAccountAction = action({
  permission: "iam.account.student",
  input: provisionStudentSchema,
  handler: (input, ctx) =>
    accounts.provisionStudentAccount(ctx, getIdentityProvider(), input.studentId),
});

export const resendStudentActivationAction = action({
  permission: "iam.account.student",
  input: provisionStudentSchema,
  handler: (input, ctx) =>
    accounts.resendStudentActivation(ctx, getIdentityProvider(), input.studentId),
});

export const provisionStaffAccountAction = action({
  permission: "iam.account.staff",
  input: provisionStaffSchema,
  handler: (input, ctx) => accounts.provisionStaffAccount(ctx, getIdentityProvider(), input),
});

export const resendStaffActivationAction = action({
  permission: "iam.account.staff",
  input: z.object({ staffId: z.string().min(1) }),
  handler: (input, ctx) =>
    accounts.resendStaffActivation(ctx, getIdentityProvider(), input.staffId),
});

export const provisionCohortAction = action({
  permission: "iam.account.student",
  input: cohortAccountsSchema,
  handler: (input, ctx) => accounts.provisionCohort(ctx, getIdentityProvider(), input.cohortId),
});
