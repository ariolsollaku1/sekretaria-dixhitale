import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createAction, type ActionContext, type ActionResult } from "@/lib/actions";
import { assignRole } from "@/lib/authz";
import { db, withTransaction } from "@/lib/db";
import { getRoleEditorOptions } from "@/modules/iam";
import "@/modules/org";
import { getDepartment, getDepartmentHeads, getFaculty, listFacultyOptions } from "./unit.queries";
import * as units from "./unit.service";

const actor = { id: "admin-1", email: "a@t.test", name: "Admin", locale: null, personId: null };

function run<R>(fn: (ctx: ActionContext) => Promise<R>, reason?: string): Promise<ActionResult<R>> {
  const action = createAction({
    getUser: async () => actor,
    can: async () => true,
    transaction: withTransaction,
    request: async () => ({ requestId: "r", ip: null, userAgent: null }),
  });
  return action({
    permission: "org.faculty.write",
    input: z.object({}).passthrough(),
    requireReason: reason !== undefined,
    handler: (_i, ctx) => fn(ctx),
  })({ reason } as never);
}
const id = <T extends { id: string }>(r: ActionResult<T>) => (r.ok ? r.data.id : "");

beforeEach(async () => {
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "audit_logs", "user_roles", "departments", "faculties" CASCADE',
  );
  await db.user.deleteMany();
});

const faculty = (code = "FE", name = "Fakulteti i Ekonomisë") =>
  run((ctx) => units.createFaculty(ctx, { code, name, nameEn: null }));
const department = (facultyId: string, code = "ECO", name = "Ekonomi") =>
  run((ctx) => units.createDepartment(ctx, { facultyId, code, name, nameEn: "Economics" }));

describe("faculties (AC-1, AC-3, AC-5, AC-6)", () => {
  it("creates, updates and audits with before/after", async () => {
    const f = id(await faculty());
    expect(await db.faculty.findUniqueOrThrow({ where: { id: f } })).toMatchObject({
      code: "FE",
      active: true,
      createdById: "admin-1",
    });
    expect(
      await run((ctx) =>
        units.updateFaculty(ctx, f, {
          code: "FEK",
          name: "Fakulteti Ekonomik",
          nameEn: "Economics",
        }),
      ),
    ).toMatchObject({ ok: true });
    const audits = await db.auditLog.findMany({
      where: { entityType: "Faculty", entityId: f },
      orderBy: { at: "asc" },
    });
    expect(audits.map((a) => a.action)).toEqual(["org.faculty.create", "org.faculty.update"]);
    expect(audits[1]).toMatchObject({
      before: { code: "FE", name: "Fakulteti i Ekonomisë" },
      after: { code: "FEK", name: "Fakulteti Ekonomik", nameEn: "Economics" },
    });
  });

  it("refuses codes already used by a faculty or a department, case-insensitively (AC-2)", async () => {
    const f = id(await faculty("FE"));
    await department(f, "ECO");
    // the schema normalises before the service sees the code; the service compares stored forms
    expect(await faculty("FE")).toMatchObject({
      ok: false,
      error: { fieldErrors: { code: ["codeTaken"] } },
    });
    expect(await faculty("ECO")).toMatchObject({
      ok: false,
      error: { fieldErrors: { code: ["codeTaken"] } },
    });
    expect(await department(f, "FE")).toMatchObject({
      ok: false,
      error: { fieldErrors: { code: ["codeTaken"] } },
    });
    const other = id(await faculty("FD"));
    expect(
      await run((ctx) => units.updateFaculty(ctx, other, { code: "ECO", name: "x", nameEn: null })),
    ).toMatchObject({ ok: false, error: { fieldErrors: { code: ["codeTaken"] } } });
    expect(
      await run((ctx) =>
        units.updateFaculty(ctx, other, { code: "FD", name: "renamed", nameEn: null }),
      ),
    ).toMatchObject({ ok: true }); // own code is fine
  });

  it("lets only one of two concurrent creates of the same code win", async () => {
    const [a, b] = await Promise.all([faculty("RACE"), faculty("RACE")]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    expect(await db.faculty.count({ where: { code: "RACE" } })).toBe(1);
  });

  it("deactivates with a reason, never deletes, and reactivates", async () => {
    const f = id(await faculty());
    expect(await run((ctx) => units.deactivateFaculty(ctx, f), "merged")).toMatchObject({
      ok: true,
    });
    expect((await db.faculty.findUniqueOrThrow({ where: { id: f } })).active).toBe(false);
    expect(
      await db.auditLog.findFirstOrThrow({ where: { action: "org.faculty.deactivate" } }),
    ).toMatchObject({ reason: "merged", before: { active: true }, after: { active: false } });
    expect(await run((ctx) => units.deactivateFaculty(ctx, f), "again")).toMatchObject({
      ok: false,
      error: { message: "ALREADY_INACTIVE" },
    });
    expect(await run((ctx) => units.reactivateFaculty(ctx, f), "back")).toMatchObject({ ok: true });
    expect(await run((ctx) => units.reactivateFaculty(ctx, f), "again")).toMatchObject({
      ok: false,
      error: { message: "ALREADY_ACTIVE" },
    });
  });

  it("refuses to deactivate a faculty with active departments and names the count", async () => {
    const f = id(await faculty());
    await department(f, "D1");
    const d2 = id(await department(f, "D2"));
    expect(await run((ctx) => units.deactivateFaculty(ctx, f), "x")).toMatchObject({
      ok: false,
      error: { code: "CONFLICT", message: "HAS_ACTIVE_DEPARTMENTS:2" },
    });
    await run((ctx) => units.deactivateDepartment(ctx, d2), "x");
    expect(await run((ctx) => units.deactivateFaculty(ctx, f), "x")).toMatchObject({
      ok: false,
      error: { message: "HAS_ACTIVE_DEPARTMENTS:1" },
    });
  });

  it("reports unknown faculties", async () => {
    expect(
      await run((ctx) => units.updateFaculty(ctx, "nope", { code: "XX", name: "x", nameEn: null })),
    ).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });
});

describe("departments (AC-1, AC-4, AC-5, AC-6)", () => {
  it("creates under an active faculty and audits it with the faculty code", async () => {
    const f = id(await faculty());
    const d = id(await department(f));
    expect(await db.department.findUniqueOrThrow({ where: { id: d } })).toMatchObject({
      facultyId: f,
      code: "ECO",
      nameEn: "Economics",
    });
    expect(
      await db.auditLog.findFirstOrThrow({ where: { action: "org.department.create" } }),
    ).toMatchObject({ after: { code: "ECO", facultyCode: "FE" } });
  });

  it("refuses an inactive or unknown faculty (AC-4)", async () => {
    const f = id(await faculty());
    await run((ctx) => units.deactivateFaculty(ctx, f), "x");
    expect(await department(f)).toMatchObject({
      ok: false,
      error: { fieldErrors: { facultyId: ["facultyInactive"] } },
    });
    expect(await department("nope")).toMatchObject({
      ok: false,
      error: { fieldErrors: { facultyId: ["facultyNotFound"] } },
    });
    expect(await db.department.count()).toBe(0);
  });

  it("keeps the faculty fixed on update, and updates name and code", async () => {
    const f = id(await faculty());
    const d = id(await department(f));
    expect(
      await run((ctx) =>
        units.updateDepartment(ctx, d, { code: "ECON", name: "Ekonomia", nameEn: null }),
      ),
    ).toMatchObject({ ok: true });
    expect(await db.department.findUniqueOrThrow({ where: { id: d } })).toMatchObject({
      facultyId: f,
      code: "ECON",
      name: "Ekonomia",
    });
  });

  it("cannot be reactivated under an inactive faculty (AC-6)", async () => {
    const f = id(await faculty());
    const d = id(await department(f));
    await run((ctx) => units.deactivateDepartment(ctx, d), "x");
    await run((ctx) => units.deactivateFaculty(ctx, f), "x");
    expect(await run((ctx) => units.reactivateDepartment(ctx, d), "x")).toMatchObject({
      ok: false,
      error: { message: "FACULTY_INACTIVE" },
    });
    await run((ctx) => units.reactivateFaculty(ctx, f), "x");
    expect(await run((ctx) => units.reactivateDepartment(ctx, d), "x")).toMatchObject({ ok: true });
  });
});

describe("scope resolvers and the role editor (AC-7, AC-8)", () => {
  it("assignRole accepts active units and rejects inactive and unknown ones", async () => {
    const f = id(await faculty());
    const d = id(await department(f));
    const user = await db.user.create({ data: { email: "u@t.test", name: "U" } });
    await withTransaction(async (tx) => {
      await assignRole(tx, user.id, { role: "secretary", scopeType: "FACULTY", scopeId: f });
      await assignRole(tx, user.id, {
        role: "head_of_department",
        scopeType: "DEPARTMENT",
        scopeId: d,
      });
    });
    await expect(
      withTransaction((tx) =>
        assignRole(tx, user.id, {
          role: "head_of_department",
          scopeType: "DEPARTMENT",
          scopeId: "nope",
        }),
      ),
    ).rejects.toMatchObject({ code: "SCOPE_NOT_FOUND" });
    await run((ctx) => units.deactivateDepartment(ctx, d), "x");
    const other = await db.user.create({ data: { email: "o@t.test", name: "O" } });
    await expect(
      withTransaction((tx) =>
        assignRole(tx, other.id, {
          role: "head_of_department",
          scopeType: "DEPARTMENT",
          scopeId: d,
        }),
      ),
    ).rejects.toMatchObject({ code: "SCOPE_NOT_FOUND" });
  });

  it("offers faculty and department scopes in the IAM role editor, only for active units", async () => {
    const before = await getRoleEditorOptions();
    expect(before.allowedScopes.head_of_department).toEqual(["DEPARTMENT"]); // resolver registered, even with no units
    expect(before.scopeChoices.DEPARTMENT).toEqual([]);

    const f = id(await faculty());
    const d = id(await department(f));
    const after = await getRoleEditorOptions();
    expect(after.allowedScopes.secretary).toEqual(["INSTITUTION", "FACULTY"]);
    expect(after.scopeChoices.FACULTY).toEqual([{ id: f, label: "FE — Fakulteti i Ekonomisë" }]);
    expect(after.scopeChoices.DEPARTMENT).toEqual([{ id: d, label: "FE / ECO — Ekonomi" }]);
    await run((ctx) => units.deactivateDepartment(ctx, d), "x");
    expect((await getRoleEditorOptions()).scopeChoices.DEPARTMENT).toEqual([]);
  });

  it("a department's ancestors resolve to its faculty, which makes faculty-scoped roles apply", async () => {
    const { getScopeResolver } = await import("@/lib/authz/registry");
    const f = id(await faculty());
    const d = id(await department(f));
    expect(await getScopeResolver("DEPARTMENT")!.ancestors(d)).toEqual({ facultyId: f });
    expect(await getScopeResolver("DEPARTMENT")!.ancestors("nope")).toEqual({});
    expect(await getScopeResolver("FACULTY")!.ancestors(f)).toEqual({});
  });
});

describe("queries (AC-9)", () => {
  it("lists the current heads of a department from role assignments", async () => {
    const f = id(await faculty());
    const d = id(await department(f));
    const head = await db.user.create({ data: { email: "head@t.test", name: "Head One" } });
    const gone = await db.user.create({ data: { email: "gone@t.test", name: "Gone" } });
    const inactive = await db.user.create({
      data: { email: "off@t.test", name: "Off", active: false },
    });
    const now = Date.now();
    await db.userRole.createMany({
      data: [
        { userId: head.id, role: "head_of_department", scopeType: "DEPARTMENT", scopeId: d },
        {
          userId: gone.id,
          role: "head_of_department",
          scopeType: "DEPARTMENT",
          scopeId: d,
          validFrom: new Date(now - 10 * 86_400_000),
          validTo: new Date(now - 86_400_000),
        },
        { userId: inactive.id, role: "head_of_department", scopeType: "DEPARTMENT", scopeId: d },
      ],
    });
    expect((await getDepartmentHeads(d)).map((u) => u.name)).toEqual(["Head One"]);
    expect((await getDepartment(d))?.heads).toHaveLength(1);
    expect(await getDepartment("nope")).toBeNull();
  });

  it("returns a faculty with its departments and active-only options", async () => {
    const f = id(await faculty());
    await department(f, "D1");
    expect((await getFaculty(f))?.departments.map((d) => d.code)).toEqual(["D1"]);
    expect((await listFacultyOptions()).map((o) => o.id)).toEqual([f]);
  });
});
