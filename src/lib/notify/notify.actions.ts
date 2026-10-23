"use server";

import { z } from "zod";
import { action, DomainError } from "@/lib/actions";
import { safeLink } from "./channels";
import { notify } from "./notify";
import { getNotificationType } from "./types";

const idSchema = z.object({ id: z.string().min(1) });

/** AC-9/AC-10: only the signed-in user's own rows can be touched (the userId is part of the filter). */
export const markReadAction = action({
  permission: "plt.notification.use",
  input: idSchema,
  handler: async (input, ctx) => {
    const result = await ctx.db.notification.updateMany({
      where: { id: input.id, userId: ctx.user.id, readAt: null },
      data: { readAt: new Date() },
    });
    return { changed: result.count };
  },
});

export const markAllReadAction = action({
  permission: "plt.notification.use",
  input: z.object({}),
  handler: async (_input, ctx) => {
    const result = await ctx.db.notification.updateMany({
      where: { userId: ctx.user.id, readAt: null },
      data: { readAt: new Date() },
    });
    return { changed: result.count };
  },
});

/** AC-11: mandatory types cannot be switched off. */
export const setPreferenceAction = action({
  permission: "plt.notification.use",
  input: z.object({ type: z.string().min(1).max(100), email: z.boolean() }),
  handler: async (input, ctx) => {
    const type = getNotificationType(input.type);
    if (!type || !type.emailable) throw new DomainError("NOT_FOUND", "Unknown notification type");
    if (type.mandatory) throw new DomainError("CONFLICT", "MANDATORY");
    await ctx.db.notificationPreference.upsert({
      where: { userId_type: { userId: ctx.user.id, type: input.type } },
      create: { userId: ctx.user.id, type: input.type, email: input.email },
      update: { email: input.email },
    });
    return { type: input.type, email: input.email };
  },
});

/** AC-12: lets a sysadmin verify notifications and mail end to end. */
export const sendTestMessageAction = action({
  permission: "plt.settings.write",
  input: z.object({}),
  handler: (_input, ctx) =>
    notify(ctx, {
      userId: ctx.user.id,
      type: "plt.test",
      params: { name: "Sekretari Dixhitale" },
      link: safeLink("/notifications"),
    }),
});
