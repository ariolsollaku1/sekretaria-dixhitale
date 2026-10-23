"use server";

import "../permissions";
import { action } from "@/lib/actions";
import {
  departmentSchema,
  facultySchema,
  unitIdSchema,
  updateDepartmentSchema,
  updateFacultySchema,
} from "../domain/schemas";
import * as units from "./unit.service";

export const createFacultyAction = action({
  permission: "org.faculty.write",
  input: facultySchema,
  handler: (input, ctx) => units.createFaculty(ctx, input),
});
export const updateFacultyAction = action({
  permission: "org.faculty.write",
  input: updateFacultySchema,
  handler: ({ facultyId, ...input }, ctx) => units.updateFaculty(ctx, facultyId, input),
});
export const deactivateFacultyAction = action({
  permission: "org.faculty.write",
  input: unitIdSchema,
  requireReason: true,
  handler: (input, ctx) => units.deactivateFaculty(ctx, input.id),
});
export const reactivateFacultyAction = action({
  permission: "org.faculty.write",
  input: unitIdSchema,
  requireReason: true,
  handler: (input, ctx) => units.reactivateFaculty(ctx, input.id),
});

export const createDepartmentAction = action({
  permission: "org.department.write",
  input: departmentSchema,
  handler: (input, ctx) => units.createDepartment(ctx, input),
});
export const updateDepartmentAction = action({
  permission: "org.department.write",
  input: updateDepartmentSchema,
  handler: ({ departmentId, ...input }, ctx) => units.updateDepartment(ctx, departmentId, input),
});
export const deactivateDepartmentAction = action({
  permission: "org.department.write",
  input: unitIdSchema,
  requireReason: true,
  handler: (input, ctx) => units.deactivateDepartment(ctx, input.id),
});
export const reactivateDepartmentAction = action({
  permission: "org.department.write",
  input: unitIdSchema,
  requireReason: true,
  handler: (input, ctx) => units.reactivateDepartment(ctx, input.id),
});
