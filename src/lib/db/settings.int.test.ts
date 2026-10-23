import { describe, expect, it } from "vitest";
import { z } from "zod";
import { db } from "./client";
import { getSetting, setSetting } from "./settings";
import { withTransaction } from "./transaction";

const schema = z.object({ n: z.number() });

describe("withTransaction", () => {
  it("rolls back writes when the callback throws (AC-5)", async () => {
    await expect(
      withTransaction(async (tx) => {
        await setSetting("tx.rollback", schema, { n: 1 }, { tx });
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(await getSetting("tx.rollback", schema)).toBeUndefined();
  });

  it("commits writes when the callback resolves", async () => {
    await withTransaction((tx) => setSetting("tx.commit", schema, { n: 2 }, { tx }));
    expect(await getSetting("tx.commit", schema)).toEqual({ n: 2 });
  });
});

describe("settings", () => {
  it("validates on write and on read", async () => {
    await expect(
      withTransaction((tx) => setSetting("bad", schema, { n: "x" } as never, { tx })),
    ).rejects.toThrow();
    await db.systemSetting.create({ data: { key: "corrupt", value: { n: "x" } } });
    await expect(getSetting("corrupt", schema)).rejects.toThrow();
  });

  it("records who changed a setting and upserts", async () => {
    await withTransaction((tx) => setSetting("who", schema, { n: 1 }, { tx, userId: "u1" }));
    await withTransaction((tx) => setSetting("who", schema, { n: 2 }, { tx, userId: "u2" }));
    const row = await db.systemSetting.findUniqueOrThrow({ where: { key: "who" } });
    expect(row).toMatchObject({ value: { n: 2 }, updatedById: "u2" });
  });
});
