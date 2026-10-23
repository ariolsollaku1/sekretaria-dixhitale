import { expect, it } from "vitest";
import { db } from "./client";

it("starts with empty tables, whatever earlier files wrote (AC-7)", async () => {
  expect(await db.systemSetting.count()).toBe(0);
});
