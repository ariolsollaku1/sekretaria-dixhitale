"use server";

import "../permissions";
import { action } from "@/lib/actions";
import {
  categorySchema,
  courseSchema,
  idSchema,
  updateCategorySchema,
  updateCourseSchema,
} from "../domain/schemas";
import * as categories from "./category.service";
import * as courses from "./course.service";

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
