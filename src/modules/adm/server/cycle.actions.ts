"use server";

import "../permissions";
import { action } from "@/lib/actions";
import { cycleSchema } from "../domain/schemas";
import * as cycles from "./cycle.service";

// AC-1, AC-12: Secretariat and Student Affairs configure cycles; the wrapper refuses everyone else.
export const saveCycleAction = action({
  permission: "adm.cycle.write",
  input: cycleSchema,
  handler: (input, ctx) => cycles.saveCycle(ctx, input),
});
