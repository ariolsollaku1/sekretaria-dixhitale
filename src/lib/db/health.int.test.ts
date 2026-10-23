import { PrismaPg } from "@prisma/adapter-pg";
import { expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { db } from "./client";
import { isDatabaseReachable } from "./health";

it("reports true for a reachable database", async () => {
  expect(await isDatabaseReachable(db)).toBe(true);
});

it("reports false when the client cannot connect (AC-8)", async () => {
  const wrongPort = process.env.DATABASE_URL!.replace(/:\d+\//, ":1/");
  const broken = new PrismaClient({ adapter: new PrismaPg({ connectionString: wrongPort }) });
  try {
    expect(await isDatabaseReachable(broken)).toBe(false);
  } finally {
    await broken.$disconnect();
  }
});
