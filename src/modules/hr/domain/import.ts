// Pure import logic for the staff register (HR-01 AC-12): map, normalize and validate rows.
// File decoding and parsing are shared (src/lib/import).
import { mapRows, type FileError, type RawRow } from "@/lib/import/table";
import { staffSchema, type StaffInput } from "./schemas";

export const TEMPLATE_COLUMNS = [
  "first_name",
  "last_name",
  "father_name",
  "gender",
  "birth_date",
  "national_id",
  "email",
  "phone",
  "address",
  "kind",
  "category",
  "degree",
  "title",
  "department",
  "primary_employer",
  "contract_start",
  "contract_end",
] as const;
type Column = (typeof TEMPLATE_COLUMNS)[number];
const REQUIRED: Column[] = [
  "first_name",
  "last_name",
  "gender",
  "birth_date",
  "kind",
  "category",
  "contract_start",
];

export const TEMPLATE_CSV = `﻿${TEMPLATE_COLUMNS.join(",")}\r\n`;

export type RawStaffRow = RawRow<Column>;

export function rowsFromTable(
  table: string[][],
): { ok: true; records: RawStaffRow[] } | { ok: false; error: FileError; missing?: string[] } {
  return mapRows(table, TEMPLATE_COLUMNS, REQUIRED);
}

const WORDS: Record<string, Record<string, string>> = {
  gender: {
    f: "FEMALE",
    female: "FEMALE",
    femër: "FEMALE",
    m: "MALE",
    male: "MALE",
    mashkull: "MALE",
  },
  kind: {
    academic: "ACADEMIC",
    akademik: "ACADEMIC",
    administrative: "ADMINISTRATIVE",
    administrativ: "ADMINISTRATIVE",
  },
  category: { pae: "PAE", pak: "PAK", volunteer: "VOLUNTEER", vullnetar: "VOLUNTEER" },
};
const word = (field: keyof typeof WORDS, value: string | undefined) =>
  WORDS[field]![(value ?? "").trim().toLowerCase()] ?? (value ?? "").trim().toUpperCase();

/** `YYYY-MM-DD`, `DD.MM.YYYY` or `DD/MM/YYYY`; anything else is returned unchanged (and fails validation). */
export function normalizeDay(value: string | undefined): string {
  const v = (value ?? "").trim();
  const m = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(v);
  return m ? `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}` : v;
}

export type ImportContext = {
  /** active department code -> id */
  departments: ReadonlyMap<string, string>;
};

export type ValidStaff = { row: number; input: StaffInput };
export type RowError = { row: number; field: string; code: string };

const FIELD_OF: Record<string, Column> = {
  firstName: "first_name",
  lastName: "last_name",
  fatherName: "father_name",
  birthDate: "birth_date",
  nationalId: "national_id",
  primaryEmployer: "primary_employer",
  contractStart: "contract_start",
  contractEnd: "contract_end",
  departmentId: "department",
};

export function validateStaffRows(
  records: readonly RawStaffRow[],
  ctx: ImportContext,
): { valid: ValidStaff[]; errors: RowError[] } {
  const valid: ValidStaff[] = [];
  const errors: RowError[] = [];
  const seenIds = new Map<string, number>();
  const seenEmails = new Map<string, number>();

  for (const r of records) {
    const before = errors.length;
    const err = (field: string, code: string) => errors.push({ row: r.row, field, code });

    const departmentCode = (r.department ?? "").trim().toUpperCase();
    const departmentId = departmentCode ? ctx.departments.get(departmentCode) : undefined;
    if (departmentCode && !departmentId) err("department", "unknownDepartment");

    const parsed = staffSchema.safeParse({
      firstName: r.first_name,
      lastName: r.last_name,
      fatherName: r.father_name,
      gender: word("gender", r.gender),
      birthDate: normalizeDay(r.birth_date),
      nationalId: r.national_id,
      email: r.email,
      phone: r.phone,
      address: r.address,
      kind: word("kind", r.kind),
      category: word("category", r.category),
      degree: r.degree,
      title: r.title,
      departmentId: departmentId ?? null,
      retired: false,
      primaryEmployer: r.primary_employer,
      contractStart: normalizeDay(r.contract_start),
      contractEnd: normalizeDay(r.contract_end),
    });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "row");
        err(FIELD_OF[key] ?? key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`), issue.message);
      }
    } else {
      const { nationalId, email } = parsed.data;
      if (nationalId) {
        if (seenIds.has(nationalId)) err("national_id", "duplicateInFile");
        else seenIds.set(nationalId, r.row);
      }
      if (email) {
        if (seenEmails.has(email)) err("email", "duplicateInFile");
        else seenEmails.set(email, r.row);
      }
      if (errors.length === before) valid.push({ row: r.row, input: parsed.data });
    }
  }
  return { valid, errors };
}
