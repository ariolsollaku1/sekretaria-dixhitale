import "server-only";
import type { z } from "zod";
import { db } from "./client";
import type { Tx } from "./transaction";

type Json = Parameters<typeof db.systemSetting.create>[0]["data"]["value"];

/** Reads a setting and validates it. Returns undefined when the key is not set. */
export async function getSetting<S extends z.ZodType>(
  key: string,
  schema: S,
  client: Pick<Tx, "systemSetting"> = db,
): Promise<z.output<S> | undefined> {
  const row = await client.systemSetting.findUnique({ where: { key } });
  return row ? schema.parse(row.value) : undefined;
}

/** Validates, then upserts. `ctx.userId` is recorded in updatedById; omit for system writes. */
export async function setSetting<S extends z.ZodType>(
  key: string,
  schema: S,
  value: z.input<S>,
  ctx: { tx: Pick<Tx, "systemSetting">; userId?: string },
): Promise<void> {
  const parsed = schema.parse(value) as Json;
  await ctx.tx.systemSetting.upsert({
    where: { key },
    create: { key, value: parsed, updatedById: ctx.userId },
    update: { value: parsed, updatedById: ctx.userId },
  });
}
