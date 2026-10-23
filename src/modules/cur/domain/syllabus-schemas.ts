import { z } from "zod";

const id = z.string().min(1, "required");
const notes = z.string().trim().max(500, "tooLong").nullish();

/** AC-2 */
export const uploadSyllabusSchema = z.object({
  planCourseId: id,
  academicYearId: id,
  fileId: id,
  notes,
});
/** AC-3 */
export const updateSyllabusSchema = z.object({
  syllabusId: id,
  fileId: z.string().min(1).optional(),
  notes,
});
export const syllabusIdSchema = z.object({ syllabusId: id });
/** AC-7 */
export const carryForwardSchema = z.object({ planId: id, academicYearId: id });
