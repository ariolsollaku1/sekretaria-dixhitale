"use server";

import { z } from "zod";
import { action } from "@/lib/actions";
import { getRequestContext } from "@/lib/audit/request-context";
import "@/lib/authz/permissions";
import "./all";
import * as submissions from "./submission.service";

/** AC-4..AC-6: public forms need no session. Returns the reference or what went wrong. */
export async function submitPublicFormAction(key: string, raw: Record<string, unknown>) {
  const request = await getRequestContext();
  return submissions.submitPublic(
    String(key).slice(0, 80),
    raw && typeof raw === "object" ? raw : {},
    request.ip,
  );
}

export const submitFormAction = action({
  permission: "plt.form.submit",
  input: z.object({ key: z.string().min(1).max(80), answers: z.record(z.string(), z.unknown()) }),
  handler: ({ key, answers }, ctx) => submissions.submitAuthenticated(ctx, key, answers),
});

// The inbox actions check the handler's role against the form inside the service.
export const changeStateAction = action({
  permission: "plt.form.inbox",
  input: z.object({
    submissionId: z.string().min(1),
    to: z.string().min(1),
    comment: z
      .string()
      .trim()
      .max(2000)
      .nullish()
      .transform((v) => v || null),
  }),
  handler: ({ submissionId, to, comment }, ctx) =>
    submissions.changeState(ctx, submissionId, to, comment),
});
export const assignAction = action({
  permission: "plt.form.inbox",
  input: z.object({
    submissionId: z.string().min(1),
    assigneeId: z
      .string()
      .nullish()
      .transform((v) => v || null),
  }),
  handler: ({ submissionId, assigneeId }, ctx) => submissions.assign(ctx, submissionId, assigneeId),
});
export const commentAction = action({
  permission: "plt.form.inbox",
  input: z.object({
    submissionId: z.string().min(1),
    comment: z.string().trim().min(1, "required").max(2000),
  }),
  handler: ({ submissionId, comment }, ctx) => submissions.addComment(ctx, submissionId, comment),
});
