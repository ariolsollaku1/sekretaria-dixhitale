import "server-only";
import { DomainError, type ActionContext } from "@/lib/actions";
import { db } from "@/lib/db";
import { tableFromFile, type ImportFile } from "@/lib/import/read";
import type { FileError } from "@/lib/import/table";
import { findAssignments } from "@/modules/cur";
import {
  parseRows,
  rowsFromTable,
  type ParsedSlotRow,
  type RowError,
} from "../domain/timetable-import";
import { findClashes, type Slot } from "../domain/timetable-rules";
import { describeClashes } from "./timetable.service";
import { buildSlot, createEntry } from "./timetable.service";
import { candidatesFor } from "./timetable.queries";

export type ImportPreview =
  | { ok: false; error: FileError; missing?: string[] }
  | {
      ok: true;
      rows: { row: number; assignmentId: string; summary: string }[];
      errors: RowError[];
      counts: { total: number; valid: number; invalid: number };
    };

type Resolved = { row: ParsedSlotRow; assignmentId: string };

/**
 * AC-6: parse, resolve every row to a teaching assignment of the year, validate, and check clashes
 * against the existing timetable and the earlier rows of the file. Saves nothing.
 */
export async function previewImport(
  file: ImportFile,
  yearId: string,
  client: typeof db = db,
): Promise<ImportPreview & { resolved?: Resolved[] }> {
  const table = await tableFromFile(file);
  if (!table.ok) return table;
  const mapped = rowsFromTable(table.table);
  if (!mapped.ok) return mapped;
  const { rows, errors } = parseRows(mapped.records);

  const resolved: Resolved[] = [];
  const earlier: Slot[] = [];
  for (const r of rows) {
    const err = (field: string, code: string) => errors.push({ row: r.row, field, code });
    const matches = await findAssignments(
      {
        academicYearId: yearId,
        programCode: r.program,
        cohortName: r.cohort,
        groupName: r.group,
        courseCode: r.course,
        kind: r.kind,
      },
      client,
    );
    const picked = r.lecturerEmail
      ? matches.filter((m) => m.lecturerEmail === r.lecturerEmail)
      : matches;
    if (matches.length === 0) {
      err("course", "assignmentNotFound");
      continue;
    }
    if (picked.length === 0) {
      err("lecturer_email", "lecturerNotFound");
      continue;
    }
    if (picked.length > 1) {
      err("lecturer_email", "ambiguousLecturer");
      continue;
    }
    const a = picked[0]!;
    if (a.yearStatus === "CLOSED") {
      err("course", "YEAR_CLOSED");
      continue;
    }
    const { candidate, errors: slotErrors } = await buildSlot(client, a, {
      weekday: r.weekday,
      startMinute: r.startMinute,
      endMinute: r.endMinute,
      room: r.room,
      validFrom: r.validFrom,
      validTo: r.validTo,
      note: null,
    });
    const bad = Object.entries(slotErrors).filter(([, v]) => v);
    if (bad.length > 0) {
      for (const [k, v] of bad) err(k, v!);
      continue;
    }
    const clashes = findClashes(candidate, [
      ...(await candidatesFor(client, candidate)),
      ...earlier,
    ]);
    if (clashes.length > 0) {
      err("start", `CLASH:${describeClashes(clashes)}`);
      continue;
    }
    earlier.push(candidate);
    resolved.push({ row: r, assignmentId: a.id });
  }
  errors.sort((x, y) => x.row - y.row);
  return {
    ok: true,
    rows: resolved.map((x) => ({
      row: x.row.row,
      assignmentId: x.assignmentId,
      summary: `${x.row.course.toUpperCase()} · ${x.row.program} · ${x.row.group}`,
    })),
    errors,
    counts: {
      total: mapped.records.length,
      valid: resolved.length,
      invalid: new Set(errors.map((e) => e.row)).size,
    },
    resolved,
  };
}

/** AC-6: re-validates (nothing from the preview is trusted) and creates every row in the caller's transaction, or none. */
export async function commitImport(ctx: ActionContext, file: ImportFile, yearId: string) {
  const preview = await previewImport(file, yearId, ctx.db as never);
  if (!preview.ok) throw new DomainError("VALIDATION", preview.error, { file: [preview.error] });
  if (preview.errors.length > 0)
    throw new DomainError("VALIDATION", "IMPORT_HAS_ERRORS", { file: ["importHasErrors"] });
  for (const { row, assignmentId } of preview.resolved ?? []) {
    await createEntry(ctx, {
      assignmentId,
      weekday: row.weekday,
      startMinute: row.startMinute,
      endMinute: row.endMinute,
      room: row.room,
      validFrom: row.validFrom,
      validTo: row.validTo,
      note: null,
    });
  }
  await ctx.audit({
    action: "cal.timetable.import",
    entityType: "TimetableEntry",
    after: { file: file.name.slice(0, 100), created: preview.resolved?.length ?? 0 },
  });
  return { created: preview.resolved?.length ?? 0 };
}
