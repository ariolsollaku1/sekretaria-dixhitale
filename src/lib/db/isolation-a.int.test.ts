import { expect, it } from "vitest";
import { db } from "./client";

// Pair with isolation-b: whatever this file leaves behind must not be visible to the next file.
it("writes a row and leaves it behind (AC-7)", async () => {
  await db.systemSetting.create({ data: { key: "leftover", value: 1 } });
  expect(await db.systemSetting.count()).toBe(1);
});
