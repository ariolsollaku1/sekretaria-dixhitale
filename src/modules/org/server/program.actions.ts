"use server";

import "../permissions";
import { action } from "@/lib/actions";
import { programSchema, unitIdSchema, updateProgramSchema } from "../domain/schemas";
import * as programs from "./program.service";

export const createProgramAction = action({
  permission: "org.program.write",
  input: programSchema,
  handler: (input, ctx) => programs.createProgram(ctx, input),
});
export const updateProgramAction = action({
  permission: "org.program.write",
  input: updateProgramSchema,
  handler: ({ programId, ...input }, ctx) => programs.updateProgram(ctx, programId, input),
});
export const deactivateProgramAction = action({
  permission: "org.program.write",
  input: unitIdSchema,
  requireReason: true,
  handler: (input, ctx) => programs.deactivateProgram(ctx, input.id),
});
export const reactivateProgramAction = action({
  permission: "org.program.write",
  input: unitIdSchema,
  requireReason: true,
  handler: (input, ctx) => programs.reactivateProgram(ctx, input.id),
});
