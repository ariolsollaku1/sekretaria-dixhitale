import ExcelJS from "exceljs";
import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createAction, type ActionContext, type ActionResult } from "@/lib/actions";
import { db, withTransaction } from "@/lib/db";
import "@/modules/hr";
import { TEMPLATE_COLUMNS } from "../domain/import";
import { commitImport, previewImport } from "./import.service";

const actor = { id: "hr-1", email: "hr@t.test", name: "HR", locale: null, personId: null };
function run<R>(fn: (ctx: ActionContext) => Promise<R>): Promise<ActionResult<R>> {
  const action = createAction({
    getUser: async () => actor,
    can: async () => true,
    transaction: withTransaction,
    request: async () => ({ requestId: "r", ip: null, userAgent: null }),
  });
  return action({
    permission: "hr.staff.write",
    input: z.object({}).passthrough(),
    handler: (_i, ctx) => fn(ctx),
  })({} as never);
}

const header = TEMPLATE_COLUMNS.join(",");
const line = (o: Record<string, string>) => TEMPLATE_COLUMNS.map((c) => o[c] ?? "").join(",");
const good = (n: number, over: Record<string, string> = {}) =>
  line({
    first_name: `Ana${n}`,
    last_name: "Leka",
    gender: "F",
    birth_date: "1985-05-12",
    national_id: `ID${n}`,
    email: `ana${n}@logos.test`,
    kind: "academic",
    category: "PAE",
    department: "D1",
    contract_start: "2020-09-01",
    ...over,
  });
const csv = (...lines: string[]) => ({
  name: "staff.csv",
  bytes: new TextEncoder().encode([header, ...lines].join("\n")),
});

beforeEach(async () => {
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "audit_logs", "staff", "departments", "faculties" CASCADE',
  );
  await db.user.deleteMany();
  await db.person.deleteMany();
  const f = await db.faculty.create({ data: { code: "F1", name: "F1" } });
  await db.department.create({ data: { code: "D1", name: "D1", facultyId: f.id } });
});

describe("previewImport (AC-12)", () => {
  it("saves nothing and reports valid rows, errors and what already exists", async () => {
    await db.person.create({
      data: {
        firstName: "E",
        lastName: "E",
        gender: "MALE",
        birthDate: new Date("1990-01-01T00:00:00Z"),
        nationalId: "ID2",
      },
    });
    const preview = await previewImport(csv(good(1), good(2), good(3, { birth_date: "x" })));
    if (!preview.ok) throw new Error("preview failed");
    expect(preview.counts).toEqual({ total: 3, valid: 2, invalid: 1, created: 1, existing: 1 });
    expect(preview.errors).toEqual([{ row: 4, field: "birth_date", code: "invalidDate" }]);
    expect(await db.staff.count()).toBe(0);
  });

  it("reads an XLSX with Excel dates", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Staff");
    ws.addRow([...TEMPLATE_COLUMNS]);
    ws.addRow(
      TEMPLATE_COLUMNS.map(
        (c) =>
          ({
            first_name: "Besa",
            last_name: "Koci",
            gender: "F",
            birth_date: new Date("1985-05-12T00:00:00Z"),
            kind: "ADMINISTRATIVE",
            category: "PAK",
            contract_start: new Date("2021-02-01T00:00:00Z"),
          })[c as string] ?? "",
      ),
    );
    const bytes = new Uint8Array(await wb.xlsx.writeBuffer());
    const preview = await previewImport({ name: "staff.xlsx", bytes });
    if (!preview.ok) throw new Error(JSON.stringify(preview));
    expect(preview.rows[0]!.input).toMatchObject({
      birthDate: "1985-05-12",
      contractStart: "2021-02-01",
      category: "PAK",
    });
  });

  it("reports unusable files", async () => {
    expect(await previewImport({ name: "x.csv", bytes: new Uint8Array() })).toMatchObject({
      ok: false,
      error: "empty",
    });
    expect(await previewImport({ name: "x.pdf", bytes: new Uint8Array([1]) })).toMatchObject({
      ok: false,
      error: "unsupportedFile",
    });
    expect(
      await previewImport({ name: "x.csv", bytes: new Uint8Array([0xff, 0xfe, 0x41]) }),
    ).toMatchObject({ ok: false, error: "invalidEncoding" });
    expect(
      await previewImport({ name: "x.csv", bytes: new TextEncoder().encode("first_name\nA") }),
    ).toMatchObject({ ok: false, error: "missingColumns" });
  });
});

describe("commitImport (AC-12)", () => {
  it("creates new members, skips existing persons and audits only counts", async () => {
    await db.person.create({
      data: {
        firstName: "E",
        lastName: "E",
        gender: "MALE",
        birthDate: new Date("1990-01-01T00:00:00Z"),
        nationalId: "ID2",
      },
    });
    const r = await run((ctx) => commitImport(ctx, csv(good(1), good(2), good(3))));
    expect(r).toMatchObject({ ok: true, data: { created: 2, skipped: 1 } });
    expect(await db.staff.count()).toBe(2);
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: "hr.staff.import" } });
    expect(audit.after).toEqual({ file: "staff.csv", created: 2, skipped: 1 });
    expect(await db.auditLog.count({ where: { action: "hr.staff.create" } })).toBe(2);
  });

  it("aborts everything when one row is invalid", async () => {
    const r = await run((ctx) => commitImport(ctx, csv(good(1), good(2, { gender: "?" }))));
    expect(r).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    expect(await db.staff.count()).toBe(0);
    expect(await db.person.count()).toBe(0);
  });
});
