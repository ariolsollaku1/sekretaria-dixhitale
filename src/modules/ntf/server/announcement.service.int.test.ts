import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { clearAudienceResolvers, registerAudienceResolver } from "@/lib/audience";
import { createAction, type ActionContext, type ActionResult } from "@/lib/actions";
import { db, withTransaction } from "@/lib/db";
import "@/modules/org";
import "@/modules/ntf";
import { announcementSchema, type AnnouncementFormInput } from "../domain/schemas";
import { audienceWhere, feed, visibleAnnouncement, viewerOf } from "./announcement.queries";
import * as svc from "./announcement.service";
import { matchesViewer } from "../domain/visibility";

let actorId = "admin";
const actor = () => ({
  id: actorId,
  email: `${actorId}@t.test`,
  name: actorId,
  locale: null,
  personId: null,
});
function run<R>(fn: (ctx: ActionContext) => Promise<R>): Promise<ActionResult<R>> {
  const action = createAction({
    getUser: async () => actor(),
    can: async () => true,
    transaction: withTransaction,
    request: async () => ({ requestId: "r", ip: null, userAgent: null }),
  });
  return action({
    permission: "ntf.announcement.write",
    input: z.object({}).passthrough(),
    handler: (_i, ctx) => fn(ctx),
  })({} as never);
}

const input = (over: Partial<AnnouncementFormInput> = {}) =>
  announcementSchema.parse({
    title: "Leksion i hapur",
    body: "Të enjten, salla 3.",
    audience: "ALL",
    ...over,
  });
const create = async (over: Partial<AnnouncementFormInput> = {}) => {
  const r = await run((ctx) => svc.createAnnouncement(ctx, input(over)));
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.data.announcementId;
};
const publish = (id: string) => run((ctx) => svc.publishAnnouncement(ctx, id));

let program1: string;
let program2: string;

async function user(
  id: string,
  roles: {
    role: "sysadmin" | "secretary" | "lecturer" | "student" | "program_coordinator";
    scopeType?: "INSTITUTION" | "SELF" | "PROGRAM";
    scopeId?: string;
  }[],
) {
  await db.user.create({ data: { id, email: `${id}@t.test`, name: id } });
  for (const r of roles)
    await db.userRole.create({
      data: {
        userId: id,
        role: r.role,
        scopeType: r.scopeType ?? "INSTITUTION",
        scopeId: r.scopeId ?? null,
      },
    });
}

beforeEach(async () => {
  clearAudienceResolvers();
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "audit_logs", "announcements", "user_roles", "study_programs", "departments", "faculties" CASCADE',
  );
  await db.user.deleteMany();
  const faculty = await db.faculty.create({ data: { code: "F", name: "F" } });
  const dep = await db.department.create({ data: { code: "D", name: "D", facultyId: faculty.id } });
  const mk = (code: string) =>
    db.studyProgram
      .create({
        data: {
          departmentId: dep.id,
          cycle: "FIRST",
          code,
          name: code,
          durationYears: 3,
          totalCredits: 180,
        },
      })
      .then((p) => p.id);
  program1 = await mk("P1");
  program2 = await mk("P2");
  await user("admin", [{ role: "sysadmin" }]);
  await user("coord", [{ role: "program_coordinator", scopeType: "PROGRAM", scopeId: program1 }]);
  await user("lec", [{ role: "lecturer" }]);
  await user("stu", [{ role: "student", scopeType: "SELF" }]);
  actorId = "admin";
});

describe("lifecycle (AC-1, AC-3, AC-4, AC-11)", () => {
  it("creates a draft, publishes it now, archives it, and audits each step", async () => {
    const id = await create();
    expect(await db.announcement.findUniqueOrThrow({ where: { id } })).toMatchObject({
      status: "DRAFT",
      publishAt: null,
    });
    expect((await feed("lec", 1)).total).toBe(0);

    expect((await publish(id)).ok).toBe(true);
    const published = await db.announcement.findUniqueOrThrow({ where: { id } });
    expect(published.status).toBe("PUBLISHED");
    expect(published.publishAt).not.toBeNull();
    expect((await feed("lec", 1)).total).toBe(1);
    expect(await publish(id)).toMatchObject({ ok: false, error: { code: "CONFLICT" } });

    expect((await run((ctx) => svc.archiveAnnouncement(ctx, id))).ok).toBe(true);
    expect((await feed("lec", 1)).total).toBe(0);
    expect(await db.announcement.count()).toBe(1);

    // republish keeps the earlier publish time
    expect((await publish(id)).ok).toBe(true);
    expect((await db.announcement.findUniqueOrThrow({ where: { id } })).publishAt).toEqual(
      published.publishAt,
    );
    const actions = (await db.auditLog.findMany({ orderBy: { at: "asc" } })).map((a) => a.action);
    expect(actions).toEqual([
      "ntf.announcement.create",
      "ntf.announcement.publish",
      "ntf.announcement.archive",
      "ntf.announcement.publish",
    ]);
  });

  it("honours the publish and expiry days (Europe/Tirane)", async () => {
    const future = await create({ title: "Future", publishDate: "2099-01-10" });
    const past = await create({
      title: "Past",
      publishDate: "2020-01-10",
      expiresDate: "2020-01-12",
    });
    const open = await create({
      title: "Open",
      publishDate: "2020-01-10",
      expiresDate: "2099-01-12",
    });
    for (const id of [future, past, open]) await publish(id);
    const row = await db.announcement.findUniqueOrThrow({ where: { id: open } });
    expect(row.publishAt?.toISOString()).toBe("2020-01-09T23:00:00.000Z");
    expect(row.expiresAt?.toISOString()).toBe("2099-01-12T23:00:00.000Z");
    expect((await feed("lec", 1)).rows.map((r) => r.title)).toEqual(["Open"]);
  });

  it("refuses publishing when the expiry is already behind", async () => {
    const id = await create({ expiresDate: "2020-01-12" });
    expect(await publish(id)).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
  });

  it("rejects an expiry before the publish day with a field error and writes nothing", async () => {
    const r = await run((ctx) =>
      svc.createAnnouncement(ctx, {
        ...input(),
        publishDate: "2026-10-10",
        expiresDate: "2026-10-09",
      }),
    );
    expect(r).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    expect(await db.announcement.count()).toBe(0);
  });
});

describe("feed order and paging (AC-5)", () => {
  it("lists pinned first, then newest first, 10 per page", async () => {
    for (let i = 1; i <= 12; i++) {
      const id = await create({
        title: `N${i}`,
        publishDate: `2020-01-${String(i).padStart(2, "0")}`,
        pinned: i === 3,
      });
      await publish(id);
    }
    const p1 = await feed("lec", 1);
    expect(p1.total).toBe(12);
    expect(p1.pageCount).toBe(2);
    expect(p1.rows.map((r) => r.title).slice(0, 3)).toEqual(["N3", "N12", "N11"]);
    expect((await feed("lec", 2)).rows).toHaveLength(2);
  });
});

describe("audience (AC-5, AC-6)", () => {
  it("applies STAFF / STUDENTS / CYCLE / PROGRAM to staff and students, via resolvers", async () => {
    const ids = {
      all: await create({ title: "All" }),
      staff: await create({ title: "Staff", audience: "STAFF" }),
      students: await create({ title: "Students", audience: "STUDENTS" }),
      cycle: await create({ title: "Cycle", audience: "CYCLE", cycle: "SECOND" }),
      program: await create({ title: "Program", audience: "PROGRAM", programId: program2 }),
    };
    for (const id of Object.values(ids)) await publish(id);
    const titles = async (u: string) => (await feed(u, 1)).rows.map((r) => r.title).sort();

    expect(await titles("lec")).toEqual(["All", "Cycle", "Program", "Staff", "Students"]);
    expect(await titles("stu")).toEqual(["All", "Students"]);

    registerAudienceResolver(async () => ({ cycles: ["SECOND"], programIds: [program2] }));
    expect(await titles("stu")).toEqual(["All", "Cycle", "Program", "Students"]);

    // invisible = not found, even by id (AC-6)
    expect(await visibleAnnouncement("stu", ids.staff)).toBeNull();
    expect(await visibleAnnouncement("lec", ids.staff)).not.toBeNull();
    expect(await visibleAnnouncement("stu", "missing")).toBeNull();
  });

  it("keeps the SQL filter equal to the pure rule", async () => {
    const cases = [
      { staff: true, student: false, cycles: [], programIds: [] },
      { staff: false, student: true, cycles: ["FIRST"] as const, programIds: [program1] },
      { staff: false, student: true, cycles: [], programIds: [] },
      { staff: false, student: false, cycles: [], programIds: [] },
    ];
    const defs = [
      { audience: "ALL" as const },
      { audience: "STAFF" as const },
      { audience: "STUDENTS" as const },
      { audience: "CYCLE" as const, cycle: "FIRST" as const },
      { audience: "CYCLE" as const, cycle: "SECOND" as const },
      { audience: "PROGRAM" as const, programId: program1 },
      { audience: "PROGRAM" as const, programId: program2 },
    ];
    for (const d of defs) {
      await db.announcement.create({
        data: { title: "t", body: "b", status: "PUBLISHED", publishAt: new Date(0), ...d },
      });
    }
    const all = await db.announcement.findMany();
    for (const v of cases) {
      const viaSql = (await db.announcement.findMany({ where: audienceWhere(v) }))
        .map((a) => a.id)
        .sort();
      const viaRule = all
        .filter((a) =>
          matchesViewer({ audience: a.audience, cycle: a.cycle, programId: a.programId }, v),
        )
        .map((a) => a.id)
        .sort();
      expect(viaSql).toEqual(viaRule);
    }
    expect((await viewerOf("lec")).staff).toBe(true);
    expect((await viewerOf("stu")).student).toBe(true);
  });
});

describe("who may publish to what (AC-10)", () => {
  it("a program coordinator reaches only their own program", async () => {
    actorId = "coord";
    const ok = await run((ctx) =>
      svc.createAnnouncement(ctx, input({ audience: "PROGRAM", programId: program1 })),
    );
    const otherProgram = await run((ctx) =>
      svc.createAnnouncement(ctx, input({ audience: "PROGRAM", programId: program2 })),
    );
    const everyone = await run((ctx) => svc.createAnnouncement(ctx, input()));
    expect(ok.ok).toBe(true);
    expect(otherProgram).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(everyone).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
  });

  it("cannot change or publish an announcement outside their reach", async () => {
    const id = await create();
    actorId = "coord";
    expect(await publish(id)).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(
      await run((ctx) =>
        svc.updateAnnouncement(ctx, id, input({ audience: "PROGRAM", programId: program1 })),
      ),
    ).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
  });

  it("rejects an unknown program", async () => {
    const r = await run((ctx) =>
      svc.createAnnouncement(ctx, input({ audience: "PROGRAM", programId: "nope" })),
    );
    expect(r).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
  });

  it("the database refuses an e-mail push to a program audience", async () => {
    await expect(
      db.announcement.create({
        data: { title: "t", body: "b", audience: "PROGRAM", programId: program1, emailPush: true },
      }),
    ).rejects.toThrow();
  });
});

describe("update (AC-11)", () => {
  it("keeps the publish time when the day is left blank, audits the diff, and never asks for a second push", async () => {
    const id = await create({ emailPush: true });
    await publish(id);
    await db.announcement.update({ where: { id }, data: { pushedAt: new Date() } });
    const before = await db.announcement.findUniqueOrThrow({ where: { id } });
    const r = await run((ctx) =>
      svc.updateAnnouncement(ctx, id, input({ title: "Ndryshuar", emailPush: false })),
    );
    expect(r.ok).toBe(true);
    const after = await db.announcement.findUniqueOrThrow({ where: { id } });
    expect(after.title).toBe("Ndryshuar");
    expect(after.publishAt).toEqual(before.publishAt);
    expect(after.emailPush).toBe(true); // already pushed: unchanged
    expect(await db.auditLog.count({ where: { action: "ntf.announcement.update" } })).toBe(1);
  });
});
