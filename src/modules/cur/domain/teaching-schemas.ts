import { z } from "zod";
import { MAX_HOURS } from "./course-rules";
import { TEACHING_KINDS } from "./teaching-rules";

const hours = z
  .number({ error: "hoursRange" })
  .int("hoursRange")
  .min(0, "hoursRange")
  .max(MAX_HOURS, "hoursRange");

/** AC-1/AC-3: absent hours mean "the plan course's hours for the kind". */
export const assignmentSchema = z.object({
  groupId: z.string().min(1, "required"),
  planCourseId: z.string().min(1, "required"),
  staffId: z.string().min(1, "required"),
  kind: z.enum(TEACHING_KINDS),
  plannedHours: hours.optional(),
});
export type AssignmentInput = z.infer<typeof assignmentSchema>;

export const updateAssignmentSchema = z.object({
  assignmentId: z.string().min(1),
  staffId: z.string().min(1, "required"),
  plannedHours: hours,
});
export const removeAssignmentSchema = z.object({ assignmentId: z.string().min(1) });
export const copyAssignmentsSchema = z.object({
  fromYearId: z.string().min(1, "required"),
  toYearId: z.string().min(1, "required"),
});
