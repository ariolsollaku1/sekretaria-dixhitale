"use server";

import { z } from "zod";
import { action } from "@/lib/actions";
import "@/lib/authz/permissions";
import * as definitions from "./definition.service";

const draft = z.object({
  audience: z.enum(["PUBLIC", "AUTHENTICATED"]),
  ownerRoles: z.array(z.string()).max(20),
  definition: z.string().min(2).max(200_000),
});
const id = z.object({ definitionId: z.string().min(1) });

export const createDraftAction = action({
  permission: "plt.form.manage",
  input: draft.extend({ key: z.string().trim().toLowerCase() }),
  handler: ({ key, ...input }, ctx) => definitions.createDraft(ctx, key, input),
});
export const updateDraftAction = action({
  permission: "plt.form.manage",
  input: draft.extend({ definitionId: z.string().min(1) }),
  handler: ({ definitionId, ...input }, ctx) => definitions.updateDraft(ctx, definitionId, input),
});
export const publishAction = action({
  permission: "plt.form.manage",
  input: id,
  handler: ({ definitionId }, ctx) => definitions.publish(ctx, definitionId),
});
export const archiveAction = action({
  permission: "plt.form.manage",
  input: id,
  requireReason: true,
  handler: ({ definitionId }, ctx) => definitions.archive(ctx, definitionId),
});
export const deleteDraftAction = action({
  permission: "plt.form.manage",
  input: id,
  handler: ({ definitionId }, ctx) => definitions.deleteDraft(ctx, definitionId),
});
