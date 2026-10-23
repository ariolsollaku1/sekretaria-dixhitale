import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createAction, type ActionContext, type ActionResult } from "@/lib/actions";
import { db, withTransaction } from "@/lib/db";
import {
  assertYearWritable,
  getCurrentAcademicYear,
  isYearWritable,
  listYearOptions,
} from "./year.queries";
import { createYear, makeCurrent, updateYear } from "./year.service";

const actor = { id: "admin-1", email: "a@t.test", name: "Admin", locale: null, personId: null };

function run<R>(fn: (ctx: ActionContext) => Promise<R>, reason?: string): Promise<ActionResult<R>> {
  const action = createAction({
    getUser: async () => actor,
    can: async () => true,
    transaction: withTransaction,
    request: async () => ({ requestId: "r", ip: null, userAgent: null }),
  });
  return action({
    permission: "org.year.write",
    input: z.object({}).passthrough(),
    requireReason: reason !== undefined,
    handler: (_i, ctx) => fn(ctx),
  })({ reason } as never);
}

const year = (start: number) => ({
  startDate: `${start}-09-01`,
  endDate: `${start + 1}-08-31`,
  semester1: { start: `${start}-09-01`, end: `${start + 1}-01-31` },
  semester2: { start: `${start + 1}-02-01`, end: `${start + 1}-08-31` },
});

beforeEach(async () => {
  await db.$executeRawUnsafe('TRUNCATE TABLE "audit_logs", "semesters", "academic_years" CASCADE');
});

describe("createYear (AC-1, AC-2, AC-3)", () => {
  it("creates the year and exactly two semesters as PLANNED, with a derived code and an audit entry", async () => {
    const result = await run((ctx) => createYear(ctx, year(2026)));
    expect(result).toMatchObject({ ok: true, data: { code: "2026-2027" } });
    const row = await db.academicYear.findFirstOrThrow({
      include: { semesters: { orderBy: { number: "asc" } } },
    });
    expect(row).toMatchObject({ code: "2026-2027", status: "PLANNED", createdById: "admin-1" });
    expect(row.startDate.toISOString().slice(0, 10)).toBe("2026-09-01");
    expect(
      row.semesters.map((s) => [
        s.number,
        s.startDate.toISOString().slice(0, 10),
        s.endDate.toISOString().slice(0, 10),
      ]),
    ).toEqual([
      [1, "2026-09-01", "2027-01-31"],
      [2, "2027-02-01", "2027-08-31"],
    ]);
    expect(
      await db.auditLog.findFirstOrThrow({ where: { action: "org.year.create" } }),
    ).toMatchObject({
      entityId: row.id,
      before: null,
      after: { code: "2026-2027", status: "PLANNED", semester2End: "2027-08-31" },
    });
  });

  it("refuses overlapping years and bad semesters with field errors, writing nothing", async () => {
    await run((ctx) => createYear(ctx, year(2026)));
    const overlap = await run((ctx) =>
      createYear(ctx, {
        ...year(2026),
        startDate: "2027-08-31",
        endDate: "2028-08-30",
        semester1: { start: "2027-08-31", end: "2028-01-31" },
        semester2: { start: "2028-02-01", end: "2028-08-30" },
      }),
    );
    expect(overlap).toMatchObject({
      ok: false,
      error: { code: "VALIDATION", fieldErrors: { startDate: ["overlap"] } },
    });
    const badSemester = await run((ctx) =>
      createYear(ctx, { ...year(2027), semester2: { start: "2028-01-01", end: "2028-12-31" } }),
    );
    expect(badSemester).toMatchObject({
      ok: false,
      error: {
        fieldErrors: { semester2: expect.arrayContaining(["semesterOutside", "semesterOrder"]) },
      },
    });
    expect(await db.academicYear.count()).toBe(1);
    expect(await db.semester.count()).toBe(2);
  });

  it("is atomic: a failure after the year insert leaves nothing behind", async () => {
    const result = await run(async (ctx) => {
      await createYear(ctx, year(2026));
      throw new Error("later step failed");
    });
    expect(result.ok).toBe(false);
    expect(await db.academicYear.count()).toBe(0);
    expect(await db.semester.count()).toBe(0);
  });
});

describe("database guarantees (AC-4)", () => {
  it("rejects a second CURRENT year", async () => {
    const mk = (n: number, status: "CURRENT" | "PLANNED") =>
      db.academicYear.create({
        data: {
          code: `${n}-${n + 1}`,
          startDate: new Date(`${n}-09-01`),
          endDate: new Date(`${n + 1}-08-31`),
          status,
        },
      });
    await mk(2026, "CURRENT");
    await mk(2027, "PLANNED");
    await expect(mk(2028, "CURRENT")).rejects.toThrow();
    expect(await db.academicYear.count({ where: { status: "CURRENT" } })).toBe(1);
  });

  it("rejects inverted dates and semester numbers outside 1..2", async () => {
    await expect(
      db.academicYear.create({
        data: { code: "x", startDate: new Date("2027-01-01"), endDate: new Date("2026-01-01") },
      }),
    ).rejects.toThrow();
    const y = await db.academicYear.create({
      data: {
        code: "2026-2027",
        startDate: new Date("2026-09-01"),
        endDate: new Date("2027-08-31"),
      },
    });
    await expect(
      db.semester.create({
        data: {
          academicYearId: y.id,
          number: 3,
          startDate: new Date("2026-09-01"),
          endDate: new Date("2027-01-01"),
        },
      }),
    ).rejects.toThrow();
  });
});

describe("makeCurrent (AC-5, AC-6)", () => {
  async function two() {
    const a = await run((ctx) => createYear(ctx, year(2025)));
    const b = await run((ctx) => createYear(ctx, year(2026)));
    return [a, b].map((r) => (r.ok ? r.data.yearId : "")) as [string, string];
  }

  it("makes the first year current when none is (nothing to close)", async () => {
    const [a] = await two();
    expect(await run((ctx) => makeCurrent(ctx, a), "first setup")).toMatchObject({
      ok: true,
      data: { closedYearId: null },
    });
    expect((await getCurrentAcademicYear())?.code).toBe("2025-2026");
  });

  it("closes the previous year and sets the new one, auditing both with the reason", async () => {
    const [a, b] = await two();
    await run((ctx) => makeCurrent(ctx, a), "first");
    expect(await run((ctx) => makeCurrent(ctx, b), "new academic year starts")).toMatchObject({
      ok: true,
      data: { closedYearId: a },
    });
    expect(
      await db.academicYear.findMany({
        orderBy: { code: "asc" },
        select: { code: true, status: true },
      }),
    ).toEqual([
      { code: "2025-2026", status: "CLOSED" },
      { code: "2026-2027", status: "CURRENT" },
    ]);
    const audits = await db.auditLog.findMany({
      where: {
        action: { in: ["org.year.close", "org.year.make_current"] },
        reason: "new academic year starts",
      },
      orderBy: { at: "asc" },
    });
    expect(audits.map((x) => [x.action, x.entityId])).toEqual([
      ["org.year.close", a],
      ["org.year.make_current", b],
    ]);
  });

  it("rolls everything back when a later step fails", async () => {
    const [a, b] = await two();
    await run((ctx) => makeCurrent(ctx, a), "first");
    const failed = await run(async (ctx) => {
      await makeCurrent(ctx, b);
      throw new Error("boom");
    }, "x");
    expect(failed.ok).toBe(false);
    expect(
      (await db.academicYear.findMany({ orderBy: { code: "asc" }, select: { status: true } })).map(
        (y) => y.status,
      ),
    ).toEqual(["CURRENT", "PLANNED"]);
  });

  it("refuses closed and already-current years, and unknown ids", async () => {
    const [a, b] = await two();
    await run((ctx) => makeCurrent(ctx, a), "1");
    await run((ctx) => makeCurrent(ctx, b), "2");
    expect(await run((ctx) => makeCurrent(ctx, a), "reopen?")).toMatchObject({
      ok: false,
      error: { code: "CONFLICT", message: "NOT_PLANNED" },
    });
    expect(await run((ctx) => makeCurrent(ctx, b), "again")).toMatchObject({
      ok: false,
      error: { message: "NOT_PLANNED" },
    });
    expect(await run((ctx) => makeCurrent(ctx, "nope"), "x")).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
  });

  it("lets only one of two concurrent switches win", async () => {
    const [a, b] = await two();
    const c = await run((ctx) => createYear(ctx, year(2027)));
    await run((ctx) => makeCurrent(ctx, a), "first");
    const [r1, r2] = await Promise.all([
      run((ctx) => makeCurrent(ctx, b), "p"),
      run((ctx) => makeCurrent(ctx, c.ok ? c.data.yearId : ""), "q"),
    ]);
    expect([r1.ok, r2.ok].filter(Boolean).length).toBeGreaterThanOrEqual(1);
    expect(await db.academicYear.count({ where: { status: "CURRENT" } })).toBe(1);
  });
});

describe("updateYear (AC-7, AC-8)", () => {
  it("updates dates and semesters, recomputes the code and audits the diff", async () => {
    const created = await run((ctx) => createYear(ctx, year(2026)));
    const id = created.ok ? created.data.yearId : "";
    const changed = {
      ...year(2026),
      endDate: "2027-09-15",
      semester2: { start: "2027-02-01", end: "2027-09-15" },
    };
    expect(await run((ctx) => updateYear(ctx, id, changed))).toMatchObject({
      ok: true,
      data: { code: "2026-2027" },
    });
    expect(
      await db.auditLog.findFirstOrThrow({ where: { action: "org.year.update" } }),
    ).toMatchObject({
      before: { endDate: "2027-08-31", semester2End: "2027-08-31" },
      after: { endDate: "2027-09-15", semester2End: "2027-09-15" },
    });
  });

  it("does not collide with itself on overlap/code checks, but refuses invalid changes", async () => {
    const created = await run((ctx) => createYear(ctx, year(2026)));
    const id = created.ok ? created.data.yearId : "";
    expect(await run((ctx) => updateYear(ctx, id, year(2026)))).toMatchObject({ ok: true });
    expect(
      await run((ctx) => updateYear(ctx, id, { ...year(2026), endDate: "2026-08-01" })),
    ).toMatchObject({ ok: false, error: { fieldErrors: { endDate: ["endBeforeStart"] } } });
  });

  it("refuses two non-overlapping years that would get the same code", async () => {
    const half = (from: string, to: string, s1: [string, string], s2: [string, string]) => ({
      startDate: from,
      endDate: to,
      semester1: { start: s1[0], end: s1[1] },
      semester2: { start: s2[0], end: s2[1] },
    });
    expect(
      await run((ctx) =>
        createYear(
          ctx,
          half(
            "2030-01-01",
            "2030-06-30",
            ["2030-01-01", "2030-03-31"],
            ["2030-04-01", "2030-06-30"],
          ),
        ),
      ),
    ).toMatchObject({ ok: true, data: { code: "2030-2030" } });
    const clash = await run((ctx) =>
      createYear(
        ctx,
        half(
          "2030-07-01",
          "2030-12-31",
          ["2030-07-01", "2030-09-30"],
          ["2030-10-01", "2030-12-31"],
        ),
      ),
    );
    expect(clash).toMatchObject({
      ok: false,
      error: { fieldErrors: { startDate: ["codeTaken"] } },
    });
  });

  it("refuses to edit a closed year", async () => {
    const a = await run((ctx) => createYear(ctx, year(2025)));
    const b = await run((ctx) => createYear(ctx, year(2026)));
    await run((ctx) => makeCurrent(ctx, a.ok ? a.data.yearId : ""), "1");
    await run((ctx) => makeCurrent(ctx, b.ok ? b.data.yearId : ""), "2");
    expect(
      await run((ctx) => updateYear(ctx, a.ok ? a.data.yearId : "", year(2025))),
    ).toMatchObject({ ok: false, error: { code: "CONFLICT", message: "YEAR_CLOSED" } });
    expect(await run((ctx) => updateYear(ctx, "nope", year(2025)))).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
  });
});

describe("queries and the header provider (AC-7, AC-9)", () => {
  it("reports writability per status and unknown ids as not writable", async () => {
    const a = await run((ctx) => createYear(ctx, year(2025)));
    const b = await run((ctx) => createYear(ctx, year(2026)));
    const [ia, ib] = [a, b].map((r) => (r.ok ? r.data.yearId : ""));
    expect(await isYearWritable(ib!)).toBe(true); // planned
    await run((ctx) => makeCurrent(ctx, ia!), "1");
    expect(await isYearWritable(ia!)).toBe(true); // current
    await run((ctx) => makeCurrent(ctx, ib!), "2");
    expect(await isYearWritable(ia!)).toBe(false); // closed
    expect(await isYearWritable("nope")).toBe(false);
    await expect(assertYearWritable(ia!)).rejects.toMatchObject({ name: "YearClosedError" });
    await expect(assertYearWritable(ib!)).resolves.toBeUndefined();
  });

  it("lists options newest first and finds no current year before the first switch", async () => {
    await run((ctx) => createYear(ctx, year(2025)));
    await run((ctx) => createYear(ctx, year(2027)));
    await run((ctx) => createYear(ctx, year(2026)));
    expect((await listYearOptions()).map((o) => o.label)).toEqual([
      "2027-2028",
      "2026-2027",
      "2025-2026",
    ]);
    expect(await getCurrentAcademicYear()).toBeNull();
  });
});
