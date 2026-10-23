import { afterAll, beforeAll, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { createAdapter } from "./adapter";
import { db } from "./client";

// Regression: with a non-UTC database default time zone, Prisma's adapter wrote every timestamp
// shifted by the offset. createAdapter pins the session to UTC.
const admin = db;
let client: PrismaClient;

beforeAll(async () => {
  await admin.$executeRawUnsafe(
    `ALTER DATABASE "${new URL(process.env.DATABASE_URL!).pathname.slice(1)}" SET timezone TO 'Europe/Tirane'`,
  );
  client = new PrismaClient({ adapter: createAdapter(process.env.DATABASE_URL!) });
});

afterAll(async () => {
  await client.$disconnect();
  await admin.$executeRawUnsafe(
    `ALTER DATABASE "${new URL(process.env.DATABASE_URL!).pathname.slice(1)}" RESET timezone`,
  );
});

it("stores instants correctly even when the database default zone is not UTC", async () => {
  await client.session.deleteMany();
  await client.user.create({ data: { email: "tz@test.local", name: "Tz" } });
  const user = await client.user.findUniqueOrThrow({ where: { email: "tz@test.local" } });
  const [row] = await client.$queryRaw<{ drift: number }[]>`
    select abs(extract(epoch from (now() - created_at)))::float as drift from users where id = ${user.id}`;
  expect(row!.drift).toBeLessThan(10);
});
