import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createAction, type ActionContext, type ActionResult } from "@/lib/actions";
import { db, withTransaction } from "@/lib/db";
import "@/modules/org";
import "@/modules/ntf";
import "../permissions";
import { noticeSchema, type NoticeFormInput } from "../domain/schemas";
import { liveRegistrationNotices, listNotices, noticeDetail, getNotice } from "./notice.queries";
import * as svc from "./notice.service";
import { createNoticeAction, updateNoticeAction } from "./notice.actions";
import { publishAnnouncement } from "@/modules/ntf";
import { feeSummary } from "@/modules/fin";

let actorId = "sec";
function run<R>(fn: (ctx: ActionContext) => Promise<R>): Promise<ActionResult<R>> {
  const action = createAction({
    getUser: async () => ({
      id: actorId,
      email: `${actorId}@t.test`,
      name: actorId,
      locale: null,
      personId: null,
    }),
    can: async () => true,
    transaction: withTransaction,
    request: async () => ({ requestId: "r", ip: null, userAgent: null }),
  });
  return action({
    permission: "adm.notice.write",
    input: z.object({}).passthrough(),
    handler: (_i, ctx) => fn(ctx),
  })({} as never);
}
const ok = <T>(r: ActionResult<T>): T => {
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.data;
};

let yearId: string, otherYearId: string, progId: string, prog2Id: string;

const input = (over: Partial<NoticeFormInput> = {}) =>
  noticeSchema.parse({
    title: "Regjistrimi 2026-2027",
    body: "Afati i regjistrimit.",
    academicYearId: yearId,
    registrationDeadline: "2026-09-15",
    documents: ["Diploma e maturës", "Fotokopje e letërnjoftimit"],
    contractExcerpt: "Neni 3. Tarifa paguhet në këste.",
    ...over,
  });
const create = async (over: Partial<NoticeFormInput> = {}) =>
  ok(await run((ctx) => svc.createNotice(ctx, input(over))));

async function user(
  id: string,
  role: string,
  scopeType = "INSTITUTION",
  scopeId: string | null = null,
) {
  await db.user.create({ data: { id, email: `${id}@t.test`, name: id } });
  await db.userRole.create({
    data: { userId: id, role: role as never, scopeType: scopeType as never, scopeId },
  });
}

beforeEach(async () => {
  actorId = "sec";
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "audit_logs", "registration_notices", "announcements", "fee_discounts", "fee_installment_templates", "fee_schedule_items", "user_roles", "study_programs", "departments", "faculties", "semesters", "academic_years", "system_settings" CASCADE',
  );
  await db.user.deleteMany();
  const f = await db.faculty.create({ data: { code: "F", name: "F" } });
  const dep = await db.department.create({ data: { code: "D1", name: "D1", facultyId: f.id } });
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
  progId = await mk("P1");
  prog2Id = await mk("P2");
  yearId = (
    await db.academicYear.create({
      data: {
        code: "2026-2027",
        startDate: new Date("2026-09-01T00:00:00Z"),
        endDate: new Date("2027-08-31T00:00:00Z"),
        status: "CURRENT",
      },
    })
  ).id;
  otherYearId = (
    await db.academicYear.create({
      data: {
        code: "2027-2028",
        startDate: new Date("2027-09-01T00:00:00Z"),
        endDate: new Date("2028-08-31T00:00:00Z"),
        status: "PLANNED",
      },
    })
  ).id;
  await user("sec", "secretary");
  await user("coord", "program_coordinator", "PROGRAM", progId);
  await user("stu", "student", "SELF");
});

describe("create and update (AC-1, AC-3, AC-9)", () => {
  it("stores the announcement as a draft for everyone plus the campaign data, and audits both", async () => {
    const { noticeId, announcementId } = await create();
    const a = await db.announcement.findUniqueOrThrow({ where: { id: announcementId } });
    expect(a).toMatchObject({ status: "DRAFT", audience: "ALL", title: "Regjistrimi 2026-2027" });
    const n = await getNotice(noticeId);
    expect(n).toMatchObject({
      registrationDeadline: "2026-09-15",
      documents: ["Diploma e maturës", "Fotokopje e letërnjoftimit"],
      showFees: true,
      programId: null,
      yearCode: "2026-2027",
    });
    const actions = (await db.auditLog.findMany({ orderBy: { at: "asc" } })).map((x) => x.action);
    expect(actions).toEqual(["ntf.announcement.create", "adm.notice.create"]);
  });

  it("updates both halves and audits before and after", async () => {
    const { noticeId, announcementId } = await create();
    ok(
      await run((ctx) =>
        svc.updateNotice(
          ctx,
          noticeId,
          input({
            title: "Nou",
            registrationDeadline: "2026-10-01",
            documents: ["Foto"],
            programId: progId,
          }),
        ),
      ),
    );
    expect((await db.announcement.findUniqueOrThrow({ where: { id: announcementId } })).title).toBe(
      "Nou",
    );
    expect(await getNotice(noticeId)).toMatchObject({
      registrationDeadline: "2026-10-01",
      documents: ["Foto"],
      programId: progId,
    });
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: "adm.notice.update" } });
    expect(JSON.stringify(audit.before)).toContain("2026-09-15");
    expect(JSON.stringify(audit.after)).toContain("2026-10-01");
  });

  it("refuses an unknown year or program and rolls the announcement back", async () => {
    const r = await run((ctx) =>
      svc.createNotice(ctx, input({ academicYearId: "nope", programId: "nope" })),
    );
    expect(r).toMatchObject({
      ok: false,
      error: {
        code: "VALIDATION",
        fieldErrors: { academicYearId: ["yearNotFound"], programId: ["programNotFound"] },
      },
    });
    expect(await db.announcement.count()).toBe(0);
    expect(await db.registrationNotice.count()).toBe(0);
  });

  it("refuses an unknown notice", async () => {
    expect(await run((ctx) => svc.updateNotice(ctx, "missing", input()))).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
  });

  it("the database refuses more than 20 documents", async () => {
    const { noticeId } = await create();
    await expect(
      db.registrationNotice.update({
        where: { id: noticeId },
        data: { documents: Array.from({ length: 21 }, (_, i) => `d${i}`) },
      }),
    ).rejects.toThrow();
  });
});

describe("authorization (AC-6)", () => {
  it("a program-scoped author may not publish to everyone (NTF-01 scope check)", async () => {
    actorId = "coord";
    const r = await run((ctx) => svc.createNotice(ctx, input()));
    expect(r).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(await db.registrationNotice.count()).toBe(0);
  });

  it("the actions refuse roles without adm.notice.write", async () => {
    // the real wrapper (no `can` override): a student and a lecturer are refused before anything runs
    await user("lec", "lecturer");
    for (const id of ["stu", "lec"]) {
      actorId = id;
      const action = createAction({
        getUser: async () => ({
          id,
          email: `${id}@t.test`,
          name: id,
          locale: null,
          personId: null,
        }),
        can: (await import("@/lib/authz/guard")).can,
        transaction: withTransaction,
        request: async () => ({ requestId: "r", ip: null, userAgent: null }),
      });
      const r = await action({
        permission: "adm.notice.write",
        input: z.object({}).passthrough(),
        handler: (_i, ctx) => svc.createNotice(ctx, input()),
      })({} as never);
      expect(r).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    }
    expect(await db.registrationNotice.count()).toBe(0);
    // sanity: the exported actions exist for the writers
    expect(typeof createNoticeAction).toBe("function");
    expect(typeof updateNoticeAction).toBe("function");
  });
});

describe("fees and live notices (AC-4, AC-8)", () => {
  async function fee(program: string, year: string, amount: string, active = true) {
    const item = await db.feeScheduleItem.create({
      data: { programId: program, academicYearId: year, kind: "TUITION", amount, active },
    });
    await db.feeDiscount.create({
      data: {
        itemId: item.id,
        label: "early",
        kind: "PERCENT",
        value: "10",
        validFrom: new Date("2026-08-01T00:00:00Z"),
        validTo: new Date("2026-09-15T00:00:00Z"),
      },
    });
    return item.id;
  }

  it("reads active fees and preferential windows live from FIN-01", async () => {
    await fee(progId, yearId, "1000.00");
    await fee(prog2Id, yearId, "2000.00");
    await fee(progId, otherYearId, "9999.00");
    const { noticeId } = await create();
    const detail = await noticeDetail((await getNotice(noticeId))!);
    expect(detail.fees.map((p) => p.code)).toEqual(["P1", "P2"]);
    expect(detail.fees[0]!.items[0]).toMatchObject({
      amount: "1000.00",
      discounts: [{ label: "early", validFrom: "2026-08-01", validTo: "2026-09-15" }],
    });
    // a change in the fee schedule shows at once; nothing was copied into the notice
    await db.feeScheduleItem.updateMany({
      where: { programId: progId, academicYearId: yearId },
      data: { amount: "1100.00" },
    });
    expect((await noticeDetail((await getNotice(noticeId))!)).fees[0]!.items[0]!.amount).toBe(
      "1100.00",
    );
  });

  it("narrows to the chosen program, skips inactive fees, and hides fees when asked", async () => {
    await fee(progId, yearId, "1000.00");
    await fee(prog2Id, yearId, "2000.00", false);
    const one = await create({ programId: prog2Id });
    expect((await noticeDetail((await getNotice(one.noticeId))!)).fees).toEqual([]);
    const two = await create({ programId: progId });
    expect((await noticeDetail((await getNotice(two.noticeId))!)).fees.map((p) => p.code)).toEqual([
      "P1",
    ]);
    const hidden = await create({ showFees: false });
    expect((await noticeDetail((await getNotice(hidden.noticeId))!)).fees).toEqual([]);
    expect(await feeSummary(yearId, progId)).toHaveLength(1);
  });

  it("lists published, visible, audience-ALL notices only", async () => {
    await fee(progId, yearId, "1000.00");
    const draft = await create({ title: "Draft" });
    const live = await create({ title: "Live" });
    const archived = await create({ title: "Archived" });
    const future = await create({ title: "Future", publishDate: "2999-01-01" });
    const expired = await create({
      title: "Expired",
      publishDate: "2020-01-01",
      expiresDate: "2020-02-01",
    });
    for (const n of [live, archived, future, expired])
      ok(await run((ctx) => publishAnnouncement(ctx, n.announcementId)));
    await db.announcement.update({
      where: { id: archived.announcementId },
      data: { status: "ARCHIVED" },
    });
    expect(draft.noticeId).toBeTruthy();

    const result = await liveRegistrationNotices();
    expect(result.map((n) => n.title)).toEqual(["Live"]);
    expect(result[0]!.fees[0]!.items[0]!.amount).toBe("1000.00");
    expect((await listNotices()).map((n) => n.title).sort()).toEqual([
      "Archived",
      "Draft",
      "Expired",
      "Future",
      "Live",
    ]);
  });
});
