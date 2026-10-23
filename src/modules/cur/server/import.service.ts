import "server-only";
import { DomainError, type ActionContext } from "@/lib/actions";
import { db } from "@/lib/db";
import { tableFromFile, type ImportFile } from "@/lib/import/read";
import {
  rowsFromTable,
  validateImportRows,
  type FileError,
  type RowError,
  type ValidCourse,
} from "../domain/import";
import { writableDepartments } from "./course.queries";
import * as courses from "./course.service";

export type { ImportFile };
export { tableFromFile };

export type PreviewRow = ValidCourse & { status: "new" | "exists" };
export type ImportPreview =
  | { ok: false; error: FileError; missing?: string[] }
  | {
      ok: true;
      rows: PreviewRow[];
      errors: RowError[];
      counts: { total: number; valid: number; invalid: number; created: number; existing: number };
    };

/** AC-9: parse and validate everything, save nothing. */
export async function previewImport(
  user: { id: string },
  file: ImportFile,
): Promise<ImportPreview> {
  const table = await tableFromFile(file);
  if (!table.ok) return table;
  const mapped = rowsFromTable(table.table);
  if (!mapped.ok) return mapped;

  const [categories, departments, writable] = await Promise.all([
    db.courseCategory.findMany({ where: { active: true }, select: { code: true, id: true } }),
    db.department.findMany({
      where: { active: true, faculty: { active: true } },
      select: { code: true, id: true },
    }),
    writableDepartments(user),
  ]);
  const { valid, errors } = validateImportRows(mapped.records, {
    categories: new Map(categories.map((c) => [c.code, c.id])),
    departments: new Map(departments.map((d) => [d.code, d.id])),
    writable: new Set(writable.map((d) => d.id)),
  });

  const existing = new Set(
    (
      await db.course.findMany({
        where: { code: { in: valid.map((v) => v.code) } },
        select: { code: true },
      })
    ).map((c) => c.code),
  );
  const rows: PreviewRow[] = valid.map((v) => ({
    ...v,
    status: existing.has(v.code) ? "exists" : "new",
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
 * AC-10: re-validates on the server (nothing from the preview is trusted), then creates, and
 * optionally updates, all rows in the caller's transaction with one audit entry per course.
 * Any invalid row aborts the whole import.
 */
export async function commitImport(ctx: ActionContext, file: ImportFile, updateExisting: boolean) {
  const preview = await previewImport(ctx.user, file);
  if (!preview.ok) throw new DomainError("VALIDATION", preview.error, { file: [preview.error] });
  if (preview.errors.length > 0)
    throw new DomainError("VALIDATION", "IMPORT_HAS_ERRORS", { file: ["importHasErrors"] });

  let created = 0;
  let updated = 0;
  let skipped = 0;
  for (const row of preview.rows) {
    const { row: _row, status: _status, ...input } = row;
    void _row;
    void _status;
    const data = { ...input, nameEn: input.nameEn };
    const existing = await ctx.db.course.findUnique({
      where: { code: row.code },
      select: { id: true },
    });
    if (!existing) {
      await courses.createCourse(ctx, data);
      created++;
    } else if (updateExisting) {
      await courses.updateCourse(ctx, existing.id, data);
      updated++;
    } else skipped++;
  }
  await ctx.audit({
    action: "cur.course.import",
    entityType: "Course",
    after: { file: file.name.slice(0, 100), created, updated, skipped },
  });
  return { created, updated, skipped };
}
