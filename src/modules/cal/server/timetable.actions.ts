"use server";

import "../permissions";
import { action, DomainError } from "@/lib/actions";
import { z } from "zod";
import { getSelectedAcademicYear } from "@/lib/academic-year/context";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import * as imports from "./timetable-import.service";
import { removeSlotSchema, slotSchema, updateSlotSchema } from "../domain/timetable-schemas";
import * as timetable from "./timetable.service";

export const createEntryAction = action({
  permission: "cal.timetable.write",
  input: slotSchema,
  handler: (input, ctx) => timetable.createEntry(ctx, input),
});
export const updateEntryAction = action({
  permission: "cal.timetable.write",
  input: updateSlotSchema,
  handler: ({ entryId, ...input }, ctx) => timetable.updateEntry(ctx, entryId, input),
});
export const removeEntryAction = action({
  permission: "cal.timetable.write",
  input: removeSlotSchema,
  handler: ({ entryId }, ctx) => timetable.removeEntry(ctx, entryId),
});

// ---- import (AC-6) -----------------------------------------------------------------------------

async function fileFrom(form: FormData) {
  const file = form.get("file");
  return file instanceof File
    ? { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) }
    : null;
}

export async function previewTimetableImportAction(form: FormData) {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, error: "UNAUTHENTICATED" as const };
  if (!(await can(user, "cal.timetable.write")))
    return { ok: false as const, error: "FORBIDDEN" as const };
  const file = await fileFrom(form);
  const yearId = await getSelectedAcademicYear();
  if (!file || !yearId) return { ok: false as const, error: "empty" as const };
  const { resolved: _resolved, ...preview } = await imports.previewImport(file, yearId);
  void _resolved;
  return preview;
}

export const commitTimetableImportAction = action({
  permission: "cal.timetable.write",
  input: z.instanceof(FormData),
  handler: async (form, ctx) => {
    const file = await fileFrom(form);
    const yearId = await getSelectedAcademicYear();
    if (!file || !yearId) throw new DomainError("VALIDATION", "empty", { file: ["empty"] });
    return imports.commitImport(ctx, file, yearId);
  },
});
