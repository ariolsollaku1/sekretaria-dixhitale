import { describe, expect, it } from "vitest";
import { TEMPLATE_COLUMNS, normalizeDay, rowsFromTable, validateStaffRows } from "./import";
import { staffSchema } from "./schemas";

const base = {
  firstName: "Arben",
  lastName: "Hoxha",
  gender: "MALE",
  birthDate: "1980-05-12",
  kind: "ACADEMIC",
  category: "PAE",
  contractStart: "2020-09-01",
};

describe("staffSchema (AC-1, AC-2, AC-4)", () => {
  it("accepts a minimal record and normalizes optional fields", () => {
    const r = staffSchema.parse({
      ...base,
      email: " Arben@Logos.Test ",
      nationalId: " j12345678k ",
    });
    expect(r).toMatchObject({
      email: "arben@logos.test",
      nationalId: "J12345678K",
      fatherName: null,
      departmentId: null,
      retired: false,
      contractEnd: null,
    });
  });
  it("keeps the primary employer only for external (PAK) staff", () => {
    expect(staffSchema.parse({ ...base, primaryEmployer: "Ministria" }).primaryEmployer).toBeNull();
    expect(
      staffSchema.parse({ ...base, category: "PAK", primaryEmployer: "Ministria" }).primaryEmployer,
    ).toBe("Ministria");
  });
  it.each([
    [{ firstName: " " }, "firstName"],
    [{ lastName: "x".repeat(101) }, "lastName"],
    [{ gender: "OTHER" }, "gender"],
    [{ birthDate: "2999-01-01" }, "birthDate"],
    [{ birthDate: "1899-12-31" }, "birthDate"],
    [{ birthDate: "1980-02-30" }, "birthDate"],
    [{ email: "not-an-email" }, "email"],
    [{ category: "FULL" }, "category"],
    [{ contractEnd: "2020-08-31" }, "contractEnd"],
    [{ contractStart: "" }, "contractStart"],
    [{ degree: "x".repeat(101) }, "degree"],
  ])("refuses %j", (patch, field) => {
    const r = staffSchema.safeParse({ ...base, ...patch });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.some((i) => i.path[0] === field)).toBe(true);
  });
  it("allows the contract to end on its first day", () => {
    expect(staffSchema.safeParse({ ...base, contractEnd: "2020-09-01" }).success).toBe(true);
  });
});

describe("import mapping and validation (AC-12)", () => {
  const header = [...TEMPLATE_COLUMNS] as string[];
  const row = (over: Record<string, string>) => header.map((c) => over[c] ?? "");
  const ok = {
    first_name: "Arta",
    last_name: "Gjoni",
    gender: "F",
    birth_date: "12.05.1985",
    kind: "akademik",
    category: "pae",
    contract_start: "01/09/2020",
  };
  const ctx = { departments: new Map([["D1", "dep-1"]]) };

  it("normalizes words and dates", () => {
    expect(normalizeDay("01/09/2020")).toBe("2020-09-01");
    expect(normalizeDay("1.9.2020")).toBe("2020-09-01");
    expect(normalizeDay("2020-09-01")).toBe("2020-09-01");
    const mapped = rowsFromTable([header, row(ok)]);
    if (!mapped.ok) throw new Error("mapping failed");
    const { valid, errors } = validateStaffRows(mapped.records, ctx);
    expect(errors).toEqual([]);
    expect(valid[0]!.input).toMatchObject({
      gender: "FEMALE",
      kind: "ACADEMIC",
      category: "PAE",
      birthDate: "1985-05-12",
      contractStart: "2020-09-01",
    });
  });

  it("reports missing columns, empty files and too many rows", () => {
    expect(rowsFromTable([])).toMatchObject({ ok: false, error: "empty" });
    expect(rowsFromTable([["first_name"]])).toMatchObject({ ok: false, error: "missingColumns" });
    expect(rowsFromTable([header])).toMatchObject({ ok: false, error: "empty" });
    expect(rowsFromTable([header, ...Array.from({ length: 2001 }, () => row(ok))])).toMatchObject({
      ok: false,
      error: "tooManyRows",
    });
  });

  it("reports row and field errors with spreadsheet row numbers", () => {
    const mapped = rowsFromTable([
      header,
      row(ok),
      row({ ...ok, first_name: "", department: "ZZ", birth_date: "99.99.1985" }),
      row({ ...ok, national_id: "A1", email: "a@b.test" }),
      row({ ...ok, national_id: "a1", email: "a@b.test" }),
    ]);
    if (!mapped.ok) throw new Error("mapping failed");
    const { valid, errors } = validateStaffRows(mapped.records, ctx);
    expect(valid.map((v) => v.row)).toEqual([2, 4]);
    expect(errors).toEqual(
      expect.arrayContaining([
        { row: 3, field: "first_name", code: "required" },
        { row: 3, field: "department", code: "unknownDepartment" },
        { row: 3, field: "birth_date", code: "invalidDate" },
        { row: 5, field: "national_id", code: "duplicateInFile" },
        { row: 5, field: "email", code: "duplicateInFile" },
      ]),
    );
  });
});
