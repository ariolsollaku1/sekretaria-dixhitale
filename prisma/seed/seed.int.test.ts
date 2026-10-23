import { expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { runSeeds } from "./index";

it("is idempotent: seeding twice yields identical data (AC-6)", async () => {
  await runSeeds(db, "dev");
  const first = await db.systemSetting.findMany({ orderBy: { key: "asc" } });
  await runSeeds(db, "dev");
  const second = await db.systemSetting.findMany({ orderBy: { key: "asc" } });
  expect(first.length).toBeGreaterThan(0);
  expect(second.map((r) => [r.key, r.value])).toEqual(first.map((r) => [r.key, r.value]));
});

it("keeps values an administrator changed", async () => {
  await db.systemSetting.update({ where: { key: "app.timezone" }, data: { value: "UTC" } });
  await runSeeds(db, "dev");
  expect((await db.systemSetting.findUniqueOrThrow({ where: { key: "app.timezone" } })).value).toBe(
    "UTC",
  );
});
