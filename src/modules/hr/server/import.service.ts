import "server-only";
import { DomainError, type ActionContext } from "@/lib/actions";
import { db } from "@/lib/db";
import { tableFromFile, type ImportFile } from "@/lib/import/read";
import type { FileError } from "@/lib/import/table";
import { rowsFromTable, validateStaffRows, type RowError, type ValidStaff } from "../domain/import";
import * as staff from "./staff.service";

export type { ImportFile };
export type PreviewRow = ValidStaff & { status: "new" | "exists" };
export type ImportPreview =
  | { ok: false; error: FileError; missing?: string[] }
  | {
      ok: true;
      rows: PreviewRow[];
      errors: RowError[];
      counts: { total: number; valid: number; invalid: number; created: number; existing: number };
    };

/** Persons already using one of these national IDs / e-mails. */
async function existingKeys(rows: readonly ValidStaff[]) {
  const ids = rows.map((r) => r.input.nationalId).filter((v): v is string => !!v);
  const emails = rows.map((r) => r.input.email).filter((v): v is string => !!v);
  const found = await db.person.findMany({
    where: { OR: [{ nationalId: { in: ids } }, { email: { in: emails } }] },
    select: { nationalId: true, email: true },
  });
  return {
    ids: new Set(found.map((p) => p.nationalId).filter(Boolean)),
    emails: new Set(found.map((p) => p.email).filter(Boolean)),
  };
}

/** AC-12: parse and validate everything, save nothing. */
export async function previewImport(file: ImportFile): Promise<ImportPreview> {
  const table = await tableFromFile(file);
  if (!table.ok) return table;
  const mapped = rowsFromTable(table.table);
  if (!mapped.ok) return mapped;

  const departments = await db.department.findMany({
    where: { active: true, faculty: { active: true } },
    select: { code: true, id: true },
  });
  const { valid, errors } = validateStaffRows(mapped.records, {
    departments: new Map(departments.map((d) => [d.code, d.id])),
  });
  const known = await existingKeys(valid);
  const rows: PreviewRow[] = valid.map((v) => ({
    ...v,
    status:
      (v.input.nationalId && known.ids.has(v.input.nationalId)) ||
      (v.input.email && known.emails.has(v.input.email))
        ? "exists"
        : "new",
  }));
  const created = rows.filter((r) => r.status === "new").length;
  return {
    ok: true,
    rows,
    errors,
    counts: {
      total: mapped.records.length,
      valid: rows.length,
      invalid: new Set(errors.map((e) => e.row)).size,
      created,
      existing: rows.length - created,
    },
  };
}

/**
 * AC-12: re-validates on the server (nothing from the preview is trusted), then creates every new
 * member in the caller's transaction. Persons that already exist are skipped, never overwritten.
 * Any invalid row aborts the whole import. Only counts are audited (no personal data).
 */
export async function commitImport(ctx: ActionContext, file: ImportFile) {
  const preview = await previewImport(file);
  if (!preview.ok) throw new DomainError("VALIDATION", preview.error, { file: [preview.error] });
  if (preview.errors.length > 0)
    throw new DomainError("VALIDATION", "IMPORT_HAS_ERRORS", { file: ["importHasErrors"] });

  let created = 0;
  for (const row of preview.rows) {
    if (row.status === "exists") continue;
    await staff.createStaff(ctx, row.input);
    created++;
  }
  const skipped = preview.rows.length - created;
  await ctx.audit({
    action: "hr.staff.import",
    entityType: "Staff",
    after: { file: file.name.slice(0, 100), created, skipped },
  });
  return { created, skipped };
}
