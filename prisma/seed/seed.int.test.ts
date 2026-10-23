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

it("gives each dev user their role and keeps it idempotent", async () => {
  await runSeeds(db, "dev");
  const count = await db.userRole.count();
  await runSeeds(db, "dev");
  expect(await db.userRole.count()).toBe(count);
  const sec = await db.user.findUniqueOrThrow({
    where: { email: "secretary@dev.logos.test" },
    include: { roles: true },
  });
  expect(sec.roles).toMatchObject([{ role: "secretary", scopeType: "INSTITUTION", scopeId: null }]);
});

it("seeds three demo academic years with exactly one current, idempotently (ORG-01 AC-13)", async () => {
  await runSeeds(db, "dev");
  await runSeeds(db, "dev");
  const years = await db.academicYear.findMany({
    orderBy: { code: "asc" },
    include: { semesters: true },
  });
  expect(years.map((y) => [y.code, y.status, y.semesters.length])).toEqual([
    ["2025-2026", "CLOSED", 2],
    ["2026-2027", "CURRENT", 2],
    ["2027-2028", "PLANNED", 2],
  ]);
});

it("seeds neutral demo faculties and departments and scopes the dev head of department to one (ORG-02 AC-12)", async () => {
  await runSeeds(db, "dev");
  await runSeeds(db, "dev");
  expect(
    (await db.faculty.findMany({ orderBy: { code: "asc" }, select: { code: true } })).map(
      (f) => f.code,
    ),
  ).toEqual(["DEMO-A", "DEMO-B"]);
  expect(await db.department.count()).toBe(3);
  const head = await db.user.findUniqueOrThrow({
    where: { email: "head-of-department@dev.logos.test" },
    include: { roles: true },
  });
  const a1 = await db.department.findUniqueOrThrow({ where: { code: "DEMO-A1" } });
  expect(head.roles).toMatchObject([
    { role: "head_of_department", scopeType: "DEPARTMENT", scopeId: a1.id },
  ]);
});
