"use server";

import "../permissions";
import { z } from "zod";
import { action } from "@/lib/actions";
import { createFeedToken, revokeFeedToken } from "./feed.service";

const none = z.object({});

export const createFeedAction = action({
  permission: "cal.event.read",
  input: none,
  handler: (_input, ctx) => createFeedToken(ctx),
});

export const revokeFeedAction = action({
  permission: "cal.event.read",
  input: none,
  handler: (_input, ctx) => revokeFeedToken(ctx),
});
