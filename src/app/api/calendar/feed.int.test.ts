import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createAction, type ActionContext } from "@/lib/actions";
import { db, withTransaction } from "@/lib/db";
import { createFeedToken, revokeFeedToken } from "@/modules/cal";
import { GET } from "./[token]/route";

let userId: string;
const request = new Request("http://x");
const get = (token: string) => GET(request, { params: Promise.resolve({ token }) });

function run<R>(fn: (ctx: ActionContext) => Promise<R>) {
  return createAction({
    getUser: async () => ({
      id: userId,
      email: "u@t.test",
      name: "U",
      locale: null,
      personId: null,
    }),
    can: async () => true,
    transaction: withTransaction,
    request: async () => ({ requestId: "r", ip: null, userAgent: null }),
  })({
    permission: "cal.event.read",
    input: z.object({}),
    handler: (_i, ctx) => fn(ctx),
  })({});
}

beforeEach(async () => {
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "audit_logs", "calendar_events", "calendar_feed_tokens", "user_roles", "academic_years" CASCADE',
  );
  await db.user.deleteMany();
  userId = (await db.user.create({ data: { email: "u@t.test", name: "U" } })).id;
  await db.userRole.create({ data: { userId, role: "lecturer", scopeType: "INSTITUTION" } });
  const year = await db.academicYear.create({
    data: {
      code: "2026-2027",
      startDate: new Date("2026-09-01T00:00:00Z"),
      endDate: new Date("2027-08-31T00:00:00Z"),
      status: "CURRENT",
    },
  });
  await db.calendarEvent.create({
    data: {
      academicYearId: year.id,
      title: "Dita e Pavarësisë",
      type: "HOLIDAY",
      startDate: new Date("2026-11-28T00:00:00Z"),
      endDate: new Date("2026-11-28T00:00:00Z"),
    },
  });
});

describe("iCal feed (AC-12, AC-13)", () => {
  it("serves the user's events for a valid token, stores only a hash, and 404s after revoke", async () => {
    const created = await run((ctx) => createFeedToken(ctx));
    if (!created.ok) throw new Error("create failed");
    const { token } = created.data;
    const stored = await db.calendarFeedToken.findUniqueOrThrow({ where: { userId } });
    expect(stored.tokenHash).not.toContain(token);

    const res = await get(`${token}.ics`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/calendar");
    const body = await res.text();
    expect(body).toContain("SUMMARY:Dita e Pavarësisë");
    expect(body).toContain("DTSTART;VALUE=DATE:20261128");

    // regenerating invalidates the old link
    const second = await run((ctx) => createFeedToken(ctx));
    expect((await get(token)).status).toBe(404);
    if (second.ok) expect((await get(second.data.token)).status).toBe(200);

    await run((ctx) => revokeFeedToken(ctx));
    if (second.ok) expect((await get(second.data.token)).status).toBe(404);
    expect(await db.auditLog.count({ where: { action: { startsWith: "cal.feed" } } })).toBe(3);
  });

  it("answers 404 for malformed and unknown tokens", async () => {
    expect((await get("short")).status).toBe(404);
    expect((await get("A".repeat(43))).status).toBe(404);
  });
});
