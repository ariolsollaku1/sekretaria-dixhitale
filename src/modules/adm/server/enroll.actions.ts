"use server";

import "../permissions";
import { action } from "@/lib/actions";
import { enrollManySchema, enrollSchema } from "../domain/enroll-schemas";
import * as enrollment from "./enroll.service";

// AC-1: only holders of adm.application.enroll (Secretariat, Student Affairs) get past the wrapper.
export const enrollApplicationAction = action({
  permission: "adm.application.enroll",
  input: enrollSchema,
  handler: (input, ctx) => enrollment.enrollApplication(ctx, input),
});

export const enrollManyAction = action({
  permission: "adm.application.enroll",
  input: enrollManySchema,
  handler: (input, ctx) => enrollment.enrollMany(ctx, input),
});
