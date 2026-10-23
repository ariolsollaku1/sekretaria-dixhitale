"use server";

import "../permissions";
import { action } from "@/lib/actions";
import {
  addEnrollmentSchema,
  changeGroupSchema,
  registerStudentSchema,
  updateStudentSchema,
  yearRegistrationSchema,
} from "../domain/schemas";
import * as students from "./student.service";

export const registerStudentAction = action({
  permission: "stu.student.write",
  input: registerStudentSchema,
  handler: (input, ctx) => students.registerStudent(ctx, input),
});
export const updateStudentAction = action({
  permission: "stu.student.write",
  input: updateStudentSchema,
  handler: ({ studentId, ...input }, ctx) => students.updateStudent(ctx, studentId, input),
});
export const addEnrollmentAction = action({
  permission: "stu.student.write",
  input: addEnrollmentSchema,
  handler: ({ studentId, ...input }, ctx) => students.addEnrollment(ctx, studentId, input),
});
export const registerYearAction = action({
  permission: "stu.student.write",
  input: yearRegistrationSchema,
  handler: (input, ctx) => students.registerYear(ctx, input),
});
export const changeGroupAction = action({
  permission: "stu.student.write",
  input: changeGroupSchema,
  handler: ({ yearRegistrationId, groupId }, ctx) =>
    students.changeGroup(ctx, yearRegistrationId, groupId),
});
