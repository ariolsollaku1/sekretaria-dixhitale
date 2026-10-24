"use server";

import "../permissions";
import { action } from "@/lib/actions";
import { grantScholarshipSchema, voidScholarshipSchema } from "../domain/scholarship-schemas";
import * as scholarships from "./scholarship.service";

// Finance decides on scholarships; the wrapper refuses a role without the permission before
// anything runs. Voiding demands a reason (AC-6).

export const grantScholarshipAction = action({
  permission: "fin.scholarship.write",
  input: grantScholarshipSchema,
  handler: (input, ctx) => scholarships.grantScholarship(ctx, input),
});

export const voidScholarshipAction = action({
  permission: "fin.scholarship.write",
  input: voidScholarshipSchema,
  requireReason: true,
  handler: (input, ctx) => scholarships.voidScholarship(ctx, input),
});
