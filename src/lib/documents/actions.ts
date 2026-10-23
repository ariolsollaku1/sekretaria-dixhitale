"use server";

import { z } from "zod";
import { action } from "@/lib/actions";
import "@/lib/authz/permissions";
import { cancelDocument, issueDocument } from "./issue.service";
import { registerDocumentPurposes } from "./purposes";
import * as templates from "./template.service";
import { SAMPLE_TYPE } from "./types";

const body = z.object({
  language: z.string(),
  validFrom: z.string(),
  validTo: z.string().nullish(),
  html: z.string().max(200_000),
  notes: z.string().max(500).nullish(),
});
const id = z.object({ templateId: z.string().min(1) });

export const createTemplateAction = action({
  permission: "plt.document.manage",
  input: body.extend({ type: z.string() }),
  handler: ({ type, ...input }, ctx) => {
    registerDocumentPurposes();
    return templates.createDraft(ctx, type, input);
  },
});
export const updateTemplateAction = action({
  permission: "plt.document.manage",
  input: body.extend({ templateId: z.string().min(1) }),
  handler: ({ templateId, ...input }, ctx) => {
    registerDocumentPurposes();
    return templates.updateDraft(ctx, templateId, input);
  },
});
export const publishTemplateAction = action({
  permission: "plt.document.manage",
  input: id,
  handler: ({ templateId }, ctx) => templates.publish(ctx, templateId),
});
export const archiveTemplateAction = action({
  permission: "plt.document.manage",
  input: id,
  handler: ({ templateId }, ctx) => templates.archive(ctx, templateId),
});
export const discardTemplateAction = action({
  permission: "plt.document.manage",
  input: id,
  handler: ({ templateId }, ctx) => templates.discardDraft(ctx, templateId),
});

/** AC-10: a test document of the sample type, to try a published template end to end. */
export const issueTestDocumentAction = action({
  permission: "plt.document.manage",
  input: z.object({ language: z.enum(["sq", "en"]) }),
  handler: async ({ language }, ctx) => {
    registerDocumentPurposes();
    const { getDocumentType } = await import("./types");
    const data = getDocumentType(SAMPLE_TYPE)!.sampleData;
    return issueDocument(ctx, { type: SAMPLE_TYPE, language, data });
  },
});

export const cancelDocumentAction = action({
  permission: "plt.document.manage",
  input: z.object({ documentId: z.string().min(1) }),
  requireReason: true,
  handler: ({ documentId }, ctx) => cancelDocument(ctx, documentId),
});
