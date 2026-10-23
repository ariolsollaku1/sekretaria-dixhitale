import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createAction, type ActionContext, type ActionResult } from "@/lib/actions";
import { can } from "@/lib/authz/guard";
import { db, withTransaction } from "@/lib/db";
import { toXlsx } from "@/lib/tables/export";
import "@/modules/org";
import "@/modules/cur";
import { commitImport, previewImport, tableFromFile } from "./import.service";
import { MAX_IMPORT_ROWS, TEMPLATE_CSV } from "../domain/import";

type Actor = { id: string; email: string; name: string; locale: null; personId: null };
let admin: Actor, head1: Actor;
let d1: string, d2: string, cat: string;

const enc = (s: string) => new TextEncoder().encode(s);
const file = (name: string, text: string) => ({ name, bytes: enc(text) });
const HEADER =
  "code,name,name_en,credits,category,lecture_hours,seminar_hours,lab_hours,department";

function runAs<R>(user: Actor, fn: (ctx: ActionContext) => Promise<R>): Promise<ActionResult<R>> {
  const action = createAction({
    getUser: async () => user,
    can,
    transaction: withTransaction,
    request: async () => ({ requestId: "r", ip: null, userAgent: null }),
  });
  return action({
    permission: "cur.course.write",
    input: z.object({}).passthrough(),
    handler: (_i, ctx) => fn(ctx),
  })({} as never);
}

async function user(
  email: string,
  role: "sysadmin" | "head_of_department",
  scopeId?: string,
): Promise<Actor> {
  const u = await db.user.create({ data: { email, name: email } });
  await db.userRole.create({
    data: {
      userId: u.id,
      role,
      scopeType: scopeId ? "DEPARTMENT" : "INSTITUTION",
      scopeId: scopeId ?? null,
    },
  });
  return { id: u.id, email, name: email, locale: null, personId: null };
}

beforeEach(async () => {
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "audit_logs", "user_roles", "courses", "course_categories", "study_programs", "departments", "faculties" CASCADE',
  );
  await db.user.deleteMany();
  const f = await db.faculty.create({ data: { code: "FE", name: "F" } });
  d1 = (await db.department.create({ data: { code: "ECO", name: "Ekonomi", facultyId: f.id } })).id;
  d2 = (await db.department.create({ data: { code: "LAW", name: "Drejtesi", facultyId: f.id } }))
    .id;
  cat = (
    await db.courseCategory.create({
      data: { code: "COMPULSORY", nameSq: "E detyrueshme", nameEn: "Compulsory" },
    })
  ).id;
  admin = await user("admin@t.test", "sysadmin");
  head1 = await user("head@t.test", "head_of_department", d1);
});

const good = `${HEADER}\nEC101,Mikroekonomi,Microeconomics,6,compulsory,30,15,0,eco\nEC102,Makroekonomi,,6,,30,,,ECO\nLW101,Hyrje në drejtësi,,5,COMPULSORY,45,0,0,law\n`;

describe("previewImport (AC-9)", () => {
  it("validates everything and saves nothing", async () => {
    const p = await previewImport(admin, file("c.csv", good));
    expect(p).toMatchObject({
      ok: true,
      counts: { total: 3, valid: 3, invalid: 0, created: 3, existing: 0 },
    });
    if (p.ok)
      expect(p.rows.map((r) => [r.code, r.status, r.departmentId === d1 ? "ECO" : "LAW"])).toEqual([
        ["EC101", "new", "ECO"],
        ["EC102", "new", "ECO"],
        ["LW101", "new", "LAW"],
      ]);
    expect(await db.course.count()).toBe(0);
    expect(await db.auditLog.count()).toBe(0);
  });

  it("accepts semicolons, BOM and an XLSX file; rejects other files and encodings", async () => {
    const semi = `﻿${HEADER.replaceAll(",", ";")}\nEC1;Mikro;;6;;30;;;eco\n`;
    expect(await previewImport(admin, file("c.csv", semi))).toMatchObject({
      ok: true,
      counts: { valid: 1 },
    });

    const xlsx = toXlsx(
      ["code", "name", "credits", "department"].map((k) => ({
        key: k,
        label: k,
        type: k === "credits" ? ("number" as const) : ("text" as const),
      })),
      [{ code: "XL101", name: "Nga Excel", credits: 6, department: "ECO" }],
    );
    expect(await previewImport(admin, { name: "c.XLSX", bytes: xlsx })).toMatchObject({
      ok: true,
      counts: { valid: 1, created: 1 },
    });

    expect(await previewImport(admin, file("c.txt", good))).toEqual({
      ok: false,
      error: "unsupportedFile",
    });
    expect(
      await previewImport(admin, { name: "c.csv", bytes: new Uint8Array([0x61, 0xeb]) }),
    ).toEqual({ ok: false, error: "invalidEncoding" });
    expect(await previewImport(admin, { name: "c.xlsx", bytes: enc("not a zip") })).toEqual({
      ok: false,
      error: "unsupportedFile",
    });
    expect(await previewImport(admin, file("c.csv", ""))).toEqual({ ok: false, error: "empty" });
    expect(await previewImport(admin, file("c.csv", TEMPLATE_CSV))).toEqual({
      ok: false,
      error: "empty",
    });
    expect(await previewImport(admin, file("c.csv", "code,name\nx,y\n"))).toEqual({
      ok: false,
      error: "missingColumns",
      missing: ["credits", "department"],
    });
  });

  it("enforces size and row limits", async () => {
    expect(
      await previewImport(admin, { name: "c.csv", bytes: new Uint8Array(2 * 1024 * 1024 + 1) }),
    ).toEqual({ ok: false, error: "tooLarge" });
    const many = `${HEADER}\n${Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => `C${i + 10},n,,1,,,,,eco`).join("\n")}\n`;
    expect(await previewImport(admin, file("c.csv", many))).toEqual({
      ok: false,
      error: "tooManyRows",
    });
  });

  it("reports per-row errors, unknown codes, duplicates in the file and rows outside the user's departments", async () => {
    const text = `${HEADER}\nEC1,Ok,,6,,,,,eco\nEC1,Dup,,6,,,,,eco\nX,Bad code,,6,,,,,eco\nEC3,Cat,,6,NOPE,,,,eco\nLW1,Other dept,,6,,,,,law\n`;
    const p = await previewImport(head1, file("c.csv", text));
    expect(p).toMatchObject({ ok: true, counts: { total: 5, valid: 1, invalid: 4 } });
    if (p.ok)
      expect(p.errors).toEqual([
        { row: 3, field: "code", code: "duplicateInFile" },
        { row: 4, field: "code", code: "invalidCourseCode" },
        { row: 5, field: "category", code: "unknownCategory" },
        { row: 6, field: "department", code: "departmentNotPermitted" },
      ]);
  });

  it("marks courses that already exist", async () => {
    await runAs(admin, (c) => commitImport(c, file("c.csv", good), false));
    const p = await previewImport(admin, file("c.csv", good));
    expect(p).toMatchObject({ ok: true, counts: { created: 0, existing: 3 } });
  });
});

describe("commitImport (AC-10)", () => {
  it("creates all courses in one transaction with an audit entry each and a summary", async () => {
    const r = await runAs(admin, (c) => commitImport(c, file("c.csv", good), false));
    expect(r).toEqual({ ok: true, data: { created: 3, updated: 0, skipped: 0 } });
    expect(
      (await db.course.findMany({ orderBy: { code: "asc" } })).map((c) => [
        c.code,
        c.defaultCredits,
        c.hoursLecture,
        c.categoryId === cat,
      ]),
    ).toEqual([
      ["EC101", 6, 30, true],
      ["EC102", 6, 30, false],
      ["LW101", 5, 45, true],
    ]);
    expect(await db.auditLog.count({ where: { action: "cur.course.create" } })).toBe(3);
    expect(
      await db.auditLog.findFirstOrThrow({ where: { action: "cur.course.import" } }),
    ).toMatchObject({ after: { file: "c.csv", created: 3, updated: 0, skipped: 0 } });
  });

  it("saves nothing when any row is invalid", async () => {
    const r = await runAs(admin, (c) =>
      commitImport(c, file("c.csv", `${good}BAD!,x,,1,,,,,eco\n`), false),
    );
    expect(r).toMatchObject({
      ok: false,
      error: { code: "VALIDATION", fieldErrors: { file: ["importHasErrors"] } },
    });
    expect(await db.course.count()).toBe(0);
    expect(await db.auditLog.count()).toBe(0);
  });

  it("skips existing codes by default and updates them when asked", async () => {
    await runAs(admin, (c) => commitImport(c, file("c.csv", good), false));
    const changed = good
      .replace("Mikroekonomi", "Mikroekonomi II")
      .replace("EC102,Makroekonomi,,6", "EC102,Makroekonomi,,7")
      .replace("LW101", "LW102");
    expect(await runAs(admin, (c) => commitImport(c, file("c.csv", changed), false))).toEqual({
      ok: true,
      data: { created: 1, updated: 0, skipped: 2 },
    });
    expect((await db.course.findUniqueOrThrow({ where: { code: "EC101" } })).name).toBe(
      "Mikroekonomi",
    );
    expect(await runAs(admin, (c) => commitImport(c, file("c.csv", changed), true))).toEqual({
      ok: true,
      data: { created: 0, updated: 3, skipped: 0 },
    });
    expect((await db.course.findUniqueOrThrow({ where: { code: "EC101" } })).name).toBe(
      "Mikroekonomi II",
    );
    expect((await db.course.findUniqueOrThrow({ where: { code: "EC102" } })).defaultCredits).toBe(
      7,
    );
  });

  it("a head of department can import only their department's rows; a foreign row blocks the whole file", async () => {
    const mine = `${HEADER}\nEC1,Mine,,6,,,,,eco\n`;
    expect(await runAs(head1, (c) => commitImport(c, file("c.csv", mine), false))).toMatchObject({
      ok: true,
      data: { created: 1 },
    });
    expect(
      await runAs(head1, (c) =>
        commitImport(
          c,
          file("c.csv", `${mine.replace("EC1", "EC2")}LW9,Foreign,,6,,,,,law\n`),
          false,
        ),
      ),
    ).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    expect(await db.course.count()).toBe(1);
  });

  it("refuses an invalid file as a validation error", async () => {
    expect(await runAs(admin, (c) => commitImport(c, file("c.txt", good), false))).toMatchObject({
      ok: false,
      error: { fieldErrors: { file: ["unsupportedFile"] } },
    });
  });
});

describe("tableFromFile", () => {
  it("reads the first sheet as text, dates as ISO days, numbers as plain digits", async () => {
    const xlsx = toXlsx(
      [
        { key: "a", label: "A", type: "text" },
        { key: "n", label: "N", type: "number" },
        { key: "d", label: "D", type: "date" },
      ],
      [{ a: "x", n: 6, d: "2026-03-01" }],
    );
    expect(await tableFromFile({ name: "t.xlsx", bytes: xlsx })).toEqual({
      ok: true,
      table: [
        ["A", "N", "D"],
        ["x", "6", "2026-03-01"],
      ],
    });
  });
});
