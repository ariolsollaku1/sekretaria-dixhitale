"use server";

import "../permissions";
import { action } from "@/lib/actions";
import { changeStatusSchema, transferSchema } from "../domain/schemas";
import * as status from "./status.service";

// A reason is mandatory for every status change (audited with the event).
export const changeStatusAction = action({
  permission: "stu.student.write",
  input: changeStatusSchema,
  requireReason: true,
  handler: (input, ctx) => status.changeEnrollmentStatus(ctx, input),
});

export const transferAction = action({
  permission: "stu.student.write",
  input: transferSchema,
  requireReason: true,
  handler: (input, ctx) => status.transferEnrollment(ctx, input),
});
