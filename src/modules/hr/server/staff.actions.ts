"use server";

import "../permissions";
import { z } from "zod";
import { action, DomainError } from "@/lib/actions";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import { staffSchema, statusSchema, updateStaffSchema } from "../domain/schemas";
import * as imports from "./import.service";
import * as staff from "./staff.service";

export const createStaffAction = action({
  permission: "hr.staff.write",
  input: staffSchema,
  handler: (input, ctx) => staff.createStaff(ctx, input),
});

export const updateStaffAction = action({
  permission: "hr.staff.write",
  input: updateStaffSchema,
  handler: ({ staffId, ...input }, ctx) => staff.updateStaff(ctx, staffId, input),
});

/** AC-7: ends employment; needs a reason. */
export const deactivateStaffAction = action({
  permission: "hr.staff.write",
  input: statusSchema,
  requireReason: true,
  handler: ({ staffId }, ctx) => staff.setStaffActive(ctx, staffId, false),
});

export const reactivateStaffAction = action({
  permission: "hr.staff.write",
  input: statusSchema,
  requireReason: true,
  handler: ({ staffId }, ctx) => staff.setStaffActive(ctx, staffId, true),
});

// ---- import (AC-12) ---------------------------------------------------------------------------

async function fileFrom(form: FormData): Promise<imports.ImportFile | null> {
  const file = form.get("file");
  if (!(file instanceof File)) return null;
  return { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) };
}

/** Preview only: a read-style action, still gated by the staff write permission. */
export async function previewStaffImportAction(form: FormData) {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, error: "UNAUTHENTICATED" as const };
  if (!(await can(user, "hr.staff.write")))
    return { ok: false as const, error: "FORBIDDEN" as const };
  const file = await fileFrom(form);
  if (!file) return { ok: false as const, error: "empty" as const };
  return imports.previewImport(file);
}

export const commitStaffImportAction = action({
  permission: "hr.staff.write",
  input: z.instanceof(FormData),
  handler: async (form, ctx) => {
    const file = await fileFrom(form);
    if (!file) throw new DomainError("VALIDATION", "empty", { file: ["empty"] });
    return imports.commitImport(ctx, file);
  },
});
