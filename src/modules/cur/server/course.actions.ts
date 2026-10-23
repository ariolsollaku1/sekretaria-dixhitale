"use server";

import "../permissions";
import { z } from "zod";
import { action, DomainError } from "@/lib/actions";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import {
  categorySchema,
  courseSchema,
  idSchema,
  updateCategorySchema,
  updateCourseSchema,
} from "../domain/schemas";
import * as categories from "./category.service";
import * as courses from "./course.service";
import { commitImport, previewImport, type ImportFile } from "./import.service";

export const createCourseAction = action({
  permission: "cur.course.write",
  input: courseSchema,
  target: (i) => ({ kind: "department", id: i.departmentId }),
  handler: (input, ctx) => courses.createCourse(ctx, input),
});
export const updateCourseAction = action({
  permission: "cur.course.write",
  input: updateCourseSchema,
  target: (i) => ({ kind: "course", id: i.courseId }),
  handler: ({ courseId, ...input }, ctx) => courses.updateCourse(ctx, courseId, input),
});
export const deactivateCourseAction = action({
  permission: "cur.course.write",
  input: idSchema,
  target: (i) => ({ kind: "course", id: i.id }),
  requireReason: true,
  handler: (input, ctx) => courses.deactivateCourse(ctx, input.id),
});
export const reactivateCourseAction = action({
  permission: "cur.course.write",
  input: idSchema,
  target: (i) => ({ kind: "course", id: i.id }),
  requireReason: true,
  handler: (input, ctx) => courses.reactivateCourse(ctx, input.id),
});

export const createCategoryAction = action({
  permission: "cur.category.write",
  input: categorySchema,
  handler: (input, ctx) => categories.createCategory(ctx, input),
});
export const updateCategoryAction = action({
  permission: "cur.category.write",
  input: updateCategorySchema,
  handler: ({ categoryId, ...input }, ctx) => categories.updateCategory(ctx, categoryId, input),
});
export const deactivateCategoryAction = action({
  permission: "cur.category.write",
  input: idSchema,
  requireReason: true,
  handler: (input, ctx) => categories.setCategoryActive(ctx, input.id, false),
});
export const reactivateCategoryAction = action({
  permission: "cur.category.write",
  input: idSchema,
  requireReason: true,
  handler: (input, ctx) => categories.setCategoryActive(ctx, input.id, true),
});

// ---- import (CUR-01 AC-9, AC-10) ---------------------------------------------------------------

async function fileFrom(form: FormData): Promise<ImportFile | null> {
  const file = form.get("file");
  if (!(file instanceof File)) return null;
  return { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) };
}

/** Preview only: a read-style action, still gated by the course write permission. */
export async function previewCourseImportAction(form: FormData) {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, error: "UNAUTHENTICATED" };
  if (!(await can(user, "cur.course.write"))) return { ok: false as const, error: "FORBIDDEN" };
  const file = await fileFrom(form);
  if (!file) return { ok: false as const, error: "empty" };
  return previewImport(user, file);
}

export const commitCourseImportAction = action({
  permission: "cur.course.write",
  input: z.instanceof(FormData),
  handler: async (form, ctx) => {
    const file = await fileFrom(form);
    if (!file)
      throw new DomainError("VALIDATION", "empty", {
        file: ["empty"],
      });
    return commitImport(ctx, file, form.get("updateExisting") === "on");
  },
});
