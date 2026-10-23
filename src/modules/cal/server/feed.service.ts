import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { DomainError, type ActionContext } from "@/lib/actions";
import { db } from "@/lib/db";

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

/** Tokens are 32 random bytes, base64url: 43 characters. */
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** AC-12/AC-13: (re)creates the user's link; only the hash is stored, the token is returned once. */
export async function createFeedToken(ctx: ActionContext) {
  const token = randomBytes(32).toString("base64url");
  const existing = await ctx.db.calendarFeedToken.findUnique({ where: { userId: ctx.user.id } });
  await ctx.db.calendarFeedToken.upsert({
    where: { userId: ctx.user.id },
    create: { userId: ctx.user.id, tokenHash: hash(token) },
    update: { tokenHash: hash(token), createdAt: new Date() },
  });
  await ctx.audit({
    action: existing ? "cal.feed.regenerate" : "cal.feed.create",
    entityType: "User",
    entityId: ctx.user.id,
    before: null,
    after: null,
  });
  return { token };
}

export async function revokeFeedToken(ctx: ActionContext) {
  const existing = await ctx.db.calendarFeedToken.findUnique({ where: { userId: ctx.user.id } });
  if (!existing) throw new DomainError("NOT_FOUND", "No feed link");
  await ctx.db.calendarFeedToken.delete({ where: { userId: ctx.user.id } });
  await ctx.audit({
    action: "cal.feed.revoke",
    entityType: "User",
    entityId: ctx.user.id,
    before: null,
    after: null,
  });
  return {};
}

export async function hasFeedToken(userId: string): Promise<boolean> {
  return (await db.calendarFeedToken.count({ where: { userId } })) > 0;
}

/** The user a token belongs to, or null (unknown / revoked / malformed — no query for the latter). */
export async function userForToken(token: string): Promise<{ id: string; name: string } | null> {
  if (!TOKEN_PATTERN.test(token)) return null;
  const row = await db.calendarFeedToken.findUnique({
    where: { tokenHash: hash(token) },
    select: { user: { select: { id: true, name: true, active: true } } },
  });
  return row?.user.active ? { id: row.user.id, name: row.user.name } : null;
}
