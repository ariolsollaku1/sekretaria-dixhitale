import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createAction, type ActionContext, type ActionResult } from "@/lib/actions";
import { db, withTransaction } from "@/lib/db";
import "@/modules/org";
import "@/modules/hr";
import { staffSchema, type StaffFormInput } from "../domain/schemas";
import { getOwnStaff, getStaff, scopeWhere } from "./staff.queries";
import { registerStaffActiveHandler } from "./staff-hooks";
import * as svc from "./staff.service";

const actor = { id: "hr-1", email: "hr@t.test", name: "HR", locale: null, personId: null };
function run<R>(fn: (ctx: ActionContext) => Promise<R>, reason?: string): Promise<ActionResult<R>> {
  const action = createAction({
    getUser: async () => actor,
    can: async () => true,
    transaction: withTransaction,
    request: async () => ({ requestId: "r", ip: null, userAgent: null }),
  });
  return action({
    permission: "hr.staff.write",
    input: z.object({}).passthrough(),
    requireReason: reason !== undefined,
    handler: (_i, ctx) => fn(ctx),
  })({ reason } as never);
}

let dep1: string;
let dep2: string;
const input = (over: Partial<StaffFormInput> = {}) =>
  staffSchema.parse({
    firstName: "Arben",
    lastName: "Hoxha",
    gender: "MALE",
    birthDate: "1980-05-12",
    nationalId: "J12345678K",
    email: "arben@logos.test",
    phone: "+355 69 000 0000",
    address: "Rruga e Durrësit 1",
    kind: "ACADEMIC",
    category: "PAE",
    contractStart: "2020-09-01",
    departmentId: dep1,
    ...over,
  });
const create = async (over: Partial<StaffFormInput> = {}) => {
  const r = await run((ctx) => svc.createStaff(ctx, input(over)));
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.data.staffId;
};

beforeEach(async () => {
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "audit_logs", "staff", "user_roles", "departments", "faculties" CASCADE',
  );
  await db.user.deleteMany();
  await db.person.deleteMany();
  const f1 = await db.faculty.create({ data: { code: "F1", name: "F1" } });
  const f2 = await db.faculty.create({ data: { code: "F2", name: "F2" } });
  dep1 = (await db.department.create({ data: { code: "D1", name: "D1", facultyId: f1.id } })).id;
  dep2 = (await db.department.create({ data: { code: "D2", name: "D2", facultyId: f2.id } })).id;
});

describe("createStaff (AC-1..AC-6)", () => {
  it("creates person and staff together with an audit entry that masks personal values", async () => {
    const id = await create();
    const row = await db.staff.findUniqueOrThrow({ where: { id }, include: { person: true } });
    expect(row).toMatchObject({
      kind: "ACADEMIC",
      category: "PAE",
      active: true,
      departmentId: dep1,
    });
    expect(row.person).toMatchObject({ lastName: "Hoxha", nationalId: "J12345678K" });
    expect(row.contractStart.toISOString().slice(0, 10)).toBe("2020-09-01");

    const audit = await db.auditLog.findFirstOrThrow({ where: { action: "hr.staff.create" } });
    const after = audit.after as Record<string, unknown>;
    expect(after.lastName).toBe("Hoxha");
    for (const k of ["nationalId", "birthDate", "phone", "address"]) expect(after[k]).toBe("***");
    expect(JSON.stringify(audit)).not.toContain("J12345678K");
    expect(JSON.stringify(audit)).not.toContain("1980-05-12");
  });

  it("refuses an unknown or inactive department with a field error", async () => {
    await db.department.update({ where: { id: dep2 }, data: { active: false } });
    for (const departmentId of ["nope", dep2]) {
      const r = await run((ctx) => svc.createStaff(ctx, input({ departmentId })));
      expect(r).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    }
    expect(await db.person.count()).toBe(0);
  });

  it("refuses a duplicate national ID or e-mail and writes nothing", async () => {
    await create();
    for (const over of [{ email: "other@logos.test" }, { nationalId: "ZZ99" }]) {
      const r = await run((ctx) => svc.createStaff(ctx, input(over)));
      expect(r).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    }
    expect(await db.person.count()).toBe(1);
    expect(await db.staff.count()).toBe(1);
  });

  it("attaches the staff record to an existing person without staff and leaves their data alone", async () => {
    const person = await db.person.create({
      data: {
        firstName: "Old",
        lastName: "Name",
        gender: "FEMALE",
        birthDate: new Date("1990-01-01T00:00:00Z"),
        nationalId: "J12345678K",
      },
    });
    const id = await create({ firstName: "New", email: "arben@logos.test" });
    const staff = await db.staff.findUniqueOrThrow({ where: { id }, include: { person: true } });
    expect(staff.personId).toBe(person.id);
    expect(staff.person.firstName).toBe("Old");
  });

  it("refuses when the ID and the e-mail belong to different persons", async () => {
    await db.person.create({
      data: {
        firstName: "A",
        lastName: "A",
        gender: "MALE",
        birthDate: new Date("1990-01-01T00:00:00Z"),
        nationalId: "J12345678K",
      },
    });
    await db.person.create({
      data: {
        firstName: "B",
        lastName: "B",
        gender: "MALE",
        birthDate: new Date("1990-01-01T00:00:00Z"),
        email: "arben@logos.test",
      },
    });
    expect(await run((ctx) => svc.createStaff(ctx, input()))).toMatchObject({
      ok: false,
      error: { code: "VALIDATION" },
    });
  });

  it("links a login account with the same e-mail, but only one without a person", async () => {
    await db.user.create({ data: { id: "u1", email: "Arben@Logos.test", name: "Arben" } });
    await db.user.create({ data: { id: "u2", email: "other@logos.test", name: "Other" } });
    const id = await create();
    const staff = await db.staff.findUniqueOrThrow({ where: { id } });
    expect((await db.user.findUniqueOrThrow({ where: { id: "u1" } })).personId).toBe(
      staff.personId,
    );
    expect((await db.user.findUniqueOrThrow({ where: { id: "u2" } })).personId).toBeNull();

    // already linked to some other person: left alone
    const other = await db.person.create({
      data: {
        firstName: "X",
        lastName: "X",
        gender: "MALE",
        birthDate: new Date("1990-01-01T00:00:00Z"),
      },
    });
    await db.user.create({
      data: { id: "u3", email: "linked@logos.test", name: "L", personId: other.id },
    });
    await create({ nationalId: "ZZ1", email: "linked@logos.test" });
    expect((await db.user.findUniqueOrThrow({ where: { id: "u3" } })).personId).toBe(other.id);
  });
});

describe("updateStaff (AC-6)", () => {
  it("changes the record, audits a masked diff and refuses an ID used by someone else", async () => {
    const id = await create();
    await create({ nationalId: "OTHER1", email: "b@logos.test", firstName: "Berta" });
    const r = await run((ctx) =>
      svc.updateStaff(
        ctx,
        id,
        input({
          title: "Prof. Dr.",
          category: "PAK",
          primaryEmployer: "Ministria",
          phone: "+355 69 111 1111",
        }),
      ),
    );
    expect(r.ok).toBe(true);
    const row = await db.staff.findUniqueOrThrow({ where: { id }, include: { person: true } });
    expect(row).toMatchObject({
      title: "Prof. Dr.",
      category: "PAK",
      primaryEmployer: "Ministria",
    });
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: "hr.staff.update" } });
    expect(JSON.stringify(audit)).not.toContain("+355 69 111 1111");
    expect(JSON.stringify(audit.after)).toContain("PAK");

    const clash = await run((ctx) => svc.updateStaff(ctx, id, input({ nationalId: "OTHER1" })));
    expect(clash).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    expect(await run((ctx) => svc.updateStaff(ctx, "missing", input()))).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
  });
});

describe("setStaffActive (AC-7)", () => {
  it("ends and resumes employment with a reason, keeping the record", async () => {
    const id = await create();
    expect((await run((ctx) => svc.setStaffActive(ctx, id, false), "Contract ended")).ok).toBe(
      true,
    );
    expect((await db.staff.findUniqueOrThrow({ where: { id } })).active).toBe(false);
    expect(await run((ctx) => svc.setStaffActive(ctx, id, false), "again")).toMatchObject({
      ok: false,
      error: { code: "CONFLICT" },
    });
    expect((await run((ctx) => svc.setStaffActive(ctx, id, true), "Rehired")).ok).toBe(true);
    const audits = await db.auditLog.findMany({
      where: { action: { in: ["hr.staff.deactivate", "hr.staff.reactivate"] } },
      orderBy: { at: "asc" },
    });
    expect(audits.map((a) => a.reason)).toEqual(["Contract ended", "Rehired"]);
    expect(await db.staff.count()).toBe(1);
  });

  it("tells the registered handlers inside the transaction, and a failing handler undoes the change (IAM-02)", async () => {
    const id = await create();
    const seen: boolean[] = [];
    registerStaffActiveHandler("test.active", async (_ctx, e) => void seen.push(e.active));
    expect((await run((ctx) => svc.setStaffActive(ctx, id, false), "Left")).ok).toBe(true);
    expect(seen).toEqual([false]);
    registerStaffActiveHandler("test.active", async () => {
      throw new Error("boom");
    });
    expect((await run((ctx) => svc.setStaffActive(ctx, id, true), "Back")).ok).toBe(false);
    expect((await db.staff.findUniqueOrThrow({ where: { id } })).active).toBe(false);
    registerStaffActiveHandler("test.active", async () => undefined);
  });

  it("requires a reason", async () => {
    const id = await create();
    expect(await run((ctx) => svc.setStaffActive(ctx, id, false), "")).toMatchObject({ ok: false });
  });
});

describe("queries: scope and masking (AC-8..AC-10)", () => {
  async function user(
    id: string,
    role: "hr" | "head_of_department" | "finance" | "lecturer",
    scope?: { type: "DEPARTMENT" | "FACULTY"; id: string },
    personId?: string,
  ) {
    await db.user.create({ data: { id, email: `${id}@t.test`, name: id, personId } });
    await db.userRole.create({
      data: {
        userId: id,
        role,
        scopeType: scope?.type ?? "INSTITUTION",
        scopeId: scope?.id ?? null,
      },
    });
  }

  it("lets institution readers see all, a head of department only their department, and masks identifiers without the sensitive permission", async () => {
    const a = await create({ departmentId: dep1 });
    const b = await create({ nationalId: "B1", email: "b@logos.test", departmentId: dep2 });
    await user("hr", "hr");
    await user("fin", "finance");
    await user("head", "head_of_department", { type: "DEPARTMENT", id: dep1 });

    const ids = async (u: string) =>
      (await db.staff.findMany({ where: await scopeWhere({ id: u }), select: { id: true } }))
        .map((s) => s.id)
        .sort();
    expect(await ids("hr")).toEqual([a, b].sort());
    expect(await ids("fin")).toEqual([a, b].sort());
    expect(await ids("head")).toEqual([a]);

    expect(await getStaff({ id: "head" }, b)).toBeNull();
    const asHr = await getStaff({ id: "hr" }, a);
    expect(asHr).toMatchObject({
      nationalId: "J12345678K",
      birthDate: "1980-05-12",
      address: "Rruga e Durrësit 1",
    });
    const asFinance = await getStaff({ id: "fin" }, a);
    expect(asFinance).toMatchObject({
      lastName: "Hoxha",
      degree: null,
      nationalId: null,
      birthDate: null,
      address: null,
    });
  });

  it("shows a staff member only their own record", async () => {
    const id = await create();
    const staff = await db.staff.findUniqueOrThrow({ where: { id } });
    await create({ nationalId: "B1", email: "b@logos.test", firstName: "Berta" });
    await user("me", "lecturer", undefined, staff.personId);
    await user("nobody", "lecturer");
    expect(await getOwnStaff({ id: "me" })).toMatchObject({ id, nationalId: "J12345678K" });
    expect(await getOwnStaff({ id: "nobody" })).toBeNull();
  });
});
