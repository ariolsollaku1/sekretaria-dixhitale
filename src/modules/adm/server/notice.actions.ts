"use server";

import "../permissions";
import { action } from "@/lib/actions";
import { createNoticeSchema, updateNoticeSchema } from "../domain/schemas";
import * as notices from "./notice.service";

// AC-6: the wrapper refuses a role without `adm.notice.write`; the NTF-01 service then also checks
// the institution-wide grant that audience ALL needs.
export const createNoticeAction = action({
  permission: "adm.notice.write",
  input: createNoticeSchema,
  handler: (input, ctx) => notices.createNotice(ctx, input),
});

export const updateNoticeAction = action({
  permission: "adm.notice.write",
  input: updateNoticeSchema,
  handler: ({ noticeId, ...input }, ctx) => notices.updateNotice(ctx, noticeId, input),
});
