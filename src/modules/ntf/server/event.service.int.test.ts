import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { clearAudienceResolvers, registerAudienceResolver } from "@/lib/audience";
import { createAction, type ActionContext, type ActionResult } from "@/lib/actions";
import { db, withTransaction } from "@/lib/db";
import "@/modules/org";
import "@/modules/ntf";
import { eventSchema, type EventFormInput } from "../domain/event-schemas";
import { remindDueEvents } from "./event-reminder";
import { listEvents, visibleEvent } from "./event.queries";
import * as svc from "./event.service";
import { eventAttendeesTable, eventsTable } from "./event.table";

function runAs<R>(
  userId: string,
  fn: (ctx: ActionContext) => Promise<R>,
): Promise<ActionResult<R>> {
  const action = createAction({
    getUser: async () => ({
      id: userId,
      email: `${userId}@t.test`,
      name: userId,
      locale: null,
      personId: null,
    }),
    can: async () => true,
    transaction: withTransaction,
    request: async () => ({ requestId: "r", ip: null, userAgent: null }),
  });
  return action({
    permission: "ntf.event.write",
    input: z.object({}).passthrough(),
    handler: (_i, ctx) => fn(ctx),
  })({} as never);
}
const run = <R>(fn: (ctx: ActionContext) => Promise<R>) => runAs("admin", fn);

const FUTURE = "2099-06-10T18:30";
const input = (over: Partial<EventFormInput> = {}) =>
  eventSchema.parse({
    title: "Konferenca",
    description: "Për të gjithë.",
    location: "Salla 3",
    startsAt: FUTURE,
    audience: "ALL",
    ...over,
  });
const create = async (over: Partial<EventFormInput> = {}, by = "admin") => {
  const r = await runAs(by, (ctx) => svc.createEvent(ctx, input(over)));
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.data.eventId;
};
const publish = (id: string, by = "admin") => runAs(by, (ctx) => svc.publishEvent(ctx, id));
const published = async (over: Partial<EventFormInput> = {}) => {
  const id = await create(over);
  expect((await publish(id)).ok).toBe(true);
  return id;
};
const register = (id: string, by: string, now?: Date) =>
  runAs(by, (ctx) => svc.registerForEvent(ctx, id, now));
const unregister = (id: string, by: string, now?: Date) =>
  runAs(by, (ctx) => svc.unregisterFromEvent(ctx, id, now));
const code = (r: ActionResult<unknown>) => (r.ok ? "OK" : r.error.message);

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
    'TRUNCATE TABLE "audit_logs", "email_outbox", "notifications", "notification_preferences", "event_registrations", "events", "announcements", "user_roles", "study_programs", "departments", "faculties" CASCADE',
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
  await user("stu2", [{ role: "student", scopeType: "SELF" }]);
});

describe("lifecycle and visibility (AC-1..AC-3, AC-9, AC-10)", () => {
  it("creates a draft, hides it from readers, publishes it, and audits each step", async () => {
    const id = await create({ capacity: "30", endsAt: "2099-06-10T20:00" });
    expect(await db.event.findUniqueOrThrow({ where: { id } })).toMatchObject({
      status: "DRAFT",
      capacity: 30,
    });
    // 18:30 in Europe/Tirane (summer, UTC+2)
    expect((await db.event.findUniqueOrThrow({ where: { id } })).startsAt.toISOString()).toBe(
      "2099-06-10T16:30:00.000Z",
    );
    expect((await listEvents("lec")).upcoming).toHaveLength(0);
    expect(await visibleEvent("lec", id)).toBeNull();
    expect(await visibleEvent("admin", id)).not.toBeNull(); // organisers see drafts

    expect((await publish(id)).ok).toBe(true);
    expect(code(await publish(id))).toBe("NOT_DRAFT");
    expect((await listEvents("lec")).upcoming.map((e) => e.id)).toEqual([id]);
    expect(await visibleEvent("stu", id)).not.toBeNull();

    expect((await run((ctx) => svc.cancelEvent(ctx, id))).ok).toBe(true);
    expect(code(await run((ctx) => svc.cancelEvent(ctx, id)))).toBe("NOT_PUBLISHED");
    expect(code(await publish(id))).toBe("NOT_DRAFT");
    // cancelled stays visible, with its status
    expect((await listEvents("lec")).upcoming[0]?.status).toBe("CANCELLED");
    expect(code(await run((ctx) => svc.updateEvent(ctx, id, input({ title: "Nova" }))))).toBe(
      "EVENT_CANCELLED",
    );
    expect(await db.event.count()).toBe(1);
    expect((await db.auditLog.findMany({ orderBy: { at: "asc" } })).map((a) => a.action)).toEqual([
      "ntf.event.create",
      "ntf.event.publish",
      "ntf.event.cancel",
    ]);
  });

  it("updates an event with before/after in the audit log", async () => {
    const id = await create();
    expect((await run((ctx) => svc.updateEvent(ctx, id, input({ location: "Salla 9" })))).ok).toBe(
      true,
    );
    const entry = await db.auditLog.findFirstOrThrow({ where: { action: "ntf.event.update" } });
    expect(entry.before).toMatchObject({ location: "Salla 3" });
    expect(entry.after).toMatchObject({ location: "Salla 9" });
    expect(code(await run((ctx) => svc.updateEvent(ctx, "missing", input())))).toBe(
      "Event not found",
    );
  });

  it("splits upcoming and past events", async () => {
    await published({ title: "Soon" });
    const old = await published({ title: "Old" });
    await db.event.update({ where: { id: old }, data: { startsAt: new Date("2020-01-01") } });
    const { upcoming, past } = await listEvents("lec");
    expect(upcoming.map((e) => e.title)).toEqual(["Soon"]);
    expect(past.map((e) => e.title)).toEqual(["Old"]);
  });

  it("shows STAFF events to staff only and PROGRAM/CYCLE events by the audience resolvers", async () => {
    const staff = await published({ title: "Staff", audience: "STAFF" });
    const students = await published({ title: "Students", audience: "STUDENTS" });
    const program = await published({ title: "Prog", audience: "PROGRAM", programId: program1 });
    const cycle = await published({ title: "Cycle", audience: "CYCLE", cycle: "SECOND" });
    registerAudienceResolver(async (userId) =>
      userId === "stu" ? { cycles: [], programIds: [program1] } : { cycles: [], programIds: [] },
    );
    const titles = async (u: string) => (await listEvents(u)).upcoming.map((e) => e.title).sort();
    expect(await titles("lec")).toEqual(["Cycle", "Prog", "Staff", "Students"]);
    expect(await titles("stu")).toEqual(["Prog", "Students"]);
    expect(await titles("stu2")).toEqual(["Students"]);
    expect(await visibleEvent("stu2", staff)).toBeNull();
    expect(await visibleEvent("stu2", program)).toBeNull();
    expect(await visibleEvent("stu", cycle)).toBeNull();
    expect(await visibleEvent("stu", students)).not.toBeNull();
  });

  it("limits a program coordinator to events of their program (AC-10)", async () => {
    const own = await runAs("coord", (ctx) =>
      svc.createEvent(ctx, input({ audience: "PROGRAM", programId: program1 })),
    );
    expect(own.ok).toBe(true);
    const other = await runAs("coord", (ctx) =>
      svc.createEvent(ctx, input({ audience: "PROGRAM", programId: program2 })),
    );
    expect(other).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    const all = await runAs("coord", (ctx) => svc.createEvent(ctx, input({ audience: "ALL" })));
    expect(all).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    const missing = await runAs("admin", (ctx) =>
      svc.createEvent(ctx, input({ audience: "PROGRAM", programId: "nope" })),
    );
    expect(missing).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    const badLink = await runAs("admin", (ctx) =>
      svc.createEvent(ctx, input({ announcementId: "nope" })),
    );
    expect(badLink).toMatchObject({
      ok: false,
      error: { fieldErrors: { announcementId: ["announcementMissing"] } },
    });

    // the coordinator manages (sees in the table) only their program's events
    const adminOwn = await create({ title: "All", audience: "ALL" });
    const rowsOf = async (u: string) =>
      (
        await eventsTable.fetch(
          {
            page: 1,
            pageSize: 25,
            sort: { key: "startsAt", dir: "asc" },
            filters: {},
            columns: [],
          },
          { user: { id: u } },
        )
      ).rows.map((r) => r.id);
    expect(await rowsOf("coord")).toHaveLength(1);
    expect(await rowsOf("admin")).toContain(adminOwn);
    expect(await rowsOf("admin")).toHaveLength(2);
    // and a coordinator cannot change an event outside their reach
    expect((await runAs("coord", (ctx) => svc.publishEvent(ctx, adminOwn))).ok).toBe(false);
  });

  it("links an announcement", async () => {
    const a = await db.announcement.create({ data: { title: "Njoftim", body: "b" } });
    const id = await create({ announcementId: a.id });
    expect((await visibleEvent("admin", id))?.announcementTitle).toBe("Njoftim");
  });
});

describe("registration (AC-4..AC-7)", () => {
  it("registers once, notifies, and audits", async () => {
    const id = await published({ capacity: "5" });
    expect((await register(id, "stu")).ok).toBe(true);
    expect(code(await register(id, "stu"))).toBe("ALREADY_REGISTERED");
    expect((await visibleEvent("stu", id))?.registeredCount).toBe(1);
    expect(await db.notification.findFirstOrThrow({ where: { userId: "stu" } })).toMatchObject({
      type: "ntf.event-registered",
      link: `/events/${id}`,
    });
    expect(await db.auditLog.count({ where: { action: "ntf.event.register" } })).toBe(1);
    expect((await listEvents("stu")).upcoming[0]?.myStatus).toBe("REGISTERED");
  });

  it("refuses a draft, a cancelled event, an invisible event and a started event", async () => {
    const draft = await create();
    expect(code(await register(draft, "stu"))).toBe("Event not found"); // invisible to readers
    expect(code(await register(draft, "admin"))).toBe("Event not found");
    const staffOnly = await published({ audience: "STAFF" });
    expect(code(await register(staffOnly, "stu"))).toBe("Event not found");
    expect((await register(staffOnly, "lec")).ok).toBe(true);
    const gone = await published();
    await run((ctx) => svc.cancelEvent(ctx, gone));
    expect(code(await register(gone, "stu"))).toBe("CANCELLED");
    const later = await published();
    const afterStart = new Date("2100-01-01T00:00:00Z");
    expect(code(await register(later, "stu", afterStart))).toBe("STARTED");
    expect(await db.eventRegistration.count({ where: { userId: "stu" } })).toBe(0);
  });

  it("closes at the deadline", async () => {
    const id = await published({ registrationDeadline: "2099-06-09T12:00" });
    expect(code(await register(id, "stu", new Date("2099-06-09T11:00:00Z")))).toBe("CLOSED");
    expect((await register(id, "stu", new Date("2099-06-09T09:00:00Z"))).ok).toBe(true);
  });

  it("refuses when full, frees a place on cancel, and allows registering again", async () => {
    const id = await published({ capacity: "1" });
    expect((await register(id, "stu")).ok).toBe(true);
    expect(code(await register(id, "stu2"))).toBe("FULL");
    expect((await unregister(id, "stu")).ok).toBe(true);
    expect(code(await unregister(id, "stu"))).toBe("NOT_REGISTERED");
    expect((await register(id, "stu2")).ok).toBe(true);
    expect(code(await register(id, "stu"))).toBe("FULL");
    // the cancelled row is kept
    expect(
      await db.eventRegistration.findUniqueOrThrow({
        where: { eventId_userId: { eventId: id, userId: "stu" } },
      }),
    ).toMatchObject({ status: "CANCELLED" });
    expect(await db.eventRegistration.count()).toBe(2);
    // a person who cancelled may register again once a place is free
    await unregister(id, "stu2");
    expect((await register(id, "stu")).ok).toBe(true);
    const row = await db.eventRegistration.findUniqueOrThrow({
      where: { eventId_userId: { eventId: id, userId: "stu" } },
    });
    expect(row).toMatchObject({ status: "REGISTERED", cancelledAt: null });
    expect(await db.auditLog.count({ where: { action: "ntf.event.unregister" } })).toBe(2);
  });

  it("cannot cancel a registration once the event started", async () => {
    const id = await published();
    await register(id, "stu");
    expect(code(await unregister(id, "stu", new Date("2100-01-01T00:00:00Z")))).toBe(
      "CANNOT_CANCEL",
    );
  });

  it("never registers more people than the capacity under concurrency (AC-5)", async () => {
    const id = await published({ capacity: "3" });
    const ids = Array.from({ length: 10 }, (_, i) => `racer${i}`);
    for (const u of ids) await user(u, [{ role: "student", scopeType: "SELF" }]);
    const results = await Promise.all(ids.map((u) => register(id, u)));
    expect(results.filter((r) => r.ok)).toHaveLength(3);
    expect(results.filter((r) => !r.ok).every((r) => code(r) === "FULL")).toBe(true);
    expect(await db.eventRegistration.count({ where: { status: "REGISTERED" } })).toBe(3);
  }, 30_000);

  it("allows lowering the capacity below the registered count without removing anybody", async () => {
    const id = await published({ capacity: "3" });
    await register(id, "stu");
    await register(id, "stu2");
    expect((await run((ctx) => svc.updateEvent(ctx, id, input({ capacity: "1" })))).ok).toBe(true);
    expect((await visibleEvent("admin", id))?.registeredCount).toBe(2);
    expect(code(await register(id, "lec"))).toBe("FULL");
  });
});

describe("cancelling an event (AC-9) and attendees (AC-11)", () => {
  it("notifies the registered people once and keeps the registrations", async () => {
    const id = await published();
    await register(id, "stu");
    await register(id, "stu2");
    await unregister(id, "stu2");
    await db.notification.deleteMany();
    await db.emailOutbox.deleteMany();
    const r = await run((ctx) => svc.cancelEvent(ctx, id));
    expect(r).toMatchObject({ ok: true, data: { notified: 1 } });
    expect(await db.notification.findMany({ select: { userId: true, type: true } })).toEqual([
      { userId: "stu", type: "ntf.event-cancelled" },
    ]);
    expect(await db.eventRegistration.count()).toBe(2);
  });

  it("lists attendees to organisers only for events within their scope", async () => {
    const mine = await runAs("coord", (ctx) =>
      svc.createEvent(ctx, input({ title: "Mine", audience: "PROGRAM", programId: program1 })),
    );
    const mineId = mine.ok ? mine.data.eventId : "";
    await runAs("coord", (ctx) => svc.publishEvent(ctx, mineId));
    const other = await published({ title: "Other" });
    registerAudienceResolver(async () => ({ cycles: [], programIds: [program1] }));
    await register(mineId, "stu");
    await register(other, "stu");
    await register(other, "stu2");
    await unregister(other, "stu2");
    const params = {
      page: 1,
      pageSize: 25,
      sort: { key: "registeredAt", dir: "asc" as const },
      columns: [],
    };
    const names = async (u: string, filters: Record<string, string> = {}) =>
      (await eventAttendeesTable.fetch({ ...params, filters }, { user: { id: u } })).rows
        .map((r) => `${r.name}@${r.event}`)
        .sort();
    expect(await names("admin")).toEqual(["stu@Mine", "stu@Other"]);
    expect(await names("admin", { event: other })).toEqual(["stu@Other"]);
    expect(await names("coord")).toEqual(["stu@Mine"]);
    expect(await names("coord", { event: other })).toEqual([]);
  });
});

describe("reminders (AC-8)", () => {
  const at = (iso: string) => new Date(iso);
  it("reminds registered people once, only inside the 24 hour window", async () => {
    const id = await published({ startsAt: "2099-06-10T18:30" }); // 16:30 UTC
    await register(id, "stu");
    await register(id, "stu2");
    await unregister(id, "stu2");
    await db.notification.deleteMany();
    await db.emailOutbox.deleteMany();

    expect(await remindDueEvents(at("2099-06-08T16:00:00Z"))).toBe(0); // 48 h before
    expect(await db.notification.count()).toBe(0);

    expect(await remindDueEvents(at("2099-06-09T17:00:00Z"))).toBe(1); // 23.5 h before
    expect(await db.notification.findMany({ select: { userId: true, type: true } })).toEqual([
      { userId: "stu", type: "ntf.event-reminder" },
    ]);
    expect(await db.emailOutbox.count()).toBe(1);
    expect((await db.event.findUniqueOrThrow({ where: { id } })).remindedAt).not.toBeNull();

    // exactly once
    expect(await remindDueEvents(at("2099-06-09T18:00:00Z"))).toBe(0);
    expect(await db.notification.count()).toBe(1);
  });

  it("cannot double-remind after a crash before remindedAt was set", async () => {
    const id = await published();
    await register(id, "stu");
    await db.notification.deleteMany();
    await db.emailOutbox.deleteMany();
    await remindDueEvents(at("2099-06-10T10:00:00Z"));
    await db.event.update({ where: { id }, data: { remindedAt: null } });
    await remindDueEvents(at("2099-06-10T11:00:00Z"));
    expect(await db.notification.count()).toBe(1);
  });

  it("skips drafts, cancelled and started events", async () => {
    await create({ title: "Draft" });
    const gone = await published({ title: "Gone" });
    await register(gone, "stu");
    await run((ctx) => svc.cancelEvent(ctx, gone));
    await published({ title: "Started" });
    await db.notification.deleteMany();
    await db.emailOutbox.deleteMany();
    expect(await remindDueEvents(at("2099-06-10T10:00:00Z"))).toBe(1); // "Started" is still ahead here
    expect(await remindDueEvents(at("2099-06-10T17:00:00Z"))).toBe(0); // after the start
    expect(await db.notification.count()).toBe(0);
  });
});

describe("database checks (AC-1)", () => {
  it("rejects inconsistent rows", async () => {
    const base = {
      title: "t",
      description: "d",
      location: "l",
      startsAt: new Date("2099-01-01T10:00:00Z"),
    };
    await expect(db.event.create({ data: { ...base, capacity: 0 } })).rejects.toThrow();
    await expect(
      db.event.create({ data: { ...base, endsAt: new Date("2099-01-01T09:00:00Z") } }),
    ).rejects.toThrow();
    await expect(
      db.event.create({
        data: { ...base, registrationDeadline: new Date("2099-01-01T10:00:01Z") },
      }),
    ).rejects.toThrow();
    await expect(db.event.create({ data: { ...base, audience: "PROGRAM" } })).rejects.toThrow();
    await expect(
      db.event.create({ data: { ...base, audience: "ALL", cycle: "FIRST" } }),
    ).rejects.toThrow();
  });
});
