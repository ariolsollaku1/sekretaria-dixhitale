"use server";

import "../permissions";
import { action } from "@/lib/actions";
import { makeCurrentSchema, updateYearSchema, yearSchema } from "../domain/schemas";
import * as years from "./year.service";

export const createYearAction = action({
  permission: "org.year.write",
  input: yearSchema,
  handler: (input, ctx) => years.createYear(ctx, input),
});

export const updateYearAction = action({
  permission: "org.year.write",
  input: updateYearSchema,
  handler: ({ yearId, ...input }, ctx) => years.updateYear(ctx, yearId, input),
});

/** AC-5: needs a reason (audited), which closes the previous current year. */
export const makeCurrentAction = action({
  permission: "org.year.write",
  input: makeCurrentSchema,
  requireReason: true,
  handler: (input, ctx) => years.makeCurrent(ctx, input.yearId),
});
