import { beforeEach, expect, it } from "vitest";
import { db } from "@/lib/db";
import { recordAuthEvent } from "./events";

beforeEach(async () => {
  await db.$executeRawUnsafe('TRUNCATE TABLE "audit_logs"');
});

it("records login, denied login and logout as audit entries (AC-5)", async () => {
  await recordAuthEvent({ type: "login.success", userId: "u1" });
  await recordAuthEvent({ type: "login.denied", reason: "no-user" });
  await recordAuthEvent({ type: "logout", userId: "u1" });
  const rows = await db.auditLog.findMany({ orderBy: { at: "asc" } });
  expect(rows.map((r) => [r.action, r.actorType, r.actorUserId, r.entityType])).toEqual([
    ["auth.session.login", "USER", "u1", "Session"],
    ["auth.session.denied", "PUBLIC", null, "Session"],
    ["auth.session.logout", "USER", "u1", "Session"],
  ]);
  expect(rows[1]!.after).toEqual({ reason: "no-user" });
  // Personal data never enters the trail: only ids and reason codes.
  expect(JSON.stringify(rows)).not.toMatch(/@|\bname\b/);
});
