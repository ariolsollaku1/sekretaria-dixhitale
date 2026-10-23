import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createAction, type ActionContext, type ActionResult } from "@/lib/actions";
import { db, withTransaction } from "@/lib/db";
import "@/modules/org";
import { clearAudienceResolvers, registerAudienceResolver } from "@/lib/audience";
import { feedEvents, listEvents } from "./event.queries";
import * as events from "./event.service";

const actor = { id: "admin-1", email: "a@t.test", name: "Admin", locale: null, personId: null };
function run<R>(fn: (ctx: ActionContext) => Promise<R>): Promise<ActionResult<R>> {
  const action = createAction({
    getUser: async () => actor,
    can: async () => true,
    transaction: withTransaction,
    request: async () => ({ requestId: "r", ip: null, userAgent: null }),
  });
  return action({
    permission: "cal.event.write",
    input: z.object({}).passthrough(),
    handler: (_i, ctx) => fn(ctx),
  })({} as never);
}

const d = (s: string) => new Date(`${s}T00:00:00Z`);
let y1: string; // 2025-2026, closed
let y2: string; // 2026-2027, current
let y3: string; // 2027-2028, planned

const input = (over: Partial<Parameters<typeof events.createEvent>[2]> = {}) => ({
  title: "Fillimi i semestrit",
  type: "TEACHING_WEEK" as const,
  startDate: "2026-09-28",
  endDate: "2026-10-02",
  description: null,
  audience: "ALL" as const,
  cycle: null,
  programId: null,
  ...over,
});

beforeEach(async () => {
  clearAudienceResolvers();
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "audit_logs", "calendar_events", "calendar_feed_tokens", "user_roles", "study_programs", "departments", "faculties", "semesters", "academic_years" CASCADE',
  );
  await db.user.deleteMany();
  const mk = (code: string, s: string, e: string, status: "CLOSED" | "CURRENT" | "PLANNED") =>
    db.academicYear
      .create({ data: { code, startDate: d(s), endDate: d(e), status } })
      .then((y) => y.id);
  y1 = await mk("2025-2026", "2025-09-01", "2026-08-31", "CLOSED");
  y2 = await mk("2026-2027", "2026-09-01", "2027-08-31", "CURRENT");
  y3 = await mk("2027-2028", "2027-09-01", "2028-08-31", "PLANNED");
});

describe("createEvent (AC-1..AC-4, AC-14)", () => {
  it("creates an active event with an audit row", async () => {
    const r = await run((ctx) => events.createEvent(ctx, y2, input()));
    expect(r.ok).toBe(true);
    const row = await db.calendarEvent.findFirstOrThrow();
    expect(row).toMatchObject({
      title: "Fillimi i semestrit",
      active: true,
      createdById: "admin-1",
    });
    expect(await db.auditLog.count({ where: { action: "cal.event.create" } })).toBe(1);
  });

  it("refuses dates outside the year with a field error and writes nothing", async () => {
    const r = await run((ctx) => events.createEvent(ctx, y2, input({ startDate: "2026-08-30" })));
    expect(r).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    expect(await db.calendarEvent.count()).toBe(0);
  });

  it("refuses an unknown program", async () => {
    const r = await run((ctx) =>
      events.createEvent(ctx, y2, input({ audience: "PROGRAM", programId: "nope" })),
    );
    expect(r).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
  });

  it("database rejects an audience that disagrees with its cycle (AC-2)", async () => {
    await expect(
      db.calendarEvent.create({
        data: {
          academicYearId: y2,
          title: "x",
          type: "EVENT",
          startDate: d("2026-10-01"),
          endDate: d("2026-10-01"),
          audience: "CYCLE",
        },
      }),
    ).rejects.toThrow();
  });

  it("refuses every write in a closed year (AC-4)", async () => {
    const created = await db.calendarEvent.create({
      data: {
        academicYearId: y1,
        title: "Old",
        type: "EVENT",
        startDate: d("2025-10-01"),
        endDate: d("2025-10-01"),
      },
    });
    const create = await run((ctx) =>
      events.createEvent(ctx, y1, input({ startDate: "2025-10-01", endDate: "2025-10-01" })),
    );
    const update = await run((ctx) =>
      events.updateEvent(
        ctx,
        created.id,
        input({ startDate: "2025-10-01", endDate: "2025-10-01" }),
      ),
    );
    const cancel = await run((ctx) => events.setEventActive(ctx, created.id, false));
    for (const r of [create, update, cancel])
      expect(r).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
  });
});

describe("update, cancel and restore (AC-5)", () => {
  it("keeps the row, audits the diff and hides it from readers", async () => {
    const id = (await run((ctx) => events.createEvent(ctx, y2, input()))) as {
      ok: true;
      data: { eventId: string };
    };
    const eventId = id.data.eventId;
    await run((ctx) => events.updateEvent(ctx, eventId, input({ title: "Ndryshuar" })));
    expect(
      await db.auditLog.findFirstOrThrow({ where: { action: "cal.event.update" } }),
    ).toMatchObject({ entityId: eventId });

    await run((ctx) => events.setEventActive(ctx, eventId, false));
    expect(await db.calendarEvent.count()).toBe(1);
    await db.user.create({ data: { id: "staff", email: "s@t.test", name: "S" } });
    await db.userRole.create({
      data: { userId: "staff", role: "lecturer", scopeType: "INSTITUTION" },
    });
    expect(
      await listEvents({ yearId: y2, viewerId: "staff", includeCancelled: false }),
    ).toHaveLength(0);
    expect(
      await listEvents({ yearId: y2, viewerId: "staff", includeCancelled: true }),
    ).toHaveLength(1);

    await run((ctx) => events.setEventActive(ctx, eventId, true));
    expect(
      await listEvents({ yearId: y2, viewerId: "staff", includeCancelled: false }),
    ).toHaveLength(1);
    expect(await db.auditLog.count({ where: { action: "cal.event.restore" } })).toBe(1);
  });
});

describe("audience (AC-9)", () => {
  it("shows a student-only user ALL events plus what resolvers add; staff see everything", async () => {
    const faculty = await db.faculty.create({ data: { code: "F", name: "F" } });
    const dep = await db.department.create({
      data: { code: "D", name: "D", facultyId: faculty.id },
    });
    const prog = await db.studyProgram.create({
      data: {
        departmentId: dep.id,
        cycle: "FIRST",
        code: "P1",
        name: "P1",
        durationYears: 3,
        totalCredits: 180,
      },
    });
    await run((ctx) => events.createEvent(ctx, y2, input({ title: "All" })));
    await run((ctx) =>
      events.createEvent(ctx, y2, input({ title: "Cycle2", audience: "CYCLE", cycle: "SECOND" })),
    );
    await run((ctx) =>
      events.createEvent(
        ctx,
        y2,
        input({ title: "Prog", audience: "PROGRAM", programId: prog.id }),
      ),
    );
    await db.user.createMany({
      data: [
        { id: "stu", email: "stu@t.test", name: "Stu" },
        { id: "lec", email: "lec@t.test", name: "Lec" },
      ],
    });
    await db.userRole.createMany({
      data: [
        { userId: "stu", role: "student", scopeType: "SELF" },
        { userId: "lec", role: "lecturer", scopeType: "INSTITUTION" },
      ],
    });
    const titles = async (viewerId: string) =>
      (await listEvents({ yearId: y2, viewerId, includeCancelled: false }))
        .map((e) => e.title)
        .sort();

    expect(await titles("stu")).toEqual(["All"]);
    expect(await titles("lec")).toEqual(["All", "Cycle2", "Prog"]);

    registerAudienceResolver(async () => ({ cycles: ["SECOND"], programIds: [prog.id] }));
    expect(await titles("stu")).toEqual(["All", "Cycle2", "Prog"]);
  });
});

describe("copyCalendar (AC-10, AC-11)", () => {
  it("shifts by whole weeks, skips what falls outside, keeps audiences and audits once", async () => {
    await db.calendarEvent.createMany({
      data: [
        {
          academicYearId: y2,
          title: "A",
          type: "HOLIDAY",
          startDate: d("2026-12-24"),
          endDate: d("2026-12-25"),
        },
        {
          academicYearId: y2,
          title: "B",
          type: "EXAM_PERIOD",
          startDate: d("2027-08-30"),
          endDate: d("2027-08-31"),
        },
        {
          academicYearId: y2,
          title: "Gone",
          type: "EVENT",
          startDate: d("2026-10-01"),
          endDate: d("2026-10-01"),
          active: false,
        },
      ],
    });
    // the target year is shorter, so B (+364 days = 2028-08-28) falls outside it
    await db.academicYear.update({ where: { id: y3 }, data: { endDate: d("2028-08-20") } });
    // 2026-09-01 -> 2027-09-01 is 365 days = 52 weeks (364 days)
    const r = await run((ctx) => events.copyCalendar(ctx, y2, y3));
    expect(r).toMatchObject({ ok: true, data: { copied: 1, skipped: 1 } });
    const rows = await db.calendarEvent.findMany({ where: { academicYearId: y3 } });
    expect(rows.map((e) => [e.title, e.startDate.toISOString().slice(0, 10)])).toEqual([
      ["A", "2027-12-23"],
    ]);
    expect(await db.auditLog.count({ where: { action: "cal.calendar.copy" } })).toBe(1);
  });

  it("refuses a non-empty target, a closed target and the same year", async () => {
    await run((ctx) =>
      events.createEvent(ctx, y3, input({ startDate: "2027-10-01", endDate: "2027-10-01" })),
    );
    expect(await run((ctx) => events.copyCalendar(ctx, y2, y3))).toMatchObject({
      ok: false,
      error: { code: "CONFLICT", message: "NOT_EMPTY" },
    });
    expect(await run((ctx) => events.copyCalendar(ctx, y2, y1))).toMatchObject({
      ok: false,
      error: { code: "CONFLICT" },
    });
    expect(await run((ctx) => events.copyCalendar(ctx, y2, y2))).toMatchObject({ ok: false });
  });
});

describe("feedEvents (AC-12)", () => {
  it("lists active events of the current and planned years only", async () => {
    const mk = (academicYearId: string, title: string, start: string, active = true) =>
      db.calendarEvent.create({
        data: {
          academicYearId,
          title,
          type: "EVENT",
          startDate: d(start),
          endDate: d(start),
          active,
        },
      });
    await mk(y1, "closed", "2025-10-01");
    await mk(y2, "current", "2026-10-01");
    await mk(y3, "planned", "2027-10-01");
    await mk(y2, "cancelled", "2026-10-02", false);
    await db.user.create({ data: { id: "lec", email: "lec@t.test", name: "Lec" } });
    await db.userRole.create({
      data: { userId: "lec", role: "lecturer", scopeType: "INSTITUTION" },
    });
    expect((await feedEvents("lec")).map((e) => e.title)).toEqual(["current", "planned"]);
  });
});
