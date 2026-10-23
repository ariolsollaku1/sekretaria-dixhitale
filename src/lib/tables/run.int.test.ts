import ExcelJS from "exceljs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { ForbiddenError } from "@/lib/authz/check";
import { defineTable, type TableDef } from "./define";
import { EXPORT_MAX_ROWS } from "./types";
import { ExportTooLargeError, runExport, runTable } from "./run";

type Person = {
  id: string;
  name: string;
  faculty: "A" | "B";
  status: "active" | "inactive";
  joined: string;
  fee: number;
};

const PEOPLE: Person[] = Array.from({ length: 30 }, (_, i) => ({
  id: `p${i}`,
  name: `Person ${String(i).padStart(2, "0")}`,
  faculty: i % 3 === 0 ? "B" : "A",
  status: i % 2 === 0 ? "active" : "inactive",
  joined: `2026-01-${String((i % 28) + 1).padStart(2, "0")}`,
  fee: i * 10.5,
}));

const fetchSpy = vi.fn();

/** Scope rule of the fake: user "scoped-a" only sees faculty A (like a faculty-scoped secretary). */
function makeTable(): TableDef<Person> {
  return defineTable<Person>({
    id: "test.people",
    permission: "test.people.read",
    exportName: "people",
    rowKey: (r) => r.id,
    columns: [
      { key: "name", labelKey: "test.name", type: "text", sortable: true, alwaysVisible: true },
      { key: "faculty", labelKey: "test.faculty", type: "text" },
      { key: "joined", labelKey: "test.joined", type: "date", sortable: true },
      { key: "fee", labelKey: "test.fee", type: "money", sortable: true, defaultVisible: false },
    ],
    filters: [
      { key: "q", labelKey: "test.q", type: "text" },
      {
        key: "status",
        labelKey: "test.status",
        type: "select",
        options: [
          { value: "active", labelKey: "a" },
          { value: "inactive", labelKey: "i" },
        ],
      },
    ],
    defaultSort: { key: "name", dir: "asc" },
    values: {
      name: (r) => r.name,
      faculty: (r) => r.faculty,
      joined: (r) => r.joined,
      fee: (r) => r.fee,
    },
    async fetch(params, { user }) {
      fetchSpy(params, user);
      let rows = PEOPLE.filter((p) => (user.id === "scoped-a" ? p.faculty === "A" : true));
      if (params.filters.q)
        rows = rows.filter((p) => p.name.toLowerCase().includes(params.filters.q!.toLowerCase()));
      if (params.filters.status) rows = rows.filter((p) => p.status === params.filters.status);
      const { key, dir } = params.sort;
      rows = [...rows].sort(
        (a, b) =>
          (a[key as keyof Person] > b[key as keyof Person] ? 1 : -1) * (dir === "asc" ? 1 : -1),
      );
      const start = (params.page - 1) * params.pageSize;
      return { rows: rows.slice(start, start + params.pageSize), total: rows.length };
    },
  });
}

const allow = async () => true;
const deny = async () => false;
const translate = (key: string) => key.toUpperCase();
let table: TableDef<Person>;

beforeEach(async () => {
  fetchSpy.mockClear();
  table = makeTable();
  await db.$executeRawUnsafe('TRUNCATE TABLE "audit_logs"');
});

describe("runTable (AC-1, AC-2, AC-3, AC-8)", () => {
  it("fetches the first page with validated parameters only", async () => {
    const result = await runTable(
      table,
      { sort: "evil:asc", size: "10", status: "hacked", q: "person 1" },
      { id: "u" },
      allow,
    );
    expect(fetchSpy.mock.calls[0]![0]).toMatchObject({
      page: 1,
      pageSize: 10,
      sort: { key: "name", dir: "asc" },
      filters: { q: "person 1" },
    });
    expect(result.total).toBe(10); // "person 1" matches Person 10..19
    expect(result.rows).toHaveLength(10);
    expect(result.pageCount).toBe(1);
  });

  it("clamps a page beyond the last one to the last page", async () => {
    const result = await runTable(table, { page: "99", size: "10" }, { id: "u" }, allow);
    expect(result.params.page).toBe(3);
    expect(result.rows.map((r) => r.id)).toEqual(PEOPLE.slice(20).map((r) => r.id));
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("sorts descending and filters by select", async () => {
    const result = await runTable(
      table,
      { sort: "name:desc", status: "active" },
      { id: "u" },
      allow,
    );
    expect(result.rows[0]!.name).toBe("Person 28");
    expect(result.rows.every((r) => r.status === "active")).toBe(true);
  });

  it("denies without the table permission and never calls fetch", async () => {
    await expect(runTable(table, {}, { id: "u" }, deny)).rejects.toBeInstanceOf(ForbiddenError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("runExport (AC-7..AC-10)", () => {
  it("exports exactly what the list shows to this user: filters, sort, scope, chosen columns, translated headers", async () => {
    const out = await runExport(
      table,
      { status: "active", sort: "name:desc", cols: "faculty,fee" },
      { id: "scoped-a" },
      "xlsx",
      translate,
      { can: allow, now: new Date("2026-03-05T22:30:00Z") },
    );
    expect(out.fileName).toBe("people-2026-03-05.xlsx"); // 23:30 in Tirane is still the 5th... 22:30Z = 23:30 local
    expect(out.contentType).toContain("spreadsheetml");

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(
      out.bytes.buffer.slice(
        out.bytes.byteOffset,
        out.bytes.byteOffset + out.bytes.byteLength,
      ) as ArrayBuffer,
    );
    const ws = wb.worksheets[0]!;
    expect(ws.getRow(1).values).toEqual([undefined, "TEST.NAME", "TEST.FACULTY", "TEST.FEE"]);
    const expected = PEOPLE.filter((p) => p.faculty === "A" && p.status === "active").sort(
      (a, b) => (a.name < b.name ? 1 : -1),
    );
    expect(ws.rowCount).toBe(expected.length + 1);
    expect(ws.getRow(2).getCell(1).value).toBe(expected[0]!.name);
    expect(ws.getRow(2).getCell(2).value).toBe("A");
    // an unscoped user gets more rows for the same URL
    const all = await runExport(table, { status: "active" }, { id: "boss" }, "csv", translate, {
      can: allow,
    });
    expect(new TextDecoder().decode(all.bytes).trim().split("\r\n").length - 1).toBeGreaterThan(
      expected.length,
    );
  });

  it("asks fetch for one big unpaged result", async () => {
    await runExport(table, { page: "3", size: "10" }, { id: "u" }, "csv", translate, {
      can: allow,
    });
    expect(fetchSpy.mock.calls[0]![0]).toMatchObject({ page: 1, pageSize: EXPORT_MAX_ROWS + 1 });
  });

  it("refuses without permission before running any query", async () => {
    await expect(
      runExport(table, {}, { id: "u" }, "csv", translate, { can: deny }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(await db.auditLog.count()).toBe(0);
  });

  it("refuses results above the row cap", async () => {
    const big = { ...table, fetch: async () => ({ rows: [], total: EXPORT_MAX_ROWS + 1 }) };
    await expect(
      runExport(big, {}, { id: "u" }, "xlsx", translate, { can: allow }),
    ).rejects.toBeInstanceOf(ExportTooLargeError);
    expect(await db.auditLog.count()).toBe(0);
  });

  it("writes one audit row per export, with filters and counts but no row data", async () => {
    await runExport(
      table,
      { q: "person 0", status: "active" },
      { id: "exporter" },
      "csv",
      translate,
      { can: allow },
    );
    const rows = await db.auditLog.findMany({ where: { action: "plt.export.run" } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actorUserId: "exporter",
      entityType: "Table",
      entityId: "test.people",
    });
    expect(rows[0]!.after).toMatchObject({
      format: "csv",
      rows: 5,
      filters: { q: "person 0", status: "active" },
      sort: "name:asc",
    });
    expect(JSON.stringify(rows[0]!.after)).not.toContain("Person 0");
  });

  it("exports an empty result as headers only", async () => {
    const out = await runExport(table, { q: "no such person" }, { id: "u" }, "csv", translate, {
      can: allow,
    });
    expect(new TextDecoder().decode(out.bytes).trim().split("\r\n")).toHaveLength(1);
    expect(out.rows).toBe(0);
  });
});

describe("defineTable", () => {
  it("rejects a column without a value accessor", () => {
    expect(() => defineTable({ ...table, values: { name: (r: Person) => r.name } })).toThrow(
      /no value accessor/,
    );
  });
});
