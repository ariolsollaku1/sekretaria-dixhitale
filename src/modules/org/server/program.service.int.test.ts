import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createAction, type ActionContext, type ActionResult } from "@/lib/actions";
import { assignRole } from "@/lib/authz";
import { canOf } from "@/lib/authz/check";
import { expandTargetScope } from "@/lib/authz/guard";
import { getScopeResolver } from "@/lib/authz/registry";
import { db, withTransaction } from "@/lib/db";
import { getRoleEditorOptions } from "@/modules/iam";
import "@/modules/org";
import { registerProgramDependent, resetProgramDependents } from "./program-dependents";
import {
  getProgram,
  getProgramConfig,
  getProgramCoordinators,
  listSubtypes,
} from "./program.queries";
import * as programs from "./program.service";
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
    permission: "org.program.write",
    input: z.object({}).passthrough(),
    requireReason: reason !== undefined,
    handler: (_i, ctx) => fn(ctx),
  })({ reason } as never);
}
const idOf = <T extends { id: string }>(r: ActionResult<T>) => (r.ok ? r.data.id : "");

let departmentId: string;
let facultyId: string;

const base = {
  cycle: "FIRST",
  subtype: null,
  code: "BSC-ECO",
  name: "Ekonomi",
  nameEn: null,
  durationYears: 3,
  totalCredits: 180,
} as const;
const create = (over: Partial<Parameters<typeof programs.createProgram>[1]> = {}) =>
  run((ctx) => programs.createProgram(ctx, { departmentId, ...base, ...over }));

beforeEach(async () => {
  resetProgramDependents();
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "audit_logs", "user_roles", "study_programs", "departments", "faculties" CASCADE',
  );
  await db.user.deleteMany();
  await db.systemSetting.deleteMany({ where: { key: { startsWith: "org." } } });
  facultyId = idOf(
    await run((ctx) => units.createFaculty(ctx, { code: "FE", name: "Fakulteti", nameEn: null })),
  );
  departmentId = idOf(
    await run((ctx) =>
      units.createDepartment(ctx, { facultyId, code: "ECO", name: "Ekonomi", nameEn: null }),
    ),
  );
});

describe("createProgram (AC-2, AC-3, AC-4, AC-5)", () => {
  it("creates, audits, and keeps the department", async () => {
    const id = idOf(await create());
    expect(await db.studyProgram.findUniqueOrThrow({ where: { id } })).toMatchObject({
      departmentId,
      cycle: "FIRST",
      durationYears: 3,
      totalCredits: 180,
      active: true,
      createdById: "admin-1",
    });
    expect(
      await db.auditLog.findFirstOrThrow({ where: { action: "org.program.create" } }),
    ).toMatchObject({
      entityId: id,
      before: null,
      after: { code: "BSC-ECO", departmentCode: "ECO" },
    });
  });

  it("applies the default duration rules and refuses subtypes outside the Master cycle", async () => {
    expect(await create({ code: "B2", durationYears: 2 })).toMatchObject({
      ok: false,
      error: { fieldErrors: { durationYears: ["durationNotAllowed"] } },
    });
    expect(
      await create({ code: "M2", cycle: "SECOND", durationYears: 2, subtype: "PROFESSIONAL" }),
    ).toMatchObject({ ok: true });
    expect(await create({ code: "M1", cycle: "SECOND", durationYears: 3 })).toMatchObject({
      ok: false,
      error: { fieldErrors: { durationYears: ["durationNotAllowed"] } },
    });
    expect(await create({ code: "B3", subtype: "PROFESSIONAL" })).toMatchObject({
      ok: false,
      error: { fieldErrors: { subtype: ["subtypeOnlyMaster"] } },
    });
    expect(
      await create({ code: "M9", cycle: "SECOND", durationYears: 2, subtype: "NOPE" }),
    ).toMatchObject({ ok: false, error: { fieldErrors: { subtype: ["subtypeUnknown"] } } });
  });

  it("reads the allowed durations and subtypes from the settings (configurable)", async () => {
    await db.systemSetting.createMany({
      data: [
        { key: "org.programDurations", value: { FIRST: [3], SECOND: [1] } },
        {
          key: "org.programSubtypes",
          value: [{ code: "RESEARCH", nameSq: "Kërkimore", nameEn: "Research" }],
        },
      ],
    });
    expect(await getProgramConfig()).toEqual({
      durations: { FIRST: [3], SECOND: [1] },
      subtypes: ["RESEARCH"],
    });
    expect(await create({ code: "M2", cycle: "SECOND", durationYears: 2 })).toMatchObject({
      ok: false,
    });
    expect(
      await create({ code: "M1", cycle: "SECOND", durationYears: 1, subtype: "RESEARCH" }),
    ).toMatchObject({ ok: true });
    expect(await listSubtypes()).toEqual([
      { code: "RESEARCH", nameSq: "Kërkimore", nameEn: "Research" },
    ]);
  });

  it("uses the defaults when the settings are missing or malformed", async () => {
    await db.systemSetting.create({ data: { key: "org.programDurations", value: "garbage" } });
    expect((await getProgramConfig()).durations).toEqual({ FIRST: [3], SECOND: [1, 2] });
    expect((await listSubtypes()).map((s) => s.code)).toEqual(["PROFESSIONAL", "SCIENTIFIC"]);
  });

  it("refuses duplicate codes (also racing) and bad departments", async () => {
    await create();
    expect(await create()).toMatchObject({
      ok: false,
      error: { fieldErrors: { code: ["codeTaken"] } },
    });
    const [a, b] = await Promise.all([create({ code: "RACE" }), create({ code: "RACE" })]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    expect(await create({ code: "X1", departmentId: "nope" })).toMatchObject({
      ok: false,
      error: { fieldErrors: { departmentId: ["departmentNotFound"] } },
    });
    await run((ctx) => units.deactivateDepartment(ctx, departmentId), "x");
    expect(await create({ code: "X2" })).toMatchObject({
      ok: false,
      error: { fieldErrors: { departmentId: ["departmentInactive"] } },
    });
  });
});

describe("updateProgram (AC-5, AC-6)", () => {
  it("updates fields with an audit diff; the department stays", async () => {
    const id = idOf(await create());
    await run((ctx) =>
      programs.updateProgram(ctx, id, {
        ...base,
        name: "Ekonomia",
        totalCredits: 240,
        code: "BSC-ECON",
      }),
    );
    expect(await db.studyProgram.findUniqueOrThrow({ where: { id } })).toMatchObject({
      departmentId,
      name: "Ekonomia",
      totalCredits: 240,
      code: "BSC-ECON",
    });
    expect(
      await db.auditLog.findFirstOrThrow({ where: { action: "org.program.update" } }),
    ).toMatchObject({
      before: { name: "Ekonomi", totalCredits: 180 },
      after: { name: "Ekonomia", totalCredits: 240 },
    });
  });

  it("keeps a removed subtype valid on edit", async () => {
    const id = idOf(
      await create({ code: "M", cycle: "SECOND", durationYears: 2, subtype: "PROFESSIONAL" }),
    );
    await db.systemSetting.create({
      data: { key: "org.programSubtypes", value: [{ code: "RESEARCH", nameSq: "R", nameEn: "R" }] },
    });
    expect(
      await run((ctx) =>
        programs.updateProgram(ctx, id, {
          cycle: "SECOND",
          subtype: "PROFESSIONAL",
          code: "M",
          name: "Renamed",
          nameEn: null,
          durationYears: 2,
          totalCredits: 120,
        }),
      ),
    ).toMatchObject({ ok: true });
  });

  it("blocks cycle/duration changes and deactivation while dependents report active records", async () => {
    const id = idOf(await create({ code: "M", cycle: "SECOND", durationYears: 2 }));
    registerProgramDependent({
      id: "cohorts",
      labelKey: "org.dependents.cohorts",
      countActive: async () => 2,
    });
    const change = {
      cycle: "SECOND" as const,
      subtype: null,
      code: "M",
      name: "Ekonomi",
      nameEn: null,
      durationYears: 1,
      totalCredits: 120,
    };
    expect(await run((ctx) => programs.updateProgram(ctx, id, change))).toMatchObject({
      ok: false,
      error: { code: "CONFLICT", message: "HAS_DEPENDENTS:org.dependents.cohorts=2" },
    });
    expect(await run((ctx) => programs.deactivateProgram(ctx, id), "x")).toMatchObject({
      ok: false,
      error: { message: "HAS_DEPENDENTS:org.dependents.cohorts=2" },
    });
    // changing only the name is fine
    expect(
      await run((ctx) =>
        programs.updateProgram(ctx, id, { ...change, durationYears: 2, name: "Nje emer" }),
      ),
    ).toMatchObject({ ok: true });

    resetProgramDependents();
    registerProgramDependent({ id: "cohorts", labelKey: "x", countActive: async () => 0 });
    expect(await run((ctx) => programs.updateProgram(ctx, id, change))).toMatchObject({ ok: true });
    expect(await run((ctx) => programs.deactivateProgram(ctx, id), "closing")).toMatchObject({
      ok: true,
    });
  });

  it("reports unknown programs and code clashes with another program", async () => {
    expect(await run((ctx) => programs.updateProgram(ctx, "nope", base))).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
    await create({ code: "ONE" });
    const two = idOf(await create({ code: "TWO" }));
    expect(
      await run((ctx) => programs.updateProgram(ctx, two, { ...base, code: "ONE" })),
    ).toMatchObject({ ok: false, error: { fieldErrors: { code: ["codeTaken"] } } });
  });
});

describe("status (AC-7)", () => {
  it("deactivates and reactivates with reasons; not under an inactive department", async () => {
    const id = idOf(await create());
    expect(await run((ctx) => programs.deactivateProgram(ctx, id), "obsolete")).toMatchObject({
      ok: true,
    });
    expect(
      await db.auditLog.findFirstOrThrow({ where: { action: "org.program.deactivate" } }),
    ).toMatchObject({ reason: "obsolete" });
    expect(await run((ctx) => programs.deactivateProgram(ctx, id), "again")).toMatchObject({
      ok: false,
      error: { message: "ALREADY_INACTIVE" },
    });
    await run((ctx) => units.deactivateDepartment(ctx, departmentId), "x");
    expect(await run((ctx) => programs.reactivateProgram(ctx, id), "x")).toMatchObject({
      ok: false,
      error: { message: "DEPARTMENT_INACTIVE" },
    });
    await run((ctx) => units.reactivateDepartment(ctx, departmentId), "x");
    expect(await run((ctx) => programs.reactivateProgram(ctx, id), "back")).toMatchObject({
      ok: true,
    });
    expect(await run((ctx) => programs.reactivateProgram(ctx, id), "again")).toMatchObject({
      ok: false,
      error: { message: "ALREADY_ACTIVE" },
    });
  });
});

describe("PROGRAM scope (AC-8, AC-9)", () => {
  it("resolver: exists only for active programs, options and ancestors", async () => {
    const id = idOf(await create());
    const resolver = getScopeResolver("PROGRAM")!;
    expect(await resolver.exists(id)).toBe(true);
    expect(await resolver.exists("nope")).toBe(false);
    expect(await resolver.options!()).toEqual([{ id, label: "FE / ECO / BSC-ECO — Ekonomi" }]);
    expect(await resolver.ancestors(id)).toEqual({ departmentId, facultyId });
    expect(await resolver.ancestors("nope")).toEqual({});
    await run((ctx) => programs.deactivateProgram(ctx, id), "x");
    expect(await resolver.exists(id)).toBe(false);
    expect(await resolver.options!()).toEqual([]);
  });

  it("assignRole accepts a program-scoped coordinator and the role editor offers the scope", async () => {
    const id = idOf(await create());
    const user = await db.user.create({ data: { email: "pc@t.test", name: "Pc" } });
    await withTransaction((tx) =>
      assignRole(tx, user.id, { role: "program_coordinator", scopeType: "PROGRAM", scopeId: id }),
    );
    await expect(
      withTransaction((tx) =>
        assignRole(tx, user.id, {
          role: "program_coordinator",
          scopeType: "PROGRAM",
          scopeId: "nope",
        }),
      ),
    ).rejects.toMatchObject({ code: "SCOPE_NOT_FOUND" });
    const options = await getRoleEditorOptions();
    expect(options.allowedScopes.program_coordinator).toEqual(["PROGRAM"]);
    expect(options.scopeChoices.PROGRAM).toEqual([{ id, label: "FE / ECO / BSC-ECO — Ekonomi" }]);
    expect((await getProgramCoordinators(id)).map((u) => u.name)).toEqual(["Pc"]);
    expect((await getProgram(id))?.coordinators).toHaveLength(1);
  });

  it("a faculty- or department-scoped role contains the program through its ancestors", async () => {
    const id = idOf(await create());
    const scope = await expandTargetScope({ programId: id });
    expect(scope).toEqual({ programId: id, departmentId, facultyId });
    const actorRef = { id: "u", active: true };
    const assignment = (scopeType: "FACULTY" | "DEPARTMENT" | "PROGRAM", scopeId: string) => ({
      role: "secretary" as const,
      scopeType,
      scopeId,
      validFrom: new Date(0),
      validTo: null,
    });
    for (const [type, scopeId] of [
      ["FACULTY", facultyId],
      ["DEPARTMENT", departmentId],
      ["PROGRAM", id],
    ] as const) {
      expect(
        canOf(actorRef, [assignment(type, scopeId)], "org.program.read", new Date(), scope),
      ).toBe(true);
      expect(
        canOf(actorRef, [assignment(type, "other-unit")], "org.program.read", new Date(), scope),
      ).toBe(false);
    }
  });
});
